import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AnalyticsPage from './AnalyticsPage';
import StorageService from '../services/StorageService';
import type { WorkoutSession } from '../types';

vi.mock('../services/StorageService', () => ({
  default: {
    getAnalytics: vi.fn(),
  },
}));

/** 构造一条完整的训练记录 */
function makeSession(overrides: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    exerciseType: 'squats',
    mode: 'count',
    count: 20,
    duration: 120,
    timestamp: Date.now(),
    ...overrides,
  };
}

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={['/analytics']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AnalyticsPage />
    </MemoryRouter>,
  );
}

describe('AnalyticsPage', () => {
  beforeEach(() => {
    vi.mocked(StorageService.getAnalytics).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('data fetching states', () => {
    it('renders loading skeleton on mount', () => {
      vi.mocked(StorageService.getAnalytics).mockReturnValue(
        new Promise(() => {
          /* never resolves */
        }),
      );

      renderPage();

      // 加载中应显示骨架占位
      expect(screen.getByText('加载中...')).toBeTruthy();
    });

    it('renders error message when load fails', async () => {
      vi.mocked(StorageService.getAnalytics).mockRejectedValue(new Error('network error'));

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('数据加载失败，请稍后重试')).toBeTruthy();
      });
    });

    it('renders stats and charts after successful load', async () => {
      const sessions = [makeSession({ count: 30, duration: 200 }), makeSession({ count: 15 })];
      vi.mocked(StorageService.getAnalytics).mockResolvedValue({
        totalWorkouts: 2,
        totalReps: 45,
        avgReps: 22.5,
        recentWorkouts: sessions,
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByText('45')).toBeTruthy();
      });
    });
  });

  describe('time range selector', () => {
    it('renders all four time range buttons', async () => {
      vi.mocked(StorageService.getAnalytics).mockResolvedValue({
        totalWorkouts: 0,
        totalReps: 0,
        avgReps: 0,
        recentWorkouts: [],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '近 7 天' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '近 14 天' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '近 30 天' })).toBeTruthy();
        expect(screen.getByRole('button', { name: '全部' })).toBeTruthy();
      });
    });

    it('shows chart empty placeholder when no data in range', async () => {
      // 传入旧数据（超出 7 天范围），选择 "近 7 天" 后图表为空
      const oldSession = makeSession({ timestamp: Date.now() - 14 * 24 * 60 * 60 * 1000 });
      vi.mocked(StorageService.getAnalytics).mockResolvedValue({
        totalWorkouts: 1,
        totalReps: 10,
        avgReps: 10,
        recentWorkouts: [oldSession],
      });

      renderPage();

      await waitFor(() => {
        // 旧数据被过滤，图表显示"暂无数据"
        const emptyPlaceholders = screen.getAllByText('暂无数据');
        expect(emptyPlaceholders.length).toBeGreaterThan(0);
      });
    });
  });

  describe('navigation', () => {
    it('renders a back button that navigates home', async () => {
      vi.mocked(StorageService.getAnalytics).mockResolvedValue({
        totalWorkouts: 0,
        totalReps: 0,
        avgReps: 0,
        recentWorkouts: [],
      });

      renderPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: '返回' })).toBeTruthy();
      });
    });
  });
});
