import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExerciseType, Pose } from '../types';

const mockProcessFrame = vi.fn();
const mockGetCount = vi.fn(() => 0);

vi.mock('../services/SoundService', () => ({
  playCountTick: vi.fn(),
}));

vi.mock('../services/StorageService', () => ({
  default: {
    saveWorkout: vi.fn().mockResolvedValue(undefined),
  },
}));

// 用可控的 mock 计数器追踪 processFrame 调用次数
vi.mock('../services/counters/SquatsCounter', () => ({
  SquatsCounter: class {
    processFrame = mockProcessFrame;
    getCount = mockGetCount;
    getFeedback = vi.fn(() => null);
    reset = vi.fn();
    getPhase = vi.fn(() => 'neutral');
    getFrameInterval = vi.fn(() => 33);
    setFrameInterval = vi.fn();
  },
}));

import { useWorkout } from './useWorkout';

describe('useWorkout 暂停/恢复', () => {
  let now = 1000;

  beforeEach(() => {
    vi.clearAllMocks();
    mockProcessFrame.mockClear();
    mockGetCount.mockReturnValue(0);
    now = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('pause 后 processFrame 不计数，resume 后恢复', () => {
    const { result } = renderHook(() => useWorkout('squats' as ExerciseType));
    const pose = {} as Pose;

    act(() => result.current.start());
    act(() => result.current.processFrame(pose));
    act(() => result.current.processFrame(pose));
    expect(mockProcessFrame).toHaveBeenCalledTimes(2);

    act(() => result.current.pause());
    act(() => result.current.processFrame(pose));
    expect(mockProcessFrame).toHaveBeenCalledTimes(2); // 暂停期间不计帧
    expect(result.current.isPaused).toBe(true);

    act(() => result.current.resume());
    act(() => result.current.processFrame(pose));
    expect(mockProcessFrame).toHaveBeenCalledTimes(3);
    expect(result.current.isPaused).toBe(false);
  });

  it('getElapsedSeconds 在暂停期间冻结', () => {
    const { result } = renderHook(() => useWorkout('squats' as ExerciseType));
    act(() => result.current.start());
    now = 3000; // 激活 2s
    expect(result.current.getElapsedSeconds()).toBe(2);

    act(() => result.current.pause());
    now = 8000; // 墙上已过 5s，但处于暂停
    expect(result.current.getElapsedSeconds()).toBe(2); // 冻结

    act(() => result.current.resume());
    now = 9000; // 再激活 1s
    expect(result.current.getElapsedSeconds()).toBe(3);
  });

  it('stop 的 duration 扣除暂停时长', async () => {
    const { result } = renderHook(() => useWorkout('squats' as ExerciseType));
    act(() => result.current.switchMode('timed'));
    act(() => result.current.start());
    now = 5000; // 激活 4s
    act(() => result.current.pause());
    now = 9000; // 暂停 4s
    act(() => result.current.resume());
    now = 10000; // 再激活 1s → 共 5s

    let stopResult!: { session: { duration: number } | null; saved: boolean };
    await act(async () => {
      stopResult = (await result.current.stop()) as {
        session: { duration: number } | null;
        saved: boolean;
      };
    });
    expect(stopResult.session?.duration).toBe(5);
  });
});
