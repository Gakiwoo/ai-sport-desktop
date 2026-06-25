import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  PieChart,
  Pie,
} from 'recharts';
import { WorkoutSession, ExerciseType } from '../types';
import StorageService from '../services/StorageService';
import { EXERCISE_NAMES, EXERCISE_COLORS } from '../constants/exerciseConfig';
import './AnalyticsPage.css';

/* 统计卡片渐变背景 */
const statCardThemes = [
  { gradient: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)', icon: '🏋' },
  { gradient: 'linear-gradient(135deg, #34C759 0%, #30D158 100%)', icon: '🔥' },
  { gradient: 'linear-gradient(135deg, #FF9500 0%, #FF6B00 100%)', icon: '📊' },
  { gradient: 'linear-gradient(135deg, #AF52DE 0%, #5856D6 100%)', icon: '⏱' },
];

type TimeRange = '7d' | '14d' | '30d' | 'all';

function formatStatDuration(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}秒`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) return `${hours}时${minutes}分`;
  return `${minutes}分`;
}

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: '7d', label: '近 7 天' },
  { value: '14d', label: '近 14 天' },
  { value: '30d', label: '近 30 天' },
  { value: 'all', label: '全部' },
];

function filterByRange(sessions: WorkoutSession[], range: TimeRange): WorkoutSession[] {
  if (range === 'all') return sessions;
  const days = range === '7d' ? 7 : range === '14d' ? 14 : 30;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return sessions.filter((s) => s.timestamp >= cutoff);
}

function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDayLabels(count: number): { dateStr: string; label: string }[] {
  const DAY = ['日', '一', '二', '三', '四', '五', '六'];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (count - 1 - i));
    return {
      dateStr: toLocalDateStr(d),
      label: count <= 7 ? `周${DAY[d.getDay()]}` : `${d.getMonth() + 1}/${d.getDate()}`,
    };
  });
}

export default function AnalyticsPage() {
  const navigate = useNavigate();
  const [allWorkouts, setAllWorkouts] = useState<WorkoutSession[]>([]);
  const [timeRange, setTimeRange] = useState<TimeRange>('7d');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isDark, setIsDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );

  // 监听系统深色模式变化
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // 图表颜色自适应深色模式（仅 isDark 变化时重新计算）
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

  const loadData = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    StorageService.getAnalytics()
      .then((data) => setAllWorkouts(data.recentWorkouts))
      .catch((err) => {
        console.error('加载分析数据失败:', err);
        setLoadError('数据加载失败，请稍后重试');
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const workouts = useMemo(() => filterByRange(allWorkouts, timeRange), [allWorkouts, timeRange]);

  // 统计卡片：基于筛选范围
  const stats = useMemo(() => {
    const totalWorkouts = workouts.length;
    const totalReps = workouts.reduce((s, w) => s + w.count, 0);
    const totalDuration = workouts.reduce((s, w) => s + w.duration, 0);
    const avgReps = totalWorkouts > 0 ? totalReps / totalWorkouts : 0;
    return { totalWorkouts, totalReps, totalDuration, avgReps };
  }, [workouts]);

  // 柱状图数据
  const barDayCount = useMemo(
    () => (timeRange === '7d' ? 7 : timeRange === '14d' ? 14 : timeRange === '30d' ? 30 : 14),
    [timeRange],
  );
  const dayLabels = useMemo(() => getDayLabels(barDayCount), [barDayCount]);

  // 预计算日期→次数映射（O(n) 一次遍历，避免 O(days*workouts) 重复 filter）
  const dateCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of workouts) {
      const key = toLocalDateStr(new Date(w.timestamp));
      map.set(key, (map.get(key) ?? 0) + w.count);
    }
    return map;
  }, [workouts]);

  const weekData = useMemo(() => {
    return dayLabels.map(({ dateStr, label }) => ({
      label,
      value: dateCountMap.get(dateStr) ?? 0,
    }));
  }, [dayLabels, dateCountMap]);

  // 趋势数据（柱状图天数 x2）
  const trendDayCount = useMemo(() => Math.min(barDayCount * 2, 30), [barDayCount]);
  const trendLabels = useMemo(() => getDayLabels(trendDayCount), [trendDayCount]);

  const trendData = useMemo(() => {
    return trendLabels.map(({ dateStr, label }) => ({
      label,
      value: dateCountMap.get(dateStr) ?? 0,
    }));
  }, [trendLabels, dateCountMap]);

  // 运动类型分布
  const distData = useMemo(() => {
    const counts = {} as Record<ExerciseType, number>;
    workouts.forEach((w) => {
      counts[w.exerciseType] = (counts[w.exerciseType] ?? 0) + w.count;
    });
    return Object.entries(counts)
      .filter(([, v]) => v > 0)
      .map(([type, value]) => ({
        name: EXERCISE_NAMES[type as ExerciseType],
        value,
        color: EXERCISE_COLORS[type as ExerciseType],
      }));
  }, [workouts]);

  const hasData = workouts.length > 0;

  return (
    <div className="page page-fade-in">
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
        <h1>数据分析</h1>
      </div>

      {/* 时间范围选择器 */}
      <div className="time-range-selector">
        {TIME_RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`time-range-btn ${timeRange === opt.value ? 'time-range-btn--active' : ''}`}
            onClick={() => setTimeRange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="scroll-content">
        {isLoading ? (
          <div className="empty-state">
            <p className="empty-title">加载中...</p>
          </div>
        ) : loadError ? (
          <div className="empty-state">
            <p className="empty-title">{loadError}</p>
            <button type="button" className="btn btn-primary" onClick={loadData}>
              重新加载
            </button>
          </div>
        ) : (
          <>
            {/* 统计卡片 — 品牌色渐变背景 */}
            <div className="stats-grid">
              {[
                { value: stats.totalWorkouts, label: '总训练次', theme: statCardThemes[0] },
                { value: stats.totalReps, label: '累计完成(次)', theme: statCardThemes[1] },
                {
                  value: stats.avgReps.toFixed(1),
                  label: '平均每次(次)',
                  theme: statCardThemes[2],
                },
                {
                  value: formatStatDuration(stats.totalDuration),
                  label: '累计用时',
                  theme: statCardThemes[3],
                },
              ].map((item, i) => (
                <div key={i} className="stat-card" style={{ background: item.theme.gradient }}>
                  <div className="stat-card-icon">{item.theme.icon}</div>
                  <div className="stat-value">{item.value}</div>
                  <div className="stat-label">{item.label}</div>
                </div>
              ))}
            </div>

            {/* 柱状图 */}
            <div className="card">
              <div className="card-title">
                {timeRange === 'all'
                  ? `近 ${barDayCount} 天训练量`
                  : `训练量（${TIME_RANGE_OPTIONS.find((o) => o.value === timeRange)?.label}）`}
              </div>
              {!hasData ? (
                <p className="chart-empty">暂无数据</p>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={weekData} barSize={28}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 13, fill: tickColor }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 13, fill: tickColor }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} 次`, '完成量']} />
                    <Bar dataKey="value" fill={brandColor} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* 趋势折线图 */}
            <div className="card">
              <div className="card-title">训练趋势</div>
              {!hasData ? (
                <p className="chart-empty">暂无数据</p>
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: tickColor }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 13, fill: tickColor }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => [`${v} 次`, '完成量']} />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={brandColor}
                      strokeWidth={2.5}
                      dot={{ fill: brandColor, r: 3.5 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* 运动分布环形图 */}
            <div className="card">
              <div className="card-title">运动类型分布</div>
              {distData.length === 0 ? (
                <p className="chart-empty">暂无数据</p>
              ) : (
                <div className="pie-chart-row">
                  <ResponsiveContainer width={140} height={140}>
                    <PieChart>
                      <Pie
                        data={distData}
                        cx="50%"
                        cy="50%"
                        innerRadius={36}
                        outerRadius={62}
                        paddingAngle={3}
                        dataKey="value"
                        stroke="none"
                      >
                        {distData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pie-legend">
                    {distData.map((entry, i) => (
                      <div key={i} className="pie-legend-item">
                        <span className="pie-dot" style={{ background: entry.color }} />
                        <span className="pie-label">{entry.name}</span>
                        <span className="pie-value">{entry.value} 次</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
