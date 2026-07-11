import {
  PILOT_SCHEMA_VERSION,
  type Classroom,
  type Device,
  type ExerciseSessionRecord,
  type ExerciseType,
  type PilotDataPackage,
  type PilotEntities,
  type PilotHistoryFilter,
  type ReviewRecord,
  type ReviewStatus,
  type School,
  type Student,
  type TrainingTask,
} from '../types';
import { EXERCISE_NAMES } from '../constants/exerciseConfig';
import { type SpreadsheetRow, createXlsxWorkbook, escapeCsv, toBlobPart } from '../utils/xlsx';
import { scoreSession, type ScoringResult } from './scoring';
import { createStorageAdapter } from './storage/createStorageAdapter';
import type { IStorageAdapter } from './storage/IStorageAdapter';
import ErrorReporter from './ErrorReporter';

const STORAGE_KEY = 'ai_sport_pilot_v1';

export interface PilotState {
  schools: School[];
  classes: Classroom[];
  students: Student[];
  devices: Device[];
  tasks: TrainingTask[];
  sessions: ExerciseSessionRecord[];
  reviews: ReviewRecord[];
}

const emptyState: PilotState = {
  schools: [],
  classes: [],
  students: [],
  devices: [],
  tasks: [],
  sessions: [],
  reviews: [],
};

const officialTaskTypes: Array<TrainingTask['exerciseType']> = [
  'jump_rope',
  'squats',
  'sit_ups',
  'jumping_jacks',
];

class PilotService {
  private storage: IStorageAdapter;
  /** 最近一次通过适配器加载的缓存状态，供 load() 同步返回（MED-4 双路径桥接） */
  private syncCache: PilotState = emptyState;
  private cacheTimestamp = 0;
  /** 缓存有效期（ms）：同步 load() 在此时间内直接返回缓存，避免 localStorage 与适配器数据不一致 */
  private static readonly CACHE_TTL_MS = 2000;

  constructor(storage?: IStorageAdapter) {
    this.storage = storage ?? createStorageAdapter();
  }

  /** 同步读取（兼容旧代码；优先返回异步缓存，降级到 localStorage） */
  load(): PilotState {
    // 如果有新鲜异步缓存，直接返回（确保 Tauri 环境数据一致）
    if (Date.now() - this.cacheTimestamp < PilotService.CACHE_TTL_MS) {
      return this.syncCache;
    }
    // 降级：无缓存时读 localStorage（仅 web 环境有效）
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyState;
      return { ...emptyState, ...(JSON.parse(raw) as PilotState) };
    } catch (err) {
      ErrorReporter.captureError(err, {
        source: 'PilotService',
        action: 'load',
        storageKey: STORAGE_KEY,
      });
      return emptyState;
    }
  }

  /** 异步读取（通过 IStorageAdapter，Tauri 环境下使用 Tauri Store） */
  async loadAsync(): Promise<PilotState> {
    try {
      const raw = await this.storage.get(STORAGE_KEY);
      if (!raw) {
        this.syncCache = emptyState;
        this.cacheTimestamp = Date.now();
        return emptyState;
      }
      this.syncCache = { ...emptyState, ...(JSON.parse(raw) as PilotState) };
      this.cacheTimestamp = Date.now();
      return this.syncCache;
    } catch (err) {
      ErrorReporter.captureError(err, {
        source: 'PilotService',
        action: 'loadAsync',
        storageKey: STORAGE_KEY,
      });
      return emptyState;
    }
  }

  /** 同步保存（兼容旧代码；同时写 localStorage 和适配器，确保双路径一致） */
  save(state: PilotState): void {
    // 更新同步缓存
    this.syncCache = state;
    this.cacheTimestamp = Date.now();
    // 同步写入 localStorage（兼容 load() 降级路径）
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      ErrorReporter.captureError(err, {
        source: 'PilotService',
        action: 'save',
        storageKey: STORAGE_KEY,
        dataSize: JSON.stringify(state).length,
      });
    }
    // 异步写入适配器（fire-and-forget，确保 Tauri 环境持久化）
    this.saveAsync(state).catch(() => {
      /* saveAsync 已自行上报错误，此处仅防止未捕获 rejection */
    });
  }

  /** 异步保存（通过 IStorageAdapter，Tauri 环境下使用 Tauri Store） */
  async saveAsync(state: PilotState): Promise<void> {
    try {
      await this.storage.set(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      ErrorReporter.captureError(err, {
        source: 'PilotService',
        action: 'saveAsync',
        storageKey: STORAGE_KEY,
        dataSize: JSON.stringify(state).length,
      });
    }
  }

  upsertClassroom(
    state: PilotState,
    input: {
      id?: string;
      schoolId?: string;
      name: string;
      grade?: string;
      teacherName?: string;
    },
  ): PilotState {
    const school = state.schools[0] || { id: 'school-default', name: '试点学校' };
    const classroom: Classroom = {
      id: input.id || createId('class'),
      schoolId: input.schoolId || school.id,
      name: input.name.trim(),
      grade: input.grade?.trim() || undefined,
      teacherName: input.teacherName?.trim() || undefined,
    };
    const next: PilotState = {
      ...state,
      schools: state.schools.length > 0 ? state.schools : [school],
      classes: mergeById(state.classes, [classroom]),
    };
    this.save(next);
    return next;
  }

  upsertStudent(
    state: PilotState,
    input: {
      id?: string;
      classId: string;
      name: string;
      studentNo?: string;
      gender?: Student['gender'];
    },
  ): PilotState {
    const classroom = state.classes.find((item) => item.id === input.classId);
    if (!classroom) throw new Error('Classroom not found');
    const student: Student = {
      id: input.id || createId('student'),
      schoolId: classroom.schoolId,
      classId: classroom.id,
      name: input.name.trim(),
      studentNo: input.studentNo?.trim() || undefined,
      gender: input.gender || 'unknown',
    };
    const next = {
      ...state,
      students: mergeById(state.students, [student]),
    };
    this.save(next);
    return next;
  }

  upsertTask(
    state: PilotState,
    input: {
      id?: string;
      classId: string;
      name: string;
      exerciseType: TrainingTask['exerciseType'];
      targetCount?: number;
      targetDurationSec?: number;
      officialScoring?: boolean;
    },
  ): PilotState {
    const classroom = state.classes.find((item) => item.id === input.classId);
    if (!classroom) throw new Error('Classroom not found');
    const task: TrainingTask = {
      id: input.id || createId('task'),
      schoolId: classroom.schoolId,
      classId: classroom.id,
      name: input.name.trim(),
      exerciseType: input.exerciseType,
      targetCount: input.targetCount,
      targetDurationSec: input.targetDurationSec,
      officialScoring: input.officialScoring ?? true,
    };
    const next = {
      ...state,
      tasks: mergeById(state.tasks, [task]),
    };
    this.save(next);
    return next;
  }

  deleteClassroom(
    state: PilotState,
    classId: string,
  ): { state: PilotState; deleted: boolean; reason?: string } {
    const hasLinkedData =
      state.students.some((item) => item.classId === classId) ||
      state.tasks.some((item) => item.classId === classId) ||
      state.sessions.some((item) => item.classId === classId);
    if (hasLinkedData) {
      return { state, deleted: false, reason: '班级下仍有学生、任务或成绩' };
    }
    const next = {
      ...state,
      classes: state.classes.filter((item) => item.id !== classId),
    };
    this.save(next);
    return { state: next, deleted: true };
  }

  deleteStudent(
    state: PilotState,
    studentId: string,
  ): { state: PilotState; deleted: boolean; reason?: string } {
    if (state.sessions.some((item) => item.studentId === studentId)) {
      return { state, deleted: false, reason: '学生已有成绩记录' };
    }
    const next = {
      ...state,
      students: state.students.filter((item) => item.id !== studentId),
    };
    this.save(next);
    return { state: next, deleted: true };
  }

  deleteTask(
    state: PilotState,
    taskId: string,
  ): { state: PilotState; deleted: boolean; reason?: string } {
    if (state.sessions.some((item) => item.taskId === taskId)) {
      return { state, deleted: false, reason: '任务已有成绩记录' };
    }
    const next = {
      ...state,
      tasks: state.tasks.filter((item) => item.id !== taskId),
    };
    this.save(next);
    return { state: next, deleted: true };
  }

  createDemoState(): PilotState {
    const tasks: TrainingTask[] = officialTaskTypes.map((exerciseType) => ({
      id: `task-${exerciseType}`,
      schoolId: 'school-demo',
      classId: 'class-demo-1',
      name: getExerciseName(exerciseType),
      exerciseType,
      targetCount: exerciseType === 'jump_rope' ? 60 : 30,
      targetDurationSec: 60,
      officialScoring: true,
    }));
    const next: PilotState = {
      ...this.load(),
      schools: [{ id: 'school-demo', name: '试点学校' }],
      classes: [
        {
          id: 'class-demo-1',
          schoolId: 'school-demo',
          name: '三年级 1 班',
          grade: '三年级',
          teacherName: '试点教师',
        },
      ],
      students: [
        {
          id: 'student-demo-1',
          schoolId: 'school-demo',
          classId: 'class-demo-1',
          name: '学生 A',
          studentNo: '001',
          gender: 'unknown',
        },
        {
          id: 'student-demo-2',
          schoolId: 'school-demo',
          classId: 'class-demo-1',
          name: '学生 B',
          studentNo: '002',
          gender: 'unknown',
        },
      ],
      devices: [],
      tasks,
    };
    this.save(next);
    return next;
  }

  importPackage(json: string): { state: PilotState; imported: number; skipped: number } {
    const data = JSON.parse(json) as PilotDataPackage;
    this.assertPilotPackage(data);
    const current = this.load();
    const sessionsById = new Map(current.sessions.map((item) => [item.id, item]));
    let imported = 0;
    let skipped = 0;

    for (const session of data.entities.sessions) {
      if (sessionsById.has(session.id)) {
        skipped++;
        continue;
      }
      sessionsById.set(session.id, session);
      imported++;
    }

    const next: PilotState = {
      schools: mergeById(current.schools, data.entities.schools || []),
      classes: mergeById(current.classes, data.entities.classes || []),
      students: mergeById(current.students, data.entities.students || []),
      devices: mergeById(current.devices, data.entities.devices || []),
      tasks: mergeById(current.tasks, data.entities.tasks || []),
      sessions: Array.from(sessionsById.values()).sort(
        (a, b) => new Date(b.endedAt).getTime() - new Date(a.endedAt).getTime(),
      ),
      reviews: mergeById(current.reviews, data.entities.reviews),
    };
    this.save(next);
    return { state: next, imported, skipped };
  }

  exportBasePackage(state: PilotState): PilotDataPackage {
    return {
      schemaVersion: PILOT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      sourceApp: 'desktop',
      algorithmVersion: 'desktop-pilot-v1',
      entities: {
        schools: state.schools,
        classes: state.classes,
        students: state.students,
        devices: state.devices,
        tasks: state.tasks,
        sessions: [],
        reviews: [],
      },
    };
  }

  filterSessions(sessions: ExerciseSessionRecord[], filter: PilotHistoryFilter) {
    return sessions.filter((session) => {
      if (
        filter.exerciseType &&
        filter.exerciseType !== 'all' &&
        session.exerciseType !== filter.exerciseType
      ) {
        return false;
      }
      if (filter.schoolId && session.schoolId !== filter.schoolId) return false;
      if (filter.classId && session.classId !== filter.classId) return false;
      if (filter.studentId && session.studentId !== filter.studentId) return false;
      if (filter.taskId && session.taskId !== filter.taskId) return false;
      return true;
    });
  }

  updateReview(
    state: PilotState,
    sessionRecordId: string,
    patch: { status: ReviewStatus; note?: string; overrideScore?: number },
  ): PilotState {
    const existing = state.reviews.find((item) => item.sessionRecordId === sessionRecordId);
    const review: ReviewRecord = {
      id: existing?.id || `review-${sessionRecordId}`,
      sessionRecordId,
      status: patch.status,
      note: patch.note,
      overrideScore: patch.overrideScore,
      reviewedAt: new Date().toISOString(),
    };
    const next = {
      ...state,
      reviews: [
        ...state.reviews.filter((item) => item.sessionRecordId !== sessionRecordId),
        review,
      ],
    };
    this.save(next);
    return next;
  }

  exportCsv(state: PilotState, sessions: ExerciseSessionRecord[]): string {
    return this.buildScoreRows(state, sessions)
      .map((row) => row.map(escapeCsv).join(','))
      .join('\n');
  }

  exportExcelWorkbook(state: PilotState, sessions: ExerciseSessionRecord[]): Uint8Array {
    return createXlsxWorkbook(this.buildScoreRows(state, sessions));
  }

  download(content: string | Uint8Array, filename: string, mimeType: string): void {
    const blob = new Blob([toBlobPart(content)], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /** 根据成绩记录与（可选）任务目标计算评分结果 */
  scoreSessionRecord(session: ExerciseSessionRecord, task?: TrainingTask): ScoringResult {
    return scoreSession({
      exerciseType: session.exerciseType,
      score: session.score,
      scoreUnit: session.scoreUnit,
      validCount: session.validCount,
      invalidCount: session.invalidCount,
      foulCount: session.foulCount,
      confidence: session.confidence,
      targetCount: task?.targetCount,
      targetCm: task?.targetCm,
    });
  }

  private buildScoreRows(state: PilotState, sessions: ExerciseSessionRecord[]): SpreadsheetRow[] {
    const headers: SpreadsheetRow = [
      '学生',
      '班级',
      '任务',
      '项目',
      '成绩',
      '评级',
      '达标',
      '动作质量',
      '综合分',
      '用时',
      '有效',
      '无效',
      '犯规',
      '置信度',
      '设备',
      '算法版本',
      '复核状态',
      '复核成绩',
      '备注',
    ];
    const rows: SpreadsheetRow[] = sessions.map((session) => {
      const student = state.students.find((item) => item.id === session.studentId);
      const classroom = state.classes.find((item) => item.id === session.classId);
      const task = state.tasks.find((item) => item.id === session.taskId);
      const review = state.reviews.find((item) => item.sessionRecordId === session.id);
      const scoring = this.scoreSessionRecord(session, task);
      return [
        student?.name || session.studentId || '',
        classroom?.name || session.classId || '',
        task?.name || session.taskId || '',
        session.exerciseType,
        `${review?.overrideScore ?? session.score}${session.scoreUnit}`,
        scoring.ratingLabel,
        scoring.passed ? '达标' : '未达标',
        scoring.qualityLabel,
        scoring.compositeScore,
        session.durationSec,
        session.validCount,
        session.invalidCount,
        session.foulCount,
        session.confidence,
        session.deviceInfo || session.deviceId || '',
        session.algorithmVersion,
        review?.status || 'normal',
        review?.overrideScore ?? '',
        review?.note || '',
      ];
    });
    return [headers, ...rows];
  }

  private assertPilotPackage(data: PilotDataPackage): asserts data is PilotDataPackage {
    if (data?.schemaVersion !== PILOT_SCHEMA_VERSION || !data.entities) {
      throw new Error('Invalid pilot-v1 package');
    }
    const entities = data.entities as PilotEntities;
    if (!Array.isArray(entities.sessions)) {
      throw new Error('Pilot package missing sessions');
    }
  }
}

function mergeById<T extends { id: string }>(a: T[], b: T[]): T[] {
  const map = new Map(a.map((item) => [item.id, item]));
  for (const item of b) {
    map.set(item.id, item);
  }
  return Array.from(map.values());
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default new PilotService();
export { PilotService };

function getExerciseName(type: TrainingTask['exerciseType']): string {
  // 使用统一的 EXERCISE_NAMES 常量，避免硬编码运动名导致 DRY 违规
  return EXERCISE_NAMES[type as ExerciseType] ?? type;
}
