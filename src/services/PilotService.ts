import {
  PILOT_SCHEMA_VERSION,
  type Classroom,
  type Device,
  type ExerciseSessionRecord,
  type PilotDataPackage,
  type PilotEntities,
  type PilotHistoryFilter,
  type ReviewRecord,
  type ReviewStatus,
  type School,
  type Student,
  type TrainingTask,
} from '../types';

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

type SpreadsheetCell = string | number;
type SpreadsheetRow = SpreadsheetCell[];

class PilotService {
  load(): PilotState {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyState;
    try {
      return { ...emptyState, ...(JSON.parse(raw) as PilotState) };
    } catch {
      return emptyState;
    }
  }

  save(state: PilotState): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

  private buildScoreRows(state: PilotState, sessions: ExerciseSessionRecord[]): SpreadsheetRow[] {
    const headers: SpreadsheetRow = [
      '学生',
      '班级',
      '任务',
      '项目',
      '成绩',
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
      return [
        student?.name || session.studentId || '',
        classroom?.name || session.classId || '',
        task?.name || session.taskId || '',
        session.exerciseType,
        `${review?.overrideScore ?? session.score}${session.scoreUnit}`,
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

function escapeCsv(value: string | number): string {
  const text = String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n') || text.includes('\r')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function createXlsxWorkbook(rows: SpreadsheetRow[]): Uint8Array {
  const files: Array<{ name: string; content: string }> = [
    {
      name: '[Content_Types].xml',
      content:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    },
    {
      name: 'xl/workbook.xml',
      content:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="成绩" sheetId="1" r:id="rId1"/></sheets>' +
        '</workbook>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>',
    },
    {
      name: 'xl/styles.xml',
      content:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        '</styleSheet>',
    },
    {
      name: 'xl/worksheets/sheet1.xml',
      content: createWorksheetXml(rows),
    },
  ];

  return zipStore(files);
}

function createWorksheetXml(rows: SpreadsheetRow[]): string {
  const body = rows
    .map((row, rowIndex) => {
      const rowNumber = rowIndex + 1;
      const cells = row
        .map((cell, columnIndex) => createCellXml(cell, `${columnName(columnIndex)}${rowNumber}`))
        .join('');
      return `<row r="${rowNumber}">${cells}</row>`;
    })
    .join('');

  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${body}</sheetData>` +
    '</worksheet>'
  );
}

function createCellXml(cell: SpreadsheetCell, ref: string): string {
  if (typeof cell === 'number' && Number.isFinite(cell)) {
    return `<c r="${ref}"><v>${cell}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(String(cell))}</t></is></c>`;
}

function columnName(index: number): string {
  let value = '';
  let current = index + 1;
  while (current > 0) {
    const remainder = (current - 1) % 26;
    value = String.fromCharCode(65 + remainder) + value;
    current = Math.floor((current - 1) / 26);
  }
  return value;
}

function zipStore(files: Array<{ name: string; content: string }>): Uint8Array {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const localHeader = createLocalFileHeader(nameBytes, data.length, crc);
    const centralHeader = createCentralDirectoryHeader(nameBytes, data.length, crc, offset);

    localParts.push(localHeader, nameBytes, data);
    centralParts.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + data.length;
  }

  const centralOffset = offset;
  const centralSize = centralParts.reduce((sum, item) => sum + item.length, 0);
  const end = createEndOfCentralDirectory(files.length, centralSize, centralOffset);
  return concatBytes([...localParts, ...centralParts, end]);
}

function createLocalFileHeader(nameBytes: Uint8Array, size: number, crc: number): Uint8Array {
  const header = new Uint8Array(30);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, nameBytes.length, true);
  view.setUint16(28, 0, true);
  return header;
}

function createCentralDirectoryHeader(
  nameBytes: Uint8Array,
  size: number,
  crc: number,
  offset: number,
): Uint8Array {
  const header = new Uint8Array(46);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, nameBytes.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, offset, true);
  return header;
}

function createEndOfCentralDirectory(
  fileCount: number,
  centralSize: number,
  centralOffset: number,
): Uint8Array {
  const end = new Uint8Array(22);
  const view = new DataView(end.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, fileCount, true);
  view.setUint16(10, fileCount, true);
  view.setUint32(12, centralSize, true);
  view.setUint32(16, centralOffset, true);
  view.setUint16(20, 0, true);
  return end;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, item) => sum + item.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function toBlobPart(content: string | Uint8Array): BlobPart {
  if (typeof content === 'string') return content;
  const copy = new Uint8Array(content.byteLength);
  copy.set(content);
  return copy.buffer;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default new PilotService();
export { PilotService };

function getExerciseName(type: TrainingTask['exerciseType']): string {
  switch (type) {
    case 'jump_rope':
      return '跳绳';
    case 'squats':
      return '深蹲';
    case 'sit_ups':
      return '仰卧起坐';
    case 'jumping_jacks':
      return '开合跳';
    default:
      return type;
  }
}
