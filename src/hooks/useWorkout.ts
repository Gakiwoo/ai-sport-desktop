import { useState, useCallback, useRef, useEffect } from 'react';
import { ExerciseType, Pose, WorkoutSession, WorkoutMode } from '../types';
import { ExerciseCounter } from '../services/ExerciseCounter';
import { JumpRopeCounter } from '../services/counters/JumpRopeCounter';
import { JumpingJacksCounter } from '../services/counters/JumpingJacksCounter';
import { SquatsCounter } from '../services/counters/SquatsCounter';
import { StandingLongJumpCounter } from '../services/counters/StandingLongJumpCounter';
import { VerticalJumpCounter } from '../services/counters/VerticalJumpCounter';
import { SitUpCounter } from '../services/counters/SitUpCounter';
import StorageService from '../services/StorageService';
import { DEFAULT_TARGETS, DEFAULT_DURATIONS } from '../constants/exerciseConfig';
import { playCountTick } from '../services/SoundService';
import ErrorReporter from '../services/ErrorReporter';

function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function createCounter(type: ExerciseType): ExerciseCounter {
  switch (type) {
    case 'jump_rope':
      return new JumpRopeCounter();
    case 'jumping_jacks':
      return new JumpingJacksCounter();
    case 'squats':
      return new SquatsCounter();
    case 'standing_long_jump':
      return new StandingLongJumpCounter();
    case 'vertical_jump':
      return new VerticalJumpCounter();
    case 'sit_ups':
      return new SitUpCounter();
  }
}

type StopResult = {
  session: WorkoutSession | null;
  saved: boolean;
};

export function useWorkout(exerciseType: ExerciseType) {
  const [isActive, setIsActive] = useState(false);
  const [count, setCount] = useState(0);
  const [mode, setMode] = useState<WorkoutMode>('count');
  const [targetCount, setTargetCount] = useState(DEFAULT_TARGETS[exerciseType]);
  const [targetDuration, setTargetDuration] = useState(DEFAULT_DURATIONS[exerciseType]);
  const [isSaving, setIsSaving] = useState(false);
  const [timeUp, setTimeUp] = useState(false);

  const isActiveRef = useRef(false);
  const startTimeRef = useRef<number | null>(null);
  const prevCountRef = useRef(0);
  const savedSessionRef = useRef<WorkoutSession | null>(null);
  const savePromiseRef = useRef<Promise<StopResult> | null>(null);
  const exerciseTypeRef = useRef(exerciseType);
  // counter 改用 ref 持有，避免 useState 导致 processFrame/getFeedback 引用抖动
  // 切换 exerciseType 时同步重建（见下方 useEffect）
  const counterRef = useRef<ExerciseCounter>(createCounter(exerciseType));

  // ── 暂停/恢复状态 ──
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  // 累计已暂停毫秒数（每次 resume 累加）
  const pausedAccumRef = useRef(0);
  // 当前这次暂停的起点（null 表示未暂停）
  const pauseStartRef = useRef<number | null>(null);

  /** 有效训练时长（ms），自动扣除暂停区间 */
  const getElapsedMs = useCallback(() => {
    if (!startTimeRef.current) return 0;
    let paused = pausedAccumRef.current;
    if (pauseStartRef.current) paused += Date.now() - pauseStartRef.current;
    return Date.now() - startTimeRef.current - paused;
  }, []);

  const getElapsedSeconds = useCallback(() => Math.round(getElapsedMs() / 1000), [getElapsedMs]);

  const stopActivity = useCallback(() => {
    isActiveRef.current = false;
    setIsActive(false);
  }, []);

  useEffect(() => {
    if (exerciseTypeRef.current === exerciseType) return;

    exerciseTypeRef.current = exerciseType;
    stopActivity();
    counterRef.current = createCounter(exerciseType);
    setCount(0);
    setMode('count');
    setTargetCount(DEFAULT_TARGETS[exerciseType]);
    setTargetDuration(DEFAULT_DURATIONS[exerciseType]);
    setIsSaving(false);
    setTimeUp(false);
    startTimeRef.current = null;
    prevCountRef.current = 0;
    savedSessionRef.current = null;
    savePromiseRef.current = null;
    // 重置暂停态
    setIsPaused(false);
    isPausedRef.current = false;
    pauseStartRef.current = null;
    pausedAccumRef.current = 0;
  }, [exerciseType, stopActivity]);

  useEffect(() => {
    if (!isActive || mode !== 'timed') return;

    // 新会话开始时重置 timeUp，防止上一轮的 stale state 触发立即停止
    setTimeUp(false);

    const timer = setInterval(() => {
      if (!startTimeRef.current || isPausedRef.current) return;
      const elapsed = Math.round(getElapsedMs() / 1000);
      if (elapsed >= targetDuration) {
        setTimeUp(true);
      }
    }, 200);

    return () => clearInterval(timer);
  }, [isActive, mode, targetDuration, getElapsedMs]);

  useEffect(() => {
    if (timeUp && isActive && mode === 'timed') {
      stopActivity();
    }
  }, [timeUp, isActive, stopActivity, mode]);

  const processFrame = useCallback(
    (pose: Pose) => {
      if (!isActiveRef.current || isPausedRef.current) return;
      counterRef.current.processFrame(pose);
      const newCount = counterRef.current.getCount();
      if (newCount !== prevCountRef.current) {
        prevCountRef.current = newCount;
        setCount(newCount);
        playCountTick();
      }
    },
    [],
  );

  const start = useCallback(() => {
    if (isActiveRef.current) return; // 防止连击重入
    // 防护：targetDuration 必须在合理范围内 [10, 3600]
    if (targetDuration < 10) {
      console.warn(`[useWorkout] targetDuration ${targetDuration}s 低于下限 10s，已自动纠正`);
    }
    counterRef.current.reset();
    setCount(0);
    isActiveRef.current = true;
    setIsActive(true);
    setTimeUp(false);
    savedSessionRef.current = null;
    savePromiseRef.current = null;
    startTimeRef.current = Date.now();
    // 重置暂停态，确保每次开始都是干净会话
    isPausedRef.current = false;
    pauseStartRef.current = null;
    pausedAccumRef.current = 0;
    setIsPaused(false);
  }, []);

  const stop = useCallback(async (): Promise<StopResult> => {
    stopActivity();

    if (savedSessionRef.current) {
      return { session: savedSessionRef.current, saved: true };
    }

    if (savePromiseRef.current) {
      return savePromiseRef.current;
    }

    const finalCount = counterRef.current.getCount();

    if (finalCount === 0 && mode !== 'timed') {
      return { session: null, saved: false };
    }

    const duration = startTimeRef.current
      ? Math.round(getElapsedMs() / 1000)
      : targetDuration;

    // 计算完时长后再清理暂停态，避免影响时长统计
    isPausedRef.current = false;
    pauseStartRef.current = null;
    pausedAccumRef.current = 0;
    setIsPaused(false);

    const session: WorkoutSession = {
      id: generateId(),
      exerciseType,
      mode,
      count: finalCount,
      duration,
      timestamp: Date.now(),
    };

    const savePromise = (async (): Promise<StopResult> => {
      setIsSaving(true);
      try {
        await StorageService.saveWorkout(session);
        if (savePromiseRef.current !== null) {
          savedSessionRef.current = session;
        }
        return { session, saved: true };
      } catch (err) {
        ErrorReporter.captureError(err, { source: 'useWorkout', action: 'saveSession' });
        return { session, saved: false };
      } finally {
        setIsSaving(false);
        if (savePromiseRef.current !== null) {
          savePromiseRef.current = null;
        }
      }
    })();

    savePromiseRef.current = savePromise;
    return savePromise;
  }, [exerciseType, mode, stopActivity, targetDuration]);

  const pause = useCallback(() => {
    if (!isActiveRef.current || isPausedRef.current) return;
    isPausedRef.current = true;
    pauseStartRef.current = Date.now();
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    if (!isActiveRef.current || !isPausedRef.current) return;
    if (pauseStartRef.current) {
      pausedAccumRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = null;
    }
    isPausedRef.current = false;
    setIsPaused(false);
  }, []);

  const getFeedback = useCallback(
    (pose: Pose) => {
      return counterRef.current.getFeedback(pose);
    },
    [],
  );

  const switchMode = useCallback(
    (newMode: WorkoutMode) => {
      if (isActive) return;
      setMode(newMode);
    },
    [isActive],
  );

  return {
    isActive,
    count,
    mode,
    targetCount,
    setTargetCount,
    targetDuration,
    setTargetDuration,
    isSaving,
    timeUp,
    isPaused,
    startTime: startTimeRef.current,
    processFrame,
    getFeedback,
    start,
    stop,
    pause,
    resume,
    getElapsedSeconds,
    switchMode,
  };
}
