import { type ChangeEvent, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EXERCISE_CONFIGS, EXERCISE_NAMES } from '../constants/exerciseConfig';
import PilotService, { type PilotState } from '../services/PilotService';
import type { ExerciseType, PilotHistoryFilter, ReviewStatus } from '../types';
import './TeacherPage.css';
import ErrorReporter from '../services/ErrorReporter';

const ALL_EXERCISES: Array<{ value: ExerciseType | 'all'; label: string }> = [
  { value: 'all', label: '全部项目' },
  ...EXERCISE_CONFIGS.map((item) => ({ value: item.type, label: item.name })),
];

export default function TeacherPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<PilotState>(() => PilotService.load());
  const [importText, setImportText] = useState('');
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState<PilotHistoryFilter>({ exerciseType: 'all' });
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [classForm, setClassForm] = useState({ name: '', grade: '', teacherName: '' });
  const [studentForm, setStudentForm] = useState({ classId: '', name: '', studentNo: '' });
  const [taskForm, setTaskForm] = useState({
    classId: '',
    name: '',
    exerciseType: 'jump_rope' as ExerciseType,
    targetCount: '60',
    targetDurationSec: '60',
  });

  useEffect(() => {
    setState(PilotService.load());
  }, []);

  const filteredSessions = useMemo(
    () => PilotService.filterSessions(state.sessions, filter),
    [state.sessions, filter],
  );

  const importPackageText = (json: string) => {
    try {
      const result = PilotService.importPackage(json);
      setState(result.state);
      setImportText('');
      setMessage(`导入 ${result.imported} 条，跳过 ${result.skipped} 条重复记录`);
    } catch (err) {
      ErrorReporter.captureWarning('教师端导入数据包失败', {
        source: 'TeacherPage',
        error: err instanceof Error ? err.message : '导入失败',
      });
      setMessage(err instanceof Error ? err.message : '导入失败');
    }
  };

  const importPackage = () => {
    importPackageText(importText);
  };

  const importPackageFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      setImportText(text);
      importPackageText(text);
    } catch (err) {
      ErrorReporter.captureWarning('教师端读取数据包文件失败', {
        source: 'TeacherPage',
        error: err instanceof Error ? err.message : '读取文件失败',
      });
      setMessage(err instanceof Error ? err.message : '读取文件失败');
    }
  };

  const updateReview = (sessionId: string, status: ReviewStatus, overrideScore?: number) => {
    const next = PilotService.updateReview(state, sessionId, {
      status,
      overrideScore,
      note: reviewNotes[sessionId],
    });
    setState(next);
  };

  const createDemoClass = () => {
    const next = PilotService.createDemoState();
    setState(next);
    setMessage('已初始化试点班级、学生和任务');
  };

  const addClassroom = () => {
    if (!classForm.name.trim()) {
      setMessage('请输入班级名称');
      return;
    }
    const next = PilotService.upsertClassroom(state, classForm);
    setState(next);
    setClassForm({ name: '', grade: '', teacherName: '' });
    setMessage('班级已保存');
  };

  const addStudent = () => {
    const classId = studentForm.classId || state.classes[0]?.id;
    if (!classId || !studentForm.name.trim()) {
      setMessage('请先选择班级并输入学生姓名');
      return;
    }
    const next = PilotService.upsertStudent(state, {
      classId,
      name: studentForm.name,
      studentNo: studentForm.studentNo,
    });
    setState(next);
    setStudentForm((prev) => ({ ...prev, name: '', studentNo: '' }));
    setMessage('学生已保存');
  };

  const addTask = () => {
    const classId = taskForm.classId || state.classes[0]?.id;
    if (!classId || !taskForm.name.trim()) {
      setMessage('请先选择班级并输入任务名称');
      return;
    }
    const next = PilotService.upsertTask(state, {
      classId,
      name: taskForm.name,
      exerciseType: taskForm.exerciseType,
      targetCount: Number(taskForm.targetCount) || undefined,
      targetDurationSec: Number(taskForm.targetDurationSec) || undefined,
    });
    setState(next);
    setTaskForm((prev) => ({ ...prev, name: '' }));
    setMessage('任务已保存');
  };

  const deleteClassroom = (classId: string) => {
    const result = PilotService.deleteClassroom(state, classId);
    setState(result.state);
    setMessage(result.deleted ? '班级已删除' : result.reason || '班级删除失败');
  };

  const deleteStudent = (studentId: string) => {
    const result = PilotService.deleteStudent(state, studentId);
    setState(result.state);
    setMessage(result.deleted ? '学生已删除' : result.reason || '学生删除失败');
  };

  const deleteTask = (taskId: string) => {
    const result = PilotService.deleteTask(state, taskId);
    setState(result.state);
    setMessage(result.deleted ? '任务已删除' : result.reason || '任务删除失败');
  };

  const downloadBasePackage = () => {
    PilotService.download(
      JSON.stringify(PilotService.exportBasePackage(state), null, 2),
      'ai-sport-pilot-base-package.json',
      'application/json;charset=utf-8',
    );
  };

  const downloadCsv = () => {
    PilotService.download(
      PilotService.exportCsv(state, filteredSessions),
      'ai-sport-pilot-results.csv',
      'text/csv;charset=utf-8',
    );
  };

  const downloadExcel = () => {
    PilotService.download(
      PilotService.exportExcelWorkbook(state, filteredSessions),
      'ai-sport-pilot-results.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
  };

  return (
    <div className="teacher-page">
      <header className="teacher-topbar">
        <button type="button" className="teacher-icon-btn" onClick={() => navigate('/')}>
          ←
        </button>
        <div>
          <h1>校园试点</h1>
          <p>班级、学生、任务、成绩复核</p>
        </div>
        <div className="teacher-actions">
          <button type="button" onClick={createDemoClass}>
            初始化
          </button>
          <button
            type="button"
            onClick={downloadBasePackage}
            disabled={state.students.length === 0}
          >
            基础包
          </button>
          <button type="button" onClick={downloadCsv} disabled={filteredSessions.length === 0}>
            CSV
          </button>
          <button type="button" onClick={downloadExcel} disabled={filteredSessions.length === 0}>
            Excel
          </button>
        </div>
      </header>

      <main className="teacher-layout">
        <section className="teacher-panel teacher-import">
          <h2>导入成绩包</h2>
          <input
            className="teacher-file-input"
            type="file"
            accept="application/json,.json"
            onChange={importPackageFile}
          />
          <textarea
            value={importText}
            onChange={(event) => setImportText(event.target.value)}
            placeholder='粘贴移动端导出的 {"schemaVersion":"pilot-v1"} JSON'
          />
          <button type="button" onClick={importPackage} disabled={!importText.trim()}>
            导入 pilot-v1
          </button>
          {message && <p className="teacher-message">{message}</p>}
        </section>

        <section className="teacher-panel teacher-summary">
          <Metric label="班级" value={state.classes.length} />
          <Metric label="学生" value={state.students.length} />
          <Metric label="任务" value={state.tasks.length} />
          <Metric label="成绩" value={state.sessions.length} />
        </section>

        <section className="teacher-panel teacher-admin">
          <div className="teacher-admin-column">
            <h2>班级</h2>
            <input
              value={classForm.name}
              onChange={(event) => setClassForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="班级名称"
            />
            <input
              value={classForm.grade}
              onChange={(event) => setClassForm((prev) => ({ ...prev, grade: event.target.value }))}
              placeholder="年级"
            />
            <input
              value={classForm.teacherName}
              onChange={(event) =>
                setClassForm((prev) => ({ ...prev, teacherName: event.target.value }))
              }
              placeholder="任课教师"
            />
            <button type="button" onClick={addClassroom}>
              保存班级
            </button>
            <EntityList
              items={state.classes.map((item) => ({
                id: item.id,
                label: item.name,
                meta: [item.grade, item.teacherName].filter(Boolean).join(' · '),
              }))}
              onDelete={deleteClassroom}
            />
          </div>

          <div className="teacher-admin-column">
            <h2>学生</h2>
            <select
              value={studentForm.classId || state.classes[0]?.id || ''}
              onChange={(event) =>
                setStudentForm((prev) => ({ ...prev, classId: event.target.value }))
              }
            >
              {state.classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <input
              value={studentForm.name}
              onChange={(event) =>
                setStudentForm((prev) => ({ ...prev, name: event.target.value }))
              }
              placeholder="学生姓名"
            />
            <input
              value={studentForm.studentNo}
              onChange={(event) =>
                setStudentForm((prev) => ({ ...prev, studentNo: event.target.value }))
              }
              placeholder="学号"
            />
            <button type="button" onClick={addStudent}>
              保存学生
            </button>
            <EntityList
              items={state.students.map((item) => ({
                id: item.id,
                label: item.name,
                meta: [item.studentNo, state.classes.find((c) => c.id === item.classId)?.name]
                  .filter(Boolean)
                  .join(' · '),
              }))}
              onDelete={deleteStudent}
            />
          </div>

          <div className="teacher-admin-column">
            <h2>任务</h2>
            <select
              value={taskForm.classId || state.classes[0]?.id || ''}
              onChange={(event) =>
                setTaskForm((prev) => ({ ...prev, classId: event.target.value }))
              }
            >
              {state.classes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <select
              value={taskForm.exerciseType}
              onChange={(event) =>
                setTaskForm((prev) => ({
                  ...prev,
                  exerciseType: event.target.value as ExerciseType,
                }))
              }
            >
              {EXERCISE_CONFIGS.map((item) => (
                <option key={item.type} value={item.type}>
                  {item.name}
                </option>
              ))}
            </select>
            <input
              value={taskForm.name}
              onChange={(event) => setTaskForm((prev) => ({ ...prev, name: event.target.value }))}
              placeholder="任务名称"
            />
            <div className="teacher-admin-inline">
              <input
                value={taskForm.targetCount}
                onChange={(event) =>
                  setTaskForm((prev) => ({ ...prev, targetCount: event.target.value }))
                }
                placeholder="目标次数"
              />
              <input
                value={taskForm.targetDurationSec}
                onChange={(event) =>
                  setTaskForm((prev) => ({ ...prev, targetDurationSec: event.target.value }))
                }
                placeholder="目标秒数"
              />
            </div>
            <button type="button" onClick={addTask}>
              保存任务
            </button>
            <EntityList
              items={state.tasks.map((item) => ({
                id: item.id,
                label: item.name,
                meta: [
                  EXERCISE_NAMES[item.exerciseType],
                  state.classes.find((c) => c.id === item.classId)?.name,
                ]
                  .filter(Boolean)
                  .join(' · '),
              }))}
              onDelete={deleteTask}
            />
          </div>
        </section>

        <section className="teacher-panel teacher-filters">
          <select
            value={filter.classId || 'all'}
            onChange={(event) =>
              setFilter((prev) => ({
                ...prev,
                classId: event.target.value === 'all' ? undefined : event.target.value,
              }))
            }
          >
            <option value="all">全部班级</option>
            {state.classes.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            value={filter.studentId || 'all'}
            onChange={(event) =>
              setFilter((prev) => ({
                ...prev,
                studentId: event.target.value === 'all' ? undefined : event.target.value,
              }))
            }
          >
            <option value="all">全部学生</option>
            {state.students.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            value={filter.taskId || 'all'}
            onChange={(event) =>
              setFilter((prev) => ({
                ...prev,
                taskId: event.target.value === 'all' ? undefined : event.target.value,
              }))
            }
          >
            <option value="all">全部任务</option>
            {state.tasks.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            value={filter.exerciseType || 'all'}
            onChange={(event) =>
              setFilter((prev) => ({
                ...prev,
                exerciseType: event.target.value as ExerciseType | 'all',
              }))
            }
          >
            {ALL_EXERCISES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </section>

        <section className="teacher-table-wrap">
          <table className="teacher-table">
            <thead>
              <tr>
                <th>学生</th>
                <th>班级</th>
                <th>任务</th>
                <th>项目</th>
                <th>成绩</th>
                <th>评级</th>
                <th>综合分</th>
                <th>有效/无效/犯规</th>
                <th>置信度</th>
                <th>设备</th>
                <th>复核</th>
              </tr>
            </thead>
            <tbody>
              {filteredSessions.map((session) => {
                const student = state.students.find((item) => item.id === session.studentId);
                const classroom = state.classes.find((item) => item.id === session.classId);
                const task = state.tasks.find((item) => item.id === session.taskId);
                const review = state.reviews.find((item) => item.sessionRecordId === session.id);
                return (
                  <tr key={session.id}>
                    <td>{student?.name || session.studentId || '-'}</td>
                    <td>{classroom?.name || session.classId || '-'}</td>
                    <td>{task?.name || session.taskId || '-'}</td>
                    <td>{EXERCISE_NAMES[session.exerciseType]}</td>
                    <td>
                      <strong>{review?.overrideScore ?? session.score}</strong>
                      {session.scoreUnit}
                      <small>{session.durationSec}s</small>
                    </td>
                    <td>
                      {(() => {
                        const scoring = PilotService.scoreSessionRecord(session, task);
                        return (
                          <span className={`rating-badge rating-badge--${scoring.rating}`}>
                            {scoring.ratingLabel}
                            {!scoring.passed && <small> · 未达标</small>}
                          </span>
                        );
                      })()}
                    </td>
                    <td>
                      <strong>
                        {PilotService.scoreSessionRecord(session, task).compositeScore}
                      </strong>
                    </td>
                    <td>
                      {session.validCount}/{session.invalidCount}/{session.foulCount}
                    </td>
                    <td>{Math.round(session.confidence * 100)}%</td>
                    <td>
                      {session.deviceInfo || session.deviceId || '-'}
                      <small>{session.algorithmVersion}</small>
                    </td>
                    <td className="teacher-review-cell">
                      <select
                        value={review?.status || 'normal'}
                        onChange={(event) =>
                          updateReview(session.id, event.target.value as ReviewStatus)
                        }
                      >
                        <option value="normal">normal</option>
                        <option value="suspicious">suspicious</option>
                        <option value="reviewed">reviewed</option>
                      </select>
                      <input
                        value={reviewNotes[session.id] ?? review?.note ?? ''}
                        onChange={(event) =>
                          setReviewNotes((prev) => ({
                            ...prev,
                            [session.id]: event.target.value,
                          }))
                        }
                        placeholder="复核备注"
                      />
                      <button
                        type="button"
                        onClick={() => updateReview(session.id, 'reviewed', session.score)}
                      >
                        复核
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredSessions.length === 0 && (
                <tr>
                  <td colSpan={11} className="teacher-empty">
                    暂无成绩，先导入移动端 pilot-v1 数据包
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="teacher-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EntityList({
  items,
  onDelete,
}: {
  items: Array<{ id: string; label: string; meta?: string }>;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="teacher-entity-list">
      {items.map((item) => (
        <div key={item.id} className="teacher-entity-row">
          <span>
            <strong>{item.label}</strong>
            {item.meta ? <small>{item.meta}</small> : null}
          </span>
          <button type="button" onClick={() => onDelete(item.id)}>
            删除
          </button>
        </div>
      ))}
    </div>
  );
}
