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
  const [counter, setCounter] = useState<ExerciseCounter>(() => createCounter(exerciseType));

  const stopActivity = useCallback(() => {
    isActiveRef.current = false;
    setIsActive(false);
  }, []);

  useEffect(() => {
    if (exerciseTypeRef.current === exerciseType) return;

    exerciseTypeRef.current = exerciseType;
    stopActivity();
    setCounter(createCounter(exerciseType));
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
  }, [exerciseType, stopActivity]);

  useEffect(() => {
    if (!isActive || mode !== 'timed') return;

    // 新会话开始时重置 timeUp，防止上一轮的 stale state 触发立即停止
    setTimeUp(false);

    const timer = setInterval(() => {
      if (!startTimeRef.current) return;
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
      if (elapsed >= targetDuration) {
        setTimeUp(true);
      }
    }, 200);

    return () => clearInterval(timer);
  }, [isActive, mode, targetDuration]);

  useEffect(() => {
    if (timeUp && isActive && mode === 'timed') {
      stopActivity();
    }
  }, [timeUp, isActive, stopActivity, mode]);

  const processFrame = useCallback(
    (pose: Pose) => {
      if (!isActiveRef.current) return;
      counter.processFrame(pose);
      const newCount = counter.getCount();
      if (newCount !== prevCountRef.current) {
        prevCountRef.current = newCount;
        setCount(newCount);
        playCountTick();
      }
    },
    [counter],
  );

  const start = useCallback(() => {
    if (isActiveRef.current) return; // 防止连击重入
    counter.reset();
    setCount(0);
    isActiveRef.current = true;
    setIsActive(true);
    setTimeUp(false);
    savedSessionRef.current = null;
    savePromiseRef.current = null;
    startTimeRef.current = Date.now();
  }, [counter]);

  const stop = useCallback(async (): Promise<StopResult> => {
    stopActivity();

    if (savedSessionRef.current) {
      return { session: savedSessionRef.current, saved: true };
    }

    if (savePromiseRef.current) {
      return savePromiseRef.current;
    }

    const finalCount = counter.getCount();

    if (finalCount === 0 && mode !== 'timed') {
      return { session: null, saved: false };
    }

    const duration = startTimeRef.current
      ? Math.round((Date.now() - startTimeRef.current) / 1000)
      : targetDuration;

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
        // 防御竞态：start() 会重置 savedSessionRef 和 savePromiseRef 为 null
        // 若两个 ref 均为 null，说明新会话已开始，不应写入旧会话
        if (savePromiseRef.current !== null) {
          savedSessionRef.current = session;
        }
        return { session, saved: true };
      } catch (err) {
        console.error('保存训练记录失败:', err);
        return { session, saved: false };
      } finally {
        setIsSaving(false);
        // 仅当 start() 未重置时清除（避免清除新会话的 promise）
        if (savePromiseRef.current !== null) {
          savePromiseRef.current = null;
        }
      }
    })();

    savePromiseRef.current = savePromise;
    return savePromise;
  }, [counter, exerciseType, mode, stopActivity, targetDuration]);

  const getFeedback = useCallback(
    (pose: Pose) => {
      return counter.getFeedback(pose);
    },
    [counter],
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
    startTime: startTimeRef.current,
    processFrame,
    getFeedback,
    start,
    stop,
    switchMode,
  };
}
