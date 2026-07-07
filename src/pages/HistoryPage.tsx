import { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { WorkoutSession, ExerciseType } from '../types';
import StorageService from '../services/StorageService';
import { EXERCISE_NAMES, EXERCISE_COLORS, EXERCISE_CONFIGS } from '../constants/exerciseConfig';
import ExerciseIllustration from '../components/ExerciseIllustration';
import './HistoryPage.css';
import ErrorReporter from '../services/ErrorReporter';

/* 运动类型筛选 Tab（从 EXERCISE_CONFIGS 派生，避免硬编码） */
const ALL_TYPES: Array<{ value: ExerciseType | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  ...EXERCISE_CONFIGS.map((c) => ({ value: c.type as ExerciseType, label: c.name })),
];

/** 模块级格式化工具（避免每次渲染重建） */
const formatDate = (ts: number) => {
  const d = new Date(ts);
  return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
};

const formatDuration = (s: number) => {
  if (s < 60) return `${s}秒`;
  return `${Math.floor(s / 60)}分${s % 60}秒`;
};

function getRelativeDate(ts: number): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(ts);
  const targetDay = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  // Math.round 消除 DST 切换日的 23h/25h 偏差
  const diff = Math.round((today.getTime() - targetDay.getTime()) / (1000 * 60 * 60 * 24));
  if (diff === 0) return '今天';
  if (diff === 1) return '昨天';
  if (diff === 2) return '前天';
  if (diff < 7) return `${diff} 天前`;
  return `${target.getMonth() + 1}月${target.getDate()}日`;
}

interface DateGroup {
  label: string;
  items: WorkoutSession[];
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const [history, setHistory] = useState<WorkoutSession[]>([]);
  const [showClearModal, setShowClearModal] = useState(false);
  const [filterType, setFilterType] = useState<ExerciseType | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadHistory = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    StorageService.getWorkoutHistory()
      .then((data) => setHistory([...data].reverse()))
      .catch((err) => {
        console.error('加载训练历史失败:', err);
        setLoadError('数据加载失败，请稍后重试');
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const filtered = useMemo(() => {
    if (filterType === 'all') return history;
    return history.filter((h) => h.exerciseType === filterType);
  }, [history, filterType]);

  const grouped = useMemo((): DateGroup[] => {
    const groups: DateGroup[] = [];
    let currentLabel = '';
    for (const item of filtered) {
      const label = getRelativeDate(item.timestamp);
      if (label !== currentLabel) {
        currentLabel = label;
        groups.push({ label, items: [] });
      }
      groups[groups.length - 1].items.push(item);
    }
    return groups;
  }, [filtered]);

  const handleClear = async () => {
    try {
      await StorageService.clearHistory();
      setHistory([]);
      setShowClearModal(false);
    } catch (err) {
      ErrorReporter.captureError(err, { source: 'HistoryPage', action: 'clearHistory' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await StorageService.deleteWorkout(id);
      setHistory((prev) => prev.filter((h) => h.id !== id));
    } catch (err) {
      ErrorReporter.captureError(err, { source: 'HistoryPage', action: 'deleteRecord' });
    }
  };

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
        <h1>训练历史</h1>
        {history.length > 0 && (
          <button
            type="button"
            className="header-action-btn"
            onClick={() => setShowClearModal(true)}
          >
            清空
          </button>
        )}
      </div>

      {/* 运动类型筛选 Tab */}
      {history.length > 0 && (
        <div className="filter-tabs">
          {ALL_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              className={`filter-tab ${filterType === t.value ? 'filter-tab--active' : ''}`}
              onClick={() => setFilterType(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      <div className="scroll-content">
        {isLoading ? (
          <div className="empty-state">
            <p className="empty-title">加载中...</p>
          </div>
        ) : loadError ? (
          <div className="empty-state">
            <p className="empty-title">{loadError}</p>
            <button type="button" className="btn btn-primary" onClick={loadHistory}>
              重新加载
            </button>
          </div>
        ) : history.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon-wrapper">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none">
                <rect
                  x="3"
                  y="4"
                  width="18"
                  height="16"
                  rx="3"
                  stroke="#c7c7cc"
                  strokeWidth="1.5"
                />
                <path d="M8 10h8M8 14h5" stroke="#c7c7cc" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <p className="empty-title">暂无训练记录</p>
            <p className="empty-desc">完成第一次训练后，记录会出现在这里</p>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/')}>
              开始第一次训练
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state" style={{ paddingTop: '60px' }}>
            <p className="empty-title" style={{ fontSize: 16 }}>
              该类型暂无记录
            </p>
          </div>
        ) : (
          <div className="history-list">
            {grouped.map((group) => (
              <div key={group.label} className="history-group">
                <div className="history-group-label">{group.label}</div>
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className="history-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/workout/${item.exerciseType}`)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        navigate(`/workout/${item.exerciseType}`);
                      }
                    }}
                  >
                    <div className="history-icon">
                      <ExerciseIllustration type={item.exerciseType} size={44} />
                    </div>
                    <div className="history-info">
                      <div className="history-name">{EXERCISE_NAMES[item.exerciseType]}</div>
                      <div className="history-date">{formatDate(item.timestamp)}</div>
                    </div>
                    <div className="history-stats">
                      <span
                        className="stat-count"
                        style={{ color: EXERCISE_COLORS[item.exerciseType] }}
                      >
                        {item.count} 次
                      </span>
                      <span className="stat-duration">{formatDuration(item.duration)}</span>
                      <span
                        className={`stat-mode${item.mode === 'timed' ? ' stat-mode--timed' : ''}`}
                      >
                        {item.mode === 'timed' ? '⏰定时' : '🎯定数'}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="history-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(item.id);
                      }}
                      title="删除记录"
                      aria-label="删除记录"
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M18 6L6 18M6 6l12 12"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 自定义确认弹窗 */}
      {showClearModal && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="确认清空"
          onClick={() => setShowClearModal(false)}
        >
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">确认清空</h3>
            <p className="modal-desc">将删除所有训练记录，此操作不可撤销。</p>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn modal-btn--cancel"
                onClick={() => setShowClearModal(false)}
              >
                取消
              </button>
              <button type="button" className="modal-btn modal-btn--danger" onClick={handleClear}>
                清空
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
