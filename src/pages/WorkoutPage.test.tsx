import { render, act, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkout } from '../hooks/useWorkout';
import WorkoutPage from './WorkoutPage';

vi.mock('../components/CameraView', () => ({
  default: () => <div data-testid="camera-view" />,
}));

vi.mock('../services/SoundService', () => ({
  playGoalReached: vi.fn(),
}));

vi.mock('../hooks/useWorkout', () => ({
  useWorkout: vi.fn(),
}));

const stopMock = vi.fn().mockResolvedValue({ session: null, saved: false });

function renderWorkoutPage() {
  return render(
    <MemoryRouter
      initialEntries={['/workout/squats']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/workout/:exerciseType" element={<WorkoutPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('WorkoutPage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stopMock.mockClear();
    vi.mocked(useWorkout).mockReturnValue({
      isActive: false,
      count: 3,
      mode: 'timed',
      targetCount: 20,
      setTargetCount: vi.fn(),
      targetDuration: 60,
      setTargetDuration: vi.fn(),
      isSaving: false,
      timeUp: true,
      isPaused: false,
      startTime: null,
      processFrame: vi.fn(),
      getFeedback: vi.fn(),
      start: vi.fn(),
      stop: stopMock,
      pause: vi.fn(),
      resume: vi.fn(),
      getElapsedSeconds: vi.fn(() => 0),
      switchMode: vi.fn(),
    });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('clears delayed timed-stop callback when unmounted', async () => {
    const { unmount } = renderWorkoutPage();

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(900);
    });

    expect(stopMock).not.toHaveBeenCalled();
  });

  it('renders readable Chinese workout labels', () => {
    // 本测试只验证标签渲染，不需要 timeUp=true（那会触发定时模式的
    // showNotification useEffect 导致 act() 警告）。单独覆盖 mock 关掉 timeUp。
    vi.mocked(useWorkout).mockReturnValue({
      isActive: false,
      count: 0,
      mode: 'timed',
      targetCount: 20,
      setTargetCount: vi.fn(),
      targetDuration: 60,
      setTargetDuration: vi.fn(),
      isSaving: false,
      timeUp: false,
      isPaused: false,
      startTime: null,
      processFrame: vi.fn(),
      getFeedback: vi.fn(),
      start: vi.fn(),
      stop: stopMock,
      pause: vi.fn(),
      resume: vi.fn(),
      getElapsedSeconds: vi.fn(() => 0),
      switchMode: vi.fn(),
    });

    renderWorkoutPage();

    expect(screen.getByRole('heading', { name: '深蹲' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /目标: 01:00/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /开始训练/ })).toBeTruthy();
  });
});
