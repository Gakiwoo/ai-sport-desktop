import { beforeEach, describe, expect, it } from 'vitest';
import { PilotService } from './PilotService';
import type { PilotDataPackage, PilotHistoryFilter } from '../types';

function dataPackage(): PilotDataPackage {
  return {
    schemaVersion: 'pilot-v1',
    exportedAt: '2026-07-01T08:00:00.000Z',
    sourceApp: 'mobile',
    algorithmVersion: 'mobile-pose-v1',
    entities: {
      schools: [{ id: 'school-demo', name: '试点学校' }],
      classes: [{ id: 'class-demo-1', schoolId: 'school-demo', name: '三年级 1 班' }],
      students: [
        {
          id: 'student-demo-1',
          schoolId: 'school-demo',
          classId: 'class-demo-1',
          name: '学生 A',
        },
      ],
      devices: [{ id: 'mobile-ios', label: 'iPad', platform: 'ios' }],
      tasks: [
        {
          id: 'task-jump_rope',
          schoolId: 'school-demo',
          classId: 'class-demo-1',
          name: '跳绳',
          exerciseType: 'jump_rope',
          officialScoring: true,
        },
      ],
      sessions: [
        {
          id: 'session-1',
          schoolId: 'school-demo',
          classId: 'class-demo-1',
          studentId: 'student-demo-1',
          taskId: 'task-jump_rope',
          exerciseType: 'jump_rope',
          startedAt: '2026-07-01T08:00:00.000Z',
          endedAt: '2026-07-01T08:00:45.000Z',
          durationSec: 45,
          score: 60,
          scoreUnit: 'reps',
          validCount: 58,
          invalidCount: 2,
          foulCount: 0,
          confidence: 0.91,
          deviceId: 'mobile-ios',
          deviceInfo: 'iPad',
          algorithmVersion: 'mobile-pose-v1',
        },
      ],
      reviews: [],
    },
  };
}

describe('PilotService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('imports pilot-v1 packages and skips duplicates', () => {
    const service = new PilotService();

    const first = service.importPackage(JSON.stringify(dataPackage()));
    const second = service.importPackage(JSON.stringify(dataPackage()));

    expect(first.imported).toBe(1);
    expect(second.imported).toBe(0);
    expect(second.skipped).toBe(1);
    expect(second.state.sessions).toHaveLength(1);
  });

  it('filters sessions and persists review state', () => {
    const service = new PilotService();
    const imported = service.importPackage(JSON.stringify(dataPackage())).state;
    const filter: PilotHistoryFilter = {
      classId: 'class-demo-1',
      studentId: 'student-demo-1',
      taskId: 'task-jump_rope',
      exerciseType: 'jump_rope',
    };

    expect(service.filterSessions(imported.sessions, filter)).toHaveLength(1);

    const reviewed = service.updateReview(imported, 'session-1', {
      status: 'reviewed',
      note: '人工复核通过',
      overrideScore: 59,
    });

    expect(reviewed.reviews[0]).toMatchObject({
      sessionRecordId: 'session-1',
      status: 'reviewed',
      note: '人工复核通过',
      overrideScore: 59,
    });
  });

  it('exports teacher score fields to CSV', () => {
    const service = new PilotService();
    const state = service.importPackage(JSON.stringify(dataPackage())).state;

    const csv = service.exportCsv(state, state.sessions);

    expect(csv).toContain('学生,班级,任务,项目,成绩,用时');
    expect(csv).toContain('学生 A');
    expect(csv).toContain('mobile-pose-v1');
  });

  it('exports teacher score fields to a real xlsx workbook', () => {
    const service = new PilotService();
    const state = service.importPackage(JSON.stringify(dataPackage())).state;

    const workbook = service.exportExcelWorkbook(state, state.sessions);
    const workbookText = new TextDecoder().decode(workbook);

    expect(workbook[0]).toBe(0x50);
    expect(workbook[1]).toBe(0x4b);
    expect(workbookText).toContain('xl/worksheets/sheet1.xml');
    expect(workbookText).toContain('成绩');
    expect(workbookText).toContain('学生');
    expect(workbookText).toContain('mobile-pose-v1');
  });

  it('creates and exports a desktop base pilot package', () => {
    const service = new PilotService();

    const state = service.createDemoState();
    const basePackage = service.exportBasePackage(state);

    expect(basePackage.schemaVersion).toBe('pilot-v1');
    expect(basePackage.sourceApp).toBe('desktop');
    expect(basePackage.entities.students).toHaveLength(2);
    expect(basePackage.entities.tasks.map((task) => task.exerciseType)).toEqual([
      'jump_rope',
      'squats',
      'sit_ups',
      'jumping_jacks',
    ]);
    expect(basePackage.entities.sessions).toHaveLength(0);
  });

  it('creates local classrooms, students and training tasks', () => {
    const service = new PilotService();

    let state = service.upsertClassroom(service.load(), {
      name: '四年级 2 班',
      grade: '四年级',
      teacherName: '王老师',
    });
    const classroom = state.classes[0];

    expect(state.schools[0]).toMatchObject({ name: '试点学校' });
    expect(classroom).toMatchObject({
      name: '四年级 2 班',
      grade: '四年级',
      teacherName: '王老师',
    });

    state = service.upsertStudent(state, {
      classId: classroom.id,
      name: '学生 C',
      studentNo: '003',
    });
    expect(state.students[0]).toMatchObject({
      classId: classroom.id,
      name: '学生 C',
      studentNo: '003',
      gender: 'unknown',
    });

    state = service.upsertTask(state, {
      classId: classroom.id,
      name: '深蹲 30 次',
      exerciseType: 'squats',
      targetCount: 30,
      targetDurationSec: 60,
    });
    expect(state.tasks[0]).toMatchObject({
      classId: classroom.id,
      name: '深蹲 30 次',
      exerciseType: 'squats',
      targetCount: 30,
      targetDurationSec: 60,
      officialScoring: true,
    });
    expect(service.load().tasks).toHaveLength(1);
  });

  it('protects linked pilot entities and deletes unlinked entities', () => {
    const service = new PilotService();
    let state = service.importPackage(JSON.stringify(dataPackage())).state;

    expect(service.deleteStudent(state, 'student-demo-1')).toMatchObject({ deleted: false });
    expect(service.deleteTask(state, 'task-jump_rope')).toMatchObject({ deleted: false });
    expect(service.deleteClassroom(state, 'class-demo-1')).toMatchObject({ deleted: false });

    state = service.upsertClassroom(state, { name: '临时班' });
    const tempClass = state.classes.find((item) => item.name === '临时班');
    expect(tempClass).toBeTruthy();

    state = service.upsertStudent(state, {
      classId: tempClass!.id,
      name: '临时学生',
      studentNo: '099',
    });
    const tempStudent = state.students.find((item) => item.name === '临时学生');
    expect(tempStudent).toBeTruthy();

    state = service.upsertTask(state, {
      classId: tempClass!.id,
      name: '临时任务',
      exerciseType: 'jumping_jacks',
    });
    const tempTask = state.tasks.find((item) => item.name === '临时任务');
    expect(tempTask).toBeTruthy();

    const studentResult = service.deleteStudent(state, tempStudent!.id);
    expect(studentResult.deleted).toBe(true);
    state = studentResult.state;

    const taskResult = service.deleteTask(state, tempTask!.id);
    expect(taskResult.deleted).toBe(true);
    state = taskResult.state;

    const classResult = service.deleteClassroom(state, tempClass!.id);
    expect(classResult.deleted).toBe(true);
    expect(classResult.state.classes.some((item) => item.id === tempClass!.id)).toBe(false);
  });
});
