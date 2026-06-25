import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExerciseType, WorkoutSession } from '../types';

vi.mock('../services/SoundService', () => ({
  playCountTick: vi.fn(),
}));

vi.mock('../services/StorageService', () => ({
  default: {
    saveWorkout: vi.fn().mockResolvedValue(undefined),
    getWorkoutHistory: vi.fn().mockResolvedValue([]),
    clearHistory: vi.fn().mockResolvedValue(undefined),
    deleteWorkout: vi.fn().mockResolvedValue(undefined),
    getAnalytics: vi.fn().mockResolvedValue({
      totalWorkouts: 0,
      totalReps: 0,
      avgReps: 0,
      recentWorkouts: [],
    }),
  },
}));

import StorageService from '../services/StorageService';
import { useWorkout } from './useWorkout';

type StopResult = {
  session: WorkoutSession | null;
  saved: boolean;
  autoStopped?: boolean;
};

describe('useWorkout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saves a timed workout only once when stop is called repeatedly', async () => {
    const { result } = renderHook(() => useWorkout('squats'));

    act(() => {
      result.current.switchMode('timed');
    });
    act(() => {
      result.current.start();
    });

    let firstStop!: StopResult;
    let secondStop!: StopResult;
    await act(async () => {
      firstStop = await result.current.stop();
      secondStop = await result.current.stop();
    });

    expect(StorageService.saveWorkout).toHaveBeenCalledTimes(1);
    expect(firstStop.saved).toBe(true);
    expect(secondStop.saved).toBe(true);
    expect(secondStop.session?.id).toBe(firstStop.session?.id);
  });

  it('resets exercise defaults when exercise type changes in the same route instance', () => {
    const { result, rerender } = renderHook(
      ({ exerciseType }: { exerciseType: ExerciseType }) => useWorkout(exerciseType),
      { initialProps: { exerciseType: 'squats' as ExerciseType } },
    );

    expect(result.current.targetCount).toBe(20);
    expect(result.current.targetDuration).toBe(60);

    rerender({ exerciseType: 'standing_long_jump' as const });

    expect(result.current.count).toBe(0);
    expect(result.current.targetCount).toBe(5);
    expect(result.current.targetDuration).toBe(30);
    expect(result.current.mode).toBe('count');
  });
});
