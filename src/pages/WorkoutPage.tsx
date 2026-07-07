import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ExerciseType, Pose, FormFeedback, WorkoutSession } from '../types';
import { EXERCISE_NAMES, DEFAULT_TARGETS, EXERCISE_CONFIGS } from '../constants/exerciseConfig';
import CameraView from '../components/CameraView';
import { useWorkout } from '../hooks/useWorkout';
import { playGoalReached } from '../services/SoundService';
import './WorkoutPage.css';

// 提取的子组件
import TargetModal from '../components/workout/TargetModal';
import StopConfirmModal from '../components/workout/StopConfirmModal';
import ResultPanel from '../components/workout/ResultPanel';
import NotificationBar from '../components/workout/NotificationBar';

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
    isPaused,
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
    pause,
    resume,
    getElapsedSeconds,
  } = useWorkout(type);

  // ── 弹窗 / 通知状态 ──
  const [currentFeedback, setCurrentFeedback] = useState<FormFeedback | null>(null);
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [showStopConfirm, setShowStopConfirm] = useState(false);
  const [resultSession, setResultSession] = useState<WorkoutSession | null>(null);
  const [targetInput, setTargetInput] = useState(DEFAULT_TARGETS[type].toString());
  const [inputError, setInputError] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [notifExiting, setNotifExiting] = useState(false);

  // ── Refs ──
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
  const lastFeedbackTimeRef = useRef(0);

  // ── 通知管理 ──
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

  // ── 目标设置弹窗回调 ──
  const handleTargetConfirm = useCallback(
    (mode: 'count' | 'timed', value: number) => {
      if (mode === 'count') {
        setTargetCount(value);
      } else {
        setTargetDuration(value);
      }
      setShowTargetModal(false);
      setInputError(false);
    },
    [setTargetCount, setTargetDuration],
  );

  // ── 结束确认弹窗回调 ──
  const handleStopConfirm = useCallback(async () => {
    setShowStopConfirm(false);
    setCurrentFeedback(null);
    const { session, saved } = await stopRef.current();
    if (session) {
      if (saved) {
        setResultSession(session);
      } else {
        showNotification('⚠️ 保存失败，请重试');
      }
    }
  }, [showNotification]);

  // ── 结果面板回调 ──
  const handleResultDismiss = useCallback(() => setResultSession(null), []);
  const handleResultAgain = useCallback(() => {
    setResultSession(null);
  }, []);
  const handleResultHistory = useCallback(() => {
    setResultSession(null);
    navigate('/history');
  }, [navigate]);

  // ── 组件卸载清理 ──
  useEffect(() => {
    return () => {
      if (notifTimerRef.current) clearTimeout(notifTimerRef.current);
      if (notifExitTimerRef.current) clearTimeout(notifExitTimerRef.current);
      if (stopResultTimerRef.current) clearTimeout(stopResultTimerRef.current);
    };
  }, []);

  // ── 训练中关闭窗口拦截保护 ──
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isActive]);

  // ── 键盘快捷键 ──
  const anyModalOpen = showTargetModal || showStopConfirm || !!resultSession;
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showTargetModal) setShowTargetModal(false);
        else if (showStopConfirm) setShowStopConfirm(false);
        else if (resultSession) setResultSession(null);
        return;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        const active = document.activeElement;
        if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
        if (anyModalOpen) return;
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

  // ── 弹窗焦点锁定 ──
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

  // ── 计时器（自动扣除暂停时长） ──
  useEffect(() => {
    if (isActive && startTime) {
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed(getElapsedSeconds());
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setElapsed(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, startTime, getElapsedSeconds]);

  // ── 定数模式完成提示 ──
  useEffect(() => {
    if (mode !== 'count') return;
    if (isActive && count > 0 && count >= targetCount && !hasShownCompletion.current) {
      hasShownCompletion.current = true;
      showNotification(`🎉 恭喜！已完成目标 ${targetCount} 次！`);
      playGoalReached();
    }
  }, [count, targetCount, isActive, mode, showNotification]);

  // ── 定时模式时间到提示 ──
  useEffect(() => {
    if (mode !== 'timed') return;
    if (timeUp && !hasShownCompletion.current) {
      hasShownCompletion.current = true;
      showNotification(`⏰ 时间到！共完成 ${count} 次`);
      playGoalReached();
      if (stopResultTimerRef.current) clearTimeout(stopResultTimerRef.current);
      stopResultTimerRef.current = setTimeout(async () => {
        stopResultTimerRef.current = null;
        const { session, saved } = await stopRef.current();
        if (session && saved) {
          setResultSession(session);
        }
      }, 800);
    }
  }, [timeUp, mode, count, showNotification]);

  useEffect(() => {
    if (isActive) hasShownCompletion.current = false;
  }, [isActive]);

  // ── 姿态检测回调 ──
  const handlePoseDetected = useCallback(
    (pose: Pose) => {
      processFrame(pose);
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

  // ── 开始 / 停止操作 ──
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
      handleStopConfirm();
    }
  };
  handleStopClickRef.current = handleStopClick;

  // ── 打开目标设置弹窗 ──
  const openTargetModal = () => {
    setTargetInput(mode === 'timed' ? targetDuration.toString() : targetCount.toString());
    setShowTargetModal(true);
  };

  // ── 渲染辅助 ──
  const progress = mode === 'count' ? Math.min((count / targetCount) * 100, 100) : 0;
  const remaining = mode === 'timed' ? Math.max(targetDuration - elapsed, 0) : 0;

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
            <span
              className={`status-dot ${
                isPaused ? 'status-dot--paused' : isActive ? 'status-dot--active' : ''
              }`}
            />
            <span
              className={`status-text ${
                isPaused ? 'status-text--paused' : isActive ? 'status-text--active' : ''
              }`}
            >
              {isPaused ? '已暂停' : isActive ? '姿态正常' : '待开始'}
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
              <>
                <button
                  type="button"
                  className="action-btn action-btn--pause"
                  onClick={isPaused ? resume : pause}
                  disabled={isSaving || timeUp}
                  aria-label={isPaused ? '继续训练' : '暂停训练'}
                >
                  {isPaused ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                      <polygon points="7,4 20,12 7,20" />
                    </svg>
                  ) : (
                    <span className="pause-icon" />
                  )}
                  <span>{isPaused ? '继续训练' : '暂停训练'}</span>
                </button>
                <button
                  type="button"
                  className="action-btn action-btn--stop"
                  onClick={handleStopClick}
                  disabled={isSaving || timeUp}
                >
                  {isSaving ? <div className="mini-spinner" /> : <div className="stop-icon" />}
                  <span>{timeUp ? '保存中...' : '结束训练'}</span>
                </button>
              </>
            )}
          </div>
        </aside>

        {/* 右侧摄像头 */}
        <div className="camera-area">
          <CameraView onPoseDetected={handlePoseDetected} isActive={isActive} exerciseType={type} />
        </div>
      </div>

      {/* 提取的子组件 */}

      {/* 通知条 */}
      <NotificationBar
        message={notification}
        exiting={notifExiting}
        onDismiss={dismissNotification}
      />

      {/* 目标设置弹窗 */}
      <TargetModal
        visible={showTargetModal}
        mode={mode}
        value={targetInput}
        error={inputError}
        onChange={setTargetInput}
        onError={setInputError}
        onClose={() => setShowTargetModal(false)}
        onConfirm={handleTargetConfirm}
      />

      {/* 结束训练确认弹窗 */}
      <StopConfirmModal
        visible={showStopConfirm}
        count={count}
        mode={mode}
        targetCount={targetCount}
        elapsed={elapsed}
        formatTime={formatTime}
        onClose={() => setShowStopConfirm(false)}
        onConfirm={handleStopConfirm}
        isSaving={isSaving}
      />

      {/* 训练结果摘要面板 */}
      {resultSession && (
        <ResultPanel
          session={resultSession}
          exerciseType={type}
          targetCount={targetCount}
          onDismiss={handleResultDismiss}
          onAgain={handleResultAgain}
          onViewHistory={handleResultHistory}
        />
      )}
    </div>
  );
}
