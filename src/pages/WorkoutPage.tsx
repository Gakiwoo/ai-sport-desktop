import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ExerciseType, Pose, FormFeedback, WorkoutSession } from '../types';
import { EXERCISE_NAMES, DEFAULT_TARGETS, EXERCISE_CONFIGS } from '../constants/exerciseConfig';
import CameraView from '../components/CameraView';
import { useWorkout } from '../hooks/useWorkout';
import { playGoalReached } from '../services/SoundService';
import './WorkoutPage.css';

/* 运动类型白名单（从 EXERCISE_CONFIGS 派生，避免硬编码） */
const VALID_EXERCISE_TYPES: Record<string, ExerciseType> = Object.fromEntries(
  EXERCISE_CONFIGS.map((c) => [c.type, c.type]),
);

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

export default function WorkoutPage() {
  const { exerciseType } = useParams<{ exerciseType: string }>();
  const navigate = useNavigate();
  const type = VALID_EXERCISE_TYPES[exerciseType ?? ''] ?? 'squats';

  const {
    isActive,
    count,
    mode,
    switchMode,
    targetCount,
    setTargetCount,
    targetDuration,
    setTargetDuration,
    isSaving,
    timeUp,
    startTime,
    processFrame,
    getFeedback,
    start,
    stop,
  } = useWorkout(type);

  const [currentFeedback, setCurrentFeedback] = useState<FormFeedback | null>(null);
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [resultSession, setResultSession] = useState<WorkoutSession | null>(null);
  const [targetInput, setTargetInput] = useState(DEFAULT_TARGETS[type].toString());
  const [inputError, setInputError] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [notifExiting, setNotifExiting] = useState(false);
  const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const hasShownCompletion = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopResultTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopRef = useRef(stop);
  stopRef.current = stop;
  const handleStartRef = useRef<() => void>(() => {});
  const handleStopClickRef = useRef<() => void>(() => {});
  /** 反馈更新节流：每 250ms 最多更新一次（30fps→4fps），减少不必要渲染 */
  const lastFeedbackTimeRef = useRef(0);

  // 组件卸载清理通知定时器
  useEffect(() => {
    return () => {
      if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
      if (notifExitTimerRef.current) clearTimeout(notifExitTimerRef.current);
      if (stopResultTimerRef.current) clearTimeout(stopResultTimerRef.current);
    };
  }, []);

  // 训练中关闭窗口拦截保护
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isActive]);

  // Escape 关闭弹窗 + 键盘快捷键（Space/Enter 开始/停止）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showTargetModal) setShowTargetModal(false);
        else if (showStopConfirm) setShowStopConfirm(false);
        else if (resultSession) setResultSession(null);
        return;
      }

      // 快捷键：Space / Enter 控制开始/停止（仅在无弹窗、非输入框时生效）
      if (e.key === ' ' || e.key === 'Enter') {
        const active = document.activeElement;
        if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
        if (showTargetModal || showStopConfirm || resultSession) return;
        e.preventDefault();
        if (isActive) {
          handleStopClickRef.current();
        } else {
          handleStartRef.current();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showTargetModal, showStopConfirm, resultSession, isActive]);

  // 弹窗焦点锁定（Tab 循环在弹窗内部）
  const anyModalOpen = showTargetModal || showStopConfirm || !!resultSession;
  useEffect(() => {
    if (!anyModalOpen) return;
    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const overlay = document.querySelector('.modal-overlay[aria-modal="true"]');
      if (!overlay) return;
      const focusable = overlay.querySelectorAll<HTMLElement>(
        'button, input, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleTab);
    return () => window.removeEventListener('keydown', handleTab);
  }, [anyModalOpen]);

  // 计时器（elapsed 用于显示已用时间，使用 hook 统一的 startTime）
  useEffect(() => {
    if (isActive && startTime) {
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(Math.round((Date.now() - startTime) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setElapsed(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, startTime]);

  // 定数模式完成提示
  useEffect(() => {
    if (mode !== 'count') return;
    if (isActive && count > 0 && count >= targetCount && !hasShownCompletion.current) {
      hasShownCompletion.current = true;
      showNotification(`🎉 恭喜！已完成目标 ${targetCount} 次！`);
      playGoalReached();
    }
  }, [count, targetCount, isActive, mode]);

  // 定时模式时间到提示
  useEffect(() => {
    if (mode !== 'timed') return;
    if (timeUp && !hasShownCompletion.current) {
      hasShownCompletion.current = true;
      showNotification(`⏰ 时间到！共完成 ${count} 次`);
      playGoalReached();
      // 延迟一点展示结果面板，让用户看到通知
      if (stopResultTimerRef.current) clearTimeout(stopResultTimerRef.current);
      stopResultTimerRef.current = setTimeout(async () => {
        stopResultTimerRef.current = null;
        const { session, saved } = await stopRef.current();
        if (session && saved) {
          setResultSession(session);
        }
      }, 800);
    }
  }, [timeUp, mode, count]);

  useEffect(() => {
    if (isActive) hasShownCompletion.current = false;
  }, [isActive]);

  const handlePoseDetected = useCallback(
    (pose: Pose) => {
      processFrame(pose);
      // 节流反馈更新：每 250ms 最多一次（30fps→4fps），减少 React 渲染压力
      const now = performance.now();
      if (now - lastFeedbackTimeRef.current < 250) return;
      lastFeedbackTimeRef.current = now;
      const fb = getFeedback(pose);
      setCurrentFeedback((prev) =>
        prev?.message === fb?.message && prev?.type === fb?.type ? prev : fb,
      );
    },
    [processFrame, getFeedback],
  );

  // 通知条自动消失
  const showNotification = useCallback((msg: string) => {
    if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
    if (notifExitTimerRef.current) {
      clearTimeout(notifExitTimerRef.current);
      notifExitTimerRef.current = null;
    }
    setNotification(msg);
    setNotifExiting(false);
    notifTimerRef.current = setTimeout(() => {
      setNotifExiting(true);
      notifExitTimerRef.current = setTimeout(() => {
        setNotification(null);
        setNotifExiting(false);
        notifExitTimerRef.current = null;
      }, 250);
    }, 4000);
  }, []);

  const dismissNotification = useCallback(() => {
    if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
    if (notifExitTimerRef.current) {
      clearTimeout(notifExitTimerRef.current);
      notifExitTimerRef.current = null;
    }
    if (!notification) return;
    setNotifExiting(true);
    notifExitTimerRef.current = setTimeout(() => {
      setNotification(null);
      setNotifExiting(false);
      notifExitTimerRef.current = null;
    }, 250);
  }, [notification]);

  const handleStart = () => {
    setCurrentFeedback(null);
    dismissNotification();
    start();
  };
  handleStartRef.current = handleStart;

  const handleStopClick = () => {
    if (count > 0 || mode === 'timed') {
      setShowStopConfirm(true);
    } else {
      doStop();
    }
  };
  handleStopClickRef.current = handleStopClick;

  const doStop = useCallback(async () => {
    setShowStopConfirm(false);
    setCurrentFeedback(null);
    const { session, saved } = await stop();
    if (session) {
      if (saved) {
        setResultSession(session);
      } else {
        showNotification('⚠️ 保存失败，请重试');
      }
    }
  }, [stop, showNotification]);

  // 定数模式的进度
  const progress = mode === 'count' ? Math.min((count / targetCount) * 100, 100) : 0;
  // 定时模式的倒计时剩余
  const remaining = mode === 'timed' ? Math.max(targetDuration - elapsed, 0) : 0;

  const openTargetModal = () => {
    setTargetInput(mode === 'timed' ? targetDuration.toString() : targetCount.toString());
    setShowTargetModal(true);
  };

  return (
    <div className="workout-page">
      {/* 顶栏导航 */}
      <header className="workout-header">
        <button
          type="button"
          className="btn-back-circle"
          onClick={() => navigate('/')}
          aria-label="返回"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15 19l-7-7 7-7"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <h1 className="workout-header-title">{EXERCISE_NAMES[type]}</h1>
        <button type="button" className="target-chip" onClick={openTargetModal}>
          {mode === 'count' ? <>目标: {targetCount}</> : <>目标: {formatTime(targetDuration)}</>}
        </button>
      </header>

      {/* 主内容区：左侧面板 + 右侧摄像头 */}
      <div className="workout-body">
        {/* 左侧数据面板 */}
        <aside className="data-panel">
          {/* 模式切换（仅未开始时可切换） */}
          {!isActive && (
            <div className="mode-switcher">
              <button
                type="button"
                className={`mode-btn ${mode === 'count' ? 'mode-btn--active' : ''}`}
                onClick={() => switchMode('count')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                定数模式
              </button>
              <button
                type="button"
                className={`mode-btn ${mode === 'timed' ? 'mode-btn--active' : ''}`}
                onClick={() => switchMode('timed')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
                  <path
                    d="M12 6v6l4 2"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                定时模式
              </button>
            </div>
          )}

          {/* 大计数器 */}
          <div className="counter-section">
            <div
              className={`counter-value ${mode === 'timed' ? 'counter-value--timed' : ''}`}
              data-progress={Math.round(progress)}
            >
              {count}
            </div>
            <div className="counter-label">{mode === 'count' ? `/ ${targetCount} 次` : '次'}</div>
            {/* 定数模式进度条 */}
            {mode === 'count' && (
              <>
                <div className="progress-track">
                  <div
                    className={`progress-fill${count >= targetCount ? ' progress-fill--complete' : ''}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="progress-percent">{Math.round(progress)}%</div>
              </>
            )}
          </div>

          {/* 计时器 / 倒计时 */}
          <div className="timer-section">
            {mode === 'timed' && isActive ? (
              <>
                <div
                  className={`timer-value ${timeUp ? 'timer-value--expired' : 'timer-value--countdown'}`}
                >
                  {timeUp ? '00:00' : formatTime(remaining)}
                </div>
                <div className="timer-label">{timeUp ? '时间到！' : '剩余时间'}</div>
              </>
            ) : (
              <>
                <div className="timer-value">{formatTime(elapsed)}</div>
                <div className="timer-label">用时</div>
              </>
            )}
          </div>

          {/* 状态指示 */}
          <div className="status-indicator">
            <span className={`status-dot ${isActive ? 'status-dot--active' : ''}`} />
            <span className={`status-text ${isActive ? 'status-text--active' : ''}`}>
              {isActive ? '姿态正常' : '待开始'}
            </span>
          </div>

          {/* 姿态反馈 */}
          <div className="feedback-section" role="status" aria-live="polite">
            {currentFeedback ? (
              <div className={`feedback-tag feedback-${currentFeedback.type}`}>
                {currentFeedback.message}
              </div>
            ) : isActive ? (
              <div className="feedback-tag feedback-idle">请保持全身在画面中</div>
            ) : null}
          </div>

          {/* 开始/停止按钮 */}
          <div className="action-section">
            {!isActive ? (
              <button type="button" className="action-btn action-btn--start" onClick={handleStart}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                  <polygon points="7,4 20,12 7,20" />
                </svg>
                <span>开始训练</span>
              </button>
            ) : (
              <button
                type="button"
                className="action-btn action-btn--stop"
                onClick={handleStopClick}
                disabled={isSaving || timeUp}
              >
                {isSaving ? <div className="mini-spinner" /> : <div className="stop-icon" />}
                <span>{timeUp ? '保存中...' : '结束训练'}</span>
              </button>
            )}
          </div>
        </aside>

        {/* 右侧摄像头 */}
        <div className="camera-area">
          <CameraView onPoseDetected={handlePoseDetected} isActive={isActive} exerciseType={type} />
        </div>
      </div>

      {/* 通知条 */}
      {notification && (
        <div
          className={`notification-bar${notifExiting ? ' notification-bar--exiting' : ''}`}
          onClick={dismissNotification}
          role="status"
          aria-live="polite"
        >
          <span>{notification}</span>
          <span className="notification-close">✕</span>
        </div>
      )}

      {/* 目标设置弹窗 */}
      {showTargetModal && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="设置目标"
          onClick={() => setShowTargetModal(false)}
        >
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">
              {mode === 'count' ? '设置目标次数' : '设置目标时长（秒）'}
            </h3>
            <input
              type="number"
              className={`modal-input${inputError ? ' modal-input--invalid' : ''}`}
              value={targetInput}
              onChange={(e) => {
                setTargetInput(e.target.value);
                setInputError(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const val = parseInt(targetInput, 10);
                  if (isNaN(val) || val <= 0) {
                    setInputError(true);
                    return;
                  }
                  if (mode === 'count') {
                    setTargetCount(val);
                  } else {
                    setTargetDuration(val);
                  }
                  setShowTargetModal(false);
                  setInputError(false);
                }
              }}
              min={mode === 'count' ? 1 : 10}
              max={mode === 'count' ? 9999 : 3600}
              autoFocus
              aria-label={mode === 'count' ? '目标次数' : '目标时长（秒）'}
              placeholder={mode === 'count' ? '输入目标次数' : '输入秒数（如 60）'}
            />
            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn modal-btn--cancel"
                onClick={() => setShowTargetModal(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="modal-btn modal-btn--confirm"
                onClick={() => {
                  const val = parseInt(targetInput, 10);
                  if (isNaN(val) || val <= 0) {
                    setInputError(true);
                    return;
                  }
                  if (mode === 'count') {
                    setTargetCount(val);
                  } else {
                    setTargetDuration(val);
                  }
                  setShowTargetModal(false);
                  setInputError(false);
                }}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 结束训练确认弹窗 */}
      {showStopConfirm && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="结束训练确认"
          onClick={() => setShowStopConfirm(false)}
        >
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">结束训练</h3>
            <p className="modal-desc">
              当前已完成 <strong>{count}</strong> 次，
              {mode === 'count'
                ? count >= targetCount
                  ? '已达成目标！'
                  : `距离目标还差 ${targetCount - count} 次。`
                : `已用时 ${formatTime(elapsed)}。`}
              确认结束本次训练？
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-btn modal-btn--cancel"
                onClick={() => setShowStopConfirm(false)}
              >
                继续训练
              </button>
              <button
                type="button"
                className="modal-btn modal-btn--stop-confirm"
                onClick={doStop}
                disabled={isSaving}
                autoFocus
              >
                {isSaving ? '保存中...' : '确认结束'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 训练结果摘要面板 */}
      {resultSession && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label="训练结果"
          onClick={() => setResultSession(null)}
        >
          <div className="result-panel" onClick={(e) => e.stopPropagation()}>
            <div className="result-emoji">🎉</div>
            <h2 className="result-title">训练完成</h2>
            <div className="result-stats">
              <div className="result-stat">
                <div className="result-stat-value">{EXERCISE_NAMES[type]}</div>
                <div className="result-stat-label">运动类型</div>
              </div>
              <div className="result-stat-divider" />
              <div className="result-stat">
                <div className="result-stat-value result-stat--accent">{resultSession.count}</div>
                <div className="result-stat-label">完成次数</div>
              </div>
              <div className="result-stat-divider" />
              <div className="result-stat">
                <div className="result-stat-value">{resultSession.duration}s</div>
                <div className="result-stat-label">用时</div>
              </div>
            </div>
            <div className="result-mode-badge">
              {resultSession.mode === 'timed' ? '⏰ 定时模式' : '🎯 定数模式'}
            </div>
            {resultSession.mode === 'count' && resultSession.count >= targetCount && (
              <div className="result-badge">✅ 已达成目标</div>
            )}
            <div className="result-rate">
              平均速率{' '}
              {resultSession.duration > 0
                ? ((resultSession.count / resultSession.duration) * 60).toFixed(1)
                : '—'}{' '}
              次/分钟
            </div>
            <div className="result-actions">
              <button
                type="button"
                className="modal-btn modal-btn--confirm"
                onClick={() => setResultSession(null)}
              >
                再来一次
              </button>
              <button
                type="button"
                className="modal-btn modal-btn--cancel"
                onClick={() => navigate('/history')}
              >
                查看历史
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
