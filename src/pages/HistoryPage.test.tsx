import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import HistoryPage from './HistoryPage';
import StorageService from '../services/StorageService';
import type { WorkoutSession } from '../types';

vi.mock('../services/StorageService', () => ({
  default: {
    getWorkoutHistory: vi.fn(),
    deleteWorkout: vi.fn(),
    clearHistory: vi.fn(),
  },
}));

vi.mock('../components/ExerciseIllustration', () => ({
  default: ({ type }: { type: string }) => <span data-testid={`illustration-${type}`}>{type}</span>,
}));

function makeSession(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    exerciseType: 'squats',
    mode: 'count',
    count: 20,
    duration: 120,
    timestamp: Date.now() - 24 * 60 * 60 * 1000, // 昨天，方便分组
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={['/history']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <HistoryPage />
    </MemoryRouter>,
  );
}

describe('HistoryPage', () => {
  beforeEach(() => {
    vi.mocked(StorageService.getWorkoutHistory).mockReset();
    vi.mocked(StorageService.deleteWorkout).mockReset();
    vi.mocked(StorageService.clearHistory).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('data fetching states', () => {
    it('renders loading message on mount', () => {
      vi.mocked(StorageService.getWorkoutHistory).mockReturnValue(
        new Promise(() => {
          /* pending */
        }),
      );

      renderPage();

      expect(screen.getByText('加载中...')).toBeTruthy();
    });

    it('renders error message with retry button when load fails', async () => {
      vi.mocked(StorageService.getWorkoutHistory).mockRejectedValue(new Error('fail'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('数据加载失败，请稍后重试')).toBeTruthy();
      });
      expect(screen.getByRole('button', { name: '重新加载' })).toBeTruthy();
    });
  });

  describe('empty state', () => {
    it('renders empty guide when no workouts in history', async () => {
      vi.mocked(StorageService.getWorkoutHistory).mockResolvedValue([]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('暂无训练记录')).toBeTruthy();
      });
      expect(screen.getByRole('button', { name: '开始第一次训练' })).toBeTruthy();
    });
  });

  describe('history list', () => {
    it('groups workouts by relative date', async () => {
      const today = makeSession({
        id: 'a',
        timestamp: Date.now() - 1000,
        exerciseType: 'jump_rope',
        count: 50,
      });
      const yesterday = makeSession({
        id: 'b',
        timestamp: Date.now() - 24 * 60 * 60 * 1000,
        exerciseType: 'squats',
        count: 20,
      });
      vi.mocked(StorageService.getWorkoutHistory).mockResolvedValue([today, yesterday]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('今天')).toBeTruthy();
        expect(screen.getByText('昨天')).toBeTruthy();
      });
      // 50 次和 20 次都应可见
      expect(screen.getByText('50 次')).toBeTruthy();
      expect(screen.getByText('20 次')).toBeTruthy();
    });

    it('renders filter tabs when history exists', async () => {
      vi.mocked(StorageService.getWorkoutHistory).mockResolvedValue([makeSession()]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '全部' })).toBeTruthy();
      });
    });

    it('filters by exercise type when a filter tab is clicked', async () => {
      const squatSession = makeSession({ id: 'a', exerciseType: 'squats', count: 10 });
      const ropeSession = makeSession({ id: 'b', exerciseType: 'jump_rope', count: 30 });
      vi.mocked(StorageService.getWorkoutHistory).mockResolvedValue([squatSession, ropeSession]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('10 次')).toBeTruthy();
        expect(screen.getByText('30 次')).toBeTruthy();
      });

      // 点击"跳绳"筛选
      fireEvent.click(screen.getByRole('button', { name: '跳绳' }));

      // 应该只显示跳绳的 30 次
      await waitFor(() => {
        expect(screen.getByText('30 次')).toBeTruthy();
        expect(screen.queryByText('10 次')).toBeNull();
      });
    });
  });

  describe('delete workflow', () => {
    it('removes the deleted item from the list', async () => {
      const session = makeSession({ id: 'del-me' });
      vi.mocked(StorageService.getWorkoutHistory).mockResolvedValue([session]);
      vi.mocked(StorageService.deleteWorkout).mockResolvedValue();

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('20 次')).toBeTruthy();
      });

      fireEvent.click(screen.getByRole('button', { name: '删除记录' }));

      await waitFor(() => {
        expect(StorageService.deleteWorkout).toHaveBeenCalledWith('del-me');
        expect(screen.queryByText('20 次')).toBeNull();
      });
    });
  });

  describe('clear all', () => {
    it('opens confirmation modal and clears history on confirm', async () => {
      vi.mocked(StorageService.getWorkoutHistory).mockResolvedValue([makeSession()]);
      vi.mocked(StorageService.clearHistory).mockResolvedValue();

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '清空' })).toBeTruthy();
      });

      // 打开确认弹窗
      fireEvent.click(screen.getByRole('button', { name: '清空' }));

      await waitFor(() => {
        expect(screen.getByText('确认清空')).toBeTruthy();
        expect(screen.getByText('将删除所有训练记录，此操作不可撤销。')).toBeTruthy();
      });

      // 确认清空（modal 内的 danger 按钮，用 getAllByRole 取最后一个）
      const confirmBtns = screen.getAllByRole('button', { name: '清空' });
      fireEvent.click(confirmBtns[confirmBtns.length - 1]);

      await waitFor(() => {
        expect(StorageService.clearHistory).toHaveBeenCalled();
      });
    });

    it('closes modal on cancel without clearing', async () => {
      vi.mocked(StorageService.getWorkoutHistory).mockResolvedValue([makeSession()]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '清空' })).toBeTruthy();
      });

      fireEvent.click(screen.getByRole('button', { name: '清空' }));
      await waitFor(() => {
        expect(screen.getByText('确认清空')).toBeTruthy();
      });

      fireEvent.click(screen.getByRole('button', { name: '取消' }));

      await waitFor(() => {
        expect(screen.queryByText('确认清空')).toBeNull();
      });
      expect(StorageService.clearHistory).not.toHaveBeenCalled();
    });
  });

  describe('navigation', () => {
    it('renders a back button', async () => {
      vi.mocked(StorageService.getWorkoutHistory).mockResolvedValue([]);

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '返回' })).toBeTruthy();
      });
    });
  });
});
