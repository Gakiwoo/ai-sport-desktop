import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  Legend,
} from 'recharts';
import { apiClient } from '../services/ApiClient';
import { EXERCISE_CONFIGS, EXERCISE_COLORS, EXERCISE_NAMES } from '../constants/exerciseConfig';
import { useTheme } from '../hooks/useTheme';
import type { ExerciseType } from '../types';
import ClassSummaryCard from '../components/report/ClassSummaryCard';
import StudentRanking, { type StudentRankEntry } from '../components/report/StudentRanking';
import './ReportPage.css';

/* ── 类型 ───────────────────────────────────────────── */

type ExerciseFilter = ExerciseType | 'all';
type StudentTrend = 'improving' | 'declining' | 'stable';

interface ClassOption {
  id: string;
  name: string;
  grade?: string;
}

interface StudentStat {
  studentId: string;
  studentName: string;
  avgScore: number;
  sessions: number;
  trend: StudentTrend;
}

interface ClassSummaryData {
  avgScore: number;
  completionRate: number; // 0-100
  totalSessions: number;
  activeStudents: number;
  totalStudents: number;
  scoreTrendPct: number | null;
  completionTrendPct: number | null;
  sessionsTrendPct: number | null;
  students: StudentStat[];
}

interface ProgressPoint {
  label: string;
  score: number;
}

interface StudentProgressData {
  studentId: string;
  studentName: string;
  points: ProgressPoint[];
}

const EXERCISE_FILTER_OPTIONS: Array<{ value: ExerciseFilter; label: string }> = [
  { value: 'all', label: '全部项目' },
  ...EXERCISE_CONFIGS.map((item) => ({ value: item.type, label: item.name })),
];

/* ── 后端返回值的防御性解析（兼容 snake_case/camelCase 及类型化响应） ── */

function pick(obj: object, keys: string[]): unknown {
  const record = obj as Record<string, unknown>;
  for (const key of keys) {
    const v = record[key];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function toNum(v: unknown, fallback = 0): number {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : fallback;
}

function toStr(v: unknown, fallback = ''): string {
  return typeof v === 'string' && v.length > 0 ? v : fallback;
}

function toTrend(v: unknown): StudentTrend {
  const s = typeof v === 'string' ? v.toLowerCase() : '';
  if (s === 'improving' || s === 'up' || s === 'rising') return 'improving';
  if (s === 'declining' || s === 'down' || s === 'falling') return 'declining';
  return 'stable';
}

function toTrendPct(v: unknown): number | null {
  const n = toNum(v, Number.NaN);
  return Number.isFinite(n) ? n : null;
}

function parseClassSummary(raw: object, studentNames: Map<string, string>): ClassSummaryData {
  let completionRate = toNum(pick(raw, ['completionRate', 'completion_rate', 'completion']), 0);
  if (completionRate > 0 && completionRate <= 1) completionRate *= 100;

  const rawStudents = pick(raw, ['students', 'studentStats', 'ranking', 'perStudent']);
  const students: StudentStat[] = Array.isArray(rawStudents)
    ? rawStudents
        .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === 'object')
        .map((s) => {
          const studentId = toStr(pick(s, ['studentId', 'student_id', 'id']));
          return {
            studentId,
            studentName:
              toStr(pick(s, ['studentName', 'student_name', 'name'])) ||
              studentNames.get(studentId) ||
              '未知学生',
            avgScore: toNum(pick(s, ['avgScore', 'avg_score', 'averageScore', 'score'])),
            sessions: toNum(pick(s, ['sessions', 'sessionCount', 'count'])),
            trend: toTrend(pick(s, ['trend', 'scoreTrend', 'direction'])),
          };
        })
        .sort((a, b) => b.avgScore - a.avgScore)
    : [];

  return {
    avgScore: toNum(pick(raw, ['avgScore', 'avg_score', 'averageScore'])),
    completionRate,
    totalSessions: toNum(
      pick(raw, ['totalSessions', 'total_sessions', 'sessionCount', 'sessions']),
    ),
    activeStudents: toNum(pick(raw, ['activeStudents', 'active_students', 'activeStudentCount'])),
    totalStudents: toNum(pick(raw, ['totalStudents', 'total_students', 'studentCount'])),
    scoreTrendPct: toTrendPct(pick(raw, ['scoreTrend', 'avgScoreTrend', 'scoreTrendPct'])),
    completionTrendPct: toTrendPct(pick(raw, ['completionTrend', 'completionTrendPct'])),
    sessionsTrendPct: toTrendPct(pick(raw, ['sessionsTrend', 'sessionsTrendPct'])),
    students,
  };
}

/** 日期格式化为 M/D（兼容 ISO 字符串 / 时间戳 / 已格式化字符串） */
function formatPointLabel(v: unknown): string {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = new Date(v);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  const s = toStr(v);
  if (!s) return '';
  const d = new Date(s);
  if (!Number.isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(s)) {
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }
  return s;
}

function parseStudentProgress(raw: object): StudentProgressData {
  const rawPoints = pick(raw, ['points', 'progress', 'records', 'sessions', 'history']);
  const points: ProgressPoint[] = Array.isArray(rawPoints)
    ? rawPoints
        .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === 'object')
        .map((p) => ({
          label: formatPointLabel(pick(p, ['date', 'day', 'timestamp', 'label'])),
          score: toNum(pick(p, ['score', 'avgScore', 'value'])),
        }))
        .filter((p) => p.label.length > 0)
    : [];

  return {
    studentId: toStr(pick(raw, ['studentId', 'student_id', 'id'])),
    studentName: toStr(pick(raw, ['studentName', 'student_name', 'name'])),
    points,
  };
}

function trendFromPct(
  pct: number | null,
): { direction: 'up' | 'down' | 'flat'; percentage: number } | undefined {
  if (pct === null) return undefined;
  return {
    direction: pct > 0.05 ? 'up' : pct < -0.05 ? 'down' : 'flat',
    percentage: Math.abs(pct),
  };
}

/* ── 页面组件 ───────────────────────────────────────── */

export default function ReportPage() {
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [selectedExerciseType, setSelectedExerciseType] = useState<ExerciseFilter>('all');

  const [classSummary, setClassSummary] = useState<ClassSummaryData | null>(null);
  const [studentProgress, setStudentProgress] = useState<StudentProgressData | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const [classesLoading, setClassesLoading] = useState(true);
  const [classesError, setClassesError] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressError, setProgressError] = useState<string | null>(null);

  /* 重试按钮：递增以重新触发班级汇总请求 */
  const [summaryReloadKey, setSummaryReloadKey] = useState(0);

  /* 竞态保护：仅采纳最新一次请求的结果 */
  const summarySeq = useRef(0);
  const progressSeq = useRef(0);

  /* 图表颜色自适应深色模式 */
  const gridColor = useMemo(() => (isDark ? 'rgba(255,255,255,0.08)' : '#f0f0f0'), [isDark]);
  const tickColor = useMemo(() => (isDark ? '#98989d' : '#8e8e93'), [isDark]);
  const tooltipStyle: React.CSSProperties = useMemo(
    () =>
      isDark
        ? {
            borderRadius: 12,
            border: 'none',
            boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            background: '#1c1c1e',
            color: '#f5f5f7',
          }
        : {
            borderRadius: 12,
            border: 'none',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            background: '#fff',
            color: '#1c1c1e',
          },
    [isDark],
  );
  const brandColor = useMemo(() => (isDark ? '#0A84FF' : '#007AFF'), [isDark]);
  const chartColor =
    selectedExerciseType !== 'all' ? EXERCISE_COLORS[selectedExerciseType] : brandColor;

  /* 1) 加载班级列表 */
  const loadClasses = useCallback(() => {
    setClassesLoading(true);
    setClassesError(null);
    apiClient
      .listClassrooms()
      .then((list) => {
        // list 已由 ApiClient 类型化为 Classroom[]；pick() 兼容 snake/camel 两种字段名
        const options: ClassOption[] = list
          .map((c) => ({
            id: toStr(pick(c, ['id', 'classId'])),
            name: toStr(pick(c, ['name', 'className']), '未命名班级'),
            grade: toStr(pick(c, ['grade'])),
          }))
          .filter((c) => c.id.length > 0);
        setClasses(options);
        setSelectedClassId((prev) => prev || options[0]?.id || '');
      })
      .catch((err) => {
        console.error('加载班级列表失败:', err);
        setClassesError('班级列表加载失败，请检查后端服务后重试');
      })
      .finally(() => setClassesLoading(false));
  }, []);

  useEffect(() => {
    loadClasses();
  }, [loadClasses]);

  /* 2) 班级 / 项目变化时加载班级汇总 + 学生名单 */
  useEffect(() => {
    if (!selectedClassId) return;
    const seq = ++summarySeq.current;
    setSummaryLoading(true);
    setSummaryError(null);
    setClassSummary(null);
    setStudentProgress(null);
    setSelectedStudentId(null);

    const exerciseParam = selectedExerciseType !== 'all' ? selectedExerciseType : undefined;

    Promise.all([
      apiClient.getClassSummary(selectedClassId, exerciseParam),
      apiClient.listStudents(selectedClassId).catch(() => []),
    ])
      .then(([summaryRaw, studentList]) => {
        if (seq !== summarySeq.current) return;
        const names = new Map<string, string>();
        for (const s of studentList) {
          if (!s || typeof s !== 'object') continue;
          const id = toStr(pick(s, ['id', 'studentId']));
          const name = toStr(pick(s, ['name', 'studentName']));
          if (id && name) names.set(id, name);
        }
        const summary = parseClassSummary(summaryRaw, names);
        setClassSummary(summary);
        /* 自动选中第一名，立即展示进步趋势 */
        setSelectedStudentId(summary.students[0]?.studentId ?? null);
      })
      .catch((err) => {
        if (seq !== summarySeq.current) return;
        console.error('加载班级汇总失败:', err);
        setSummaryError('报告数据加载失败，请稍后重试');
      })
      .finally(() => {
        if (seq === summarySeq.current) setSummaryLoading(false);
      });
  }, [selectedClassId, selectedExerciseType, summaryReloadKey]);

  /* 3) 选中学生变化时加载进步趋势 */
  useEffect(() => {
    if (!selectedStudentId) return;
    const seq = ++progressSeq.current;
    setProgressLoading(true);
    setProgressError(null);
    setStudentProgress(null);

    const exerciseParam = selectedExerciseType !== 'all' ? selectedExerciseType : undefined;
    apiClient
      .getStudentProgress(selectedStudentId, exerciseParam)
      .then((raw) => {
        if (seq !== progressSeq.current) return;
        setStudentProgress(parseStudentProgress(raw));
      })
      .catch((err) => {
        if (seq !== progressSeq.current) return;
        console.error('加载学生进步趋势失败:', err);
        setProgressError('进步趋势加载失败');
      })
      .finally(() => {
        if (seq === progressSeq.current) setProgressLoading(false);
      });
  }, [selectedStudentId, selectedExerciseType]);

  /* 派生数据 */
  const rankingEntries: StudentRankEntry[] = useMemo(
    () =>
      (classSummary?.students ?? []).map((s, i) => ({
        rank: i + 1,
        studentId: s.studentId,
        studentName: s.studentName,
        avgScore: s.avgScore,
        sessions: s.sessions,
        trend: s.trend,
      })),
    [classSummary],
  );

  const barData = useMemo(
    () =>
      rankingEntries.slice(0, 12).map((s) => ({
        name: s.studentName,
        score: Number(s.avgScore.toFixed(1)),
      })),
    [rankingEntries],
  );

  const progressStudentName =
    studentProgress?.studentName ||
    rankingEntries.find((s) => s.studentId === selectedStudentId)?.studentName ||
    '';

  const exerciseLabel =
    selectedExerciseType === 'all' ? '全部项目' : EXERCISE_NAMES[selectedExerciseType];

  const handleSelectStudent = useCallback((studentId: string) => {
    setSelectedStudentId(studentId);
  }, []);

  /* ── 渲染 ── */
  return (
    <div className="page page-fade-in report-page">
      <div className="page-header">
        <button
          type="button"
          className="header-back-btn"
          onClick={() => navigate('/')}
          aria-label="返回"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15 19l-7-7 7-7"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <h1>训练报告</h1>
      </div>

      {/* 班级选择 + 项目筛选 */}
      <div className="report-controls">
        <span className="report-select-wrap">
          <select
            className="report-select"
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            disabled={classesLoading || classes.length === 0}
            aria-label="选择班级"
          >
            {classesLoading ? (
              <option value="">班级加载中...</option>
            ) : classes.length === 0 ? (
              <option value="">暂无班级</option>
            ) : (
              classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.grade ? `${c.grade} ${c.name}` : c.name}
                </option>
              ))
            )}
          </select>
        </span>
        <div className="report-exercise-filter" role="group" aria-label="运动项目筛选">
          {EXERCISE_FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`report-filter-btn ${
                selectedExerciseType === opt.value ? 'report-filter-btn--active' : ''
              }`}
              onClick={() => setSelectedExerciseType(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="scroll-content">
        {classesError ? (
          <div className="report-empty">
            <p className="report-empty-title">{classesError}</p>
            <button type="button" className="btn btn-primary" onClick={loadClasses}>
              重新加载
            </button>
          </div>
        ) : classesLoading || summaryLoading ? (
          <div className="report-empty">
            <span className="report-loading-dot" aria-hidden="true" />
            <p className="report-empty-title">报告数据加载中...</p>
          </div>
        ) : summaryError ? (
          <div className="report-empty">
            <p className="report-empty-title">{summaryError}</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setSummaryReloadKey((k) => k + 1)}
            >
              重新加载
            </button>
          </div>
        ) : !selectedClassId ? (
          <div className="report-empty">
            <p className="report-empty-title">请先在教师端创建班级，或检查后端班级数据</p>
          </div>
        ) : classSummary ? (
          <>
            {/* 汇总统计卡片 */}
            <div className="report-cards">
              <ClassSummaryCard
                title="平均成绩"
                value={classSummary.avgScore.toFixed(1)}
                subtitle={exerciseLabel}
                trend={trendFromPct(classSummary.scoreTrendPct)}
                icon="🎯"
                accent="linear-gradient(135deg, rgba(0,122,255,0.16), rgba(88,86,214,0.16))"
              />
              <ClassSummaryCard
                title="完成率"
                value={`${classSummary.completionRate.toFixed(0)}%`}
                subtitle="达标学生占比"
                trend={trendFromPct(classSummary.completionTrendPct)}
                icon="✅"
                accent="linear-gradient(135deg, rgba(52,199,89,0.16), rgba(48,209,88,0.16))"
              />
              <ClassSummaryCard
                title="训练次数"
                value={classSummary.totalSessions}
                subtitle="班级累计训练"
                trend={trendFromPct(classSummary.sessionsTrendPct)}
                icon="🏋"
                accent="linear-gradient(135deg, rgba(255,149,0,0.16), rgba(255,107,0,0.16))"
              />
              <ClassSummaryCard
                title="活跃学生"
                value={classSummary.activeStudents}
                subtitle={
                  classSummary.totalStudents > 0
                    ? `共 ${classSummary.totalStudents} 名学生`
                    : undefined
                }
                icon="👥"
                accent="linear-gradient(135deg, rgba(175,82,222,0.16), rgba(88,86,214,0.16))"
              />
            </div>

            {/* 柱状图 + 排名 */}
            <div className="report-grid">
              <div className="card report-chart">
                <div className="card-title">
                  学生平均成绩对比
                  <span className="report-chart-note">{exerciseLabel}</span>
                </div>
                {barData.length === 0 ? (
                  <p className="report-chart-empty">暂无学生成绩数据</p>
                ) : (
                  <div className="report-chart-body">
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={barData} barSize={26}>
                        <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 12, fill: tickColor }}
                          axisLine={false}
                          tickLine={false}
                          interval={0}
                          tickFormatter={(name: string) =>
                            name.length > 4 ? `${name.slice(0, 4)}…` : name
                          }
                        />
                        <YAxis
                          tick={{ fontSize: 12, fill: tickColor }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <Tooltip
                          contentStyle={tooltipStyle}
                          formatter={(v) => [`${v} 分`, '平均成绩']}
                        />
                        <Legend formatter={() => `平均成绩（${exerciseLabel}）`} />
                        <Bar dataKey="score" fill={chartColor} radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="card report-chart">
                <div className="card-title">学生排名</div>
                <StudentRanking
                  students={rankingEntries}
                  onSelectStudent={handleSelectStudent}
                  selectedStudentId={selectedStudentId}
                />
              </div>
            </div>

            {/* 学生进步趋势 */}
            <div className="card report-chart report-progress-card">
              <div className="card-title">
                学生进步趋势
                {progressStudentName && (
                  <span className="report-student-chip">{progressStudentName}</span>
                )}
              </div>
              {progressLoading ? (
                <p className="report-chart-empty">趋势加载中...</p>
              ) : progressError ? (
                <p className="report-chart-empty">{progressError}</p>
              ) : !studentProgress || studentProgress.points.length === 0 ? (
                <p className="report-chart-empty">
                  {selectedStudentId ? '该学生暂无训练记录' : '点击左侧排名查看学生趋势'}
                </p>
              ) : (
                <div className="report-chart-body">
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={studentProgress.points}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 12, fill: tickColor }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 12, fill: tickColor }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} 分`, '成绩']} />
                      <Legend formatter={() => `成绩（${exerciseLabel}）`} />
                      <Line
                        type="monotone"
                        dataKey="score"
                        stroke={chartColor}
                        strokeWidth={2.5}
                        dot={{ fill: chartColor, r: 3.5 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
