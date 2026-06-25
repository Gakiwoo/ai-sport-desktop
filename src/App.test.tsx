import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeAll } from 'vitest';
import App from './App';

// Mock matchMedia for useTheme hook (jsdom doesn't implement it)
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

const moduleLoads = vi.hoisted(() => ({
  analytics: 0,
  history: 0,
  workout: 0,
}));

vi.mock('./pages/AnalyticsPage', () => {
  moduleLoads.analytics += 1;
  return {
    default: () => <div>Analytics mock</div>,
  };
});

vi.mock('./pages/HistoryPage', () => {
  moduleLoads.history += 1;
  return {
    default: () => <div>History mock</div>,
  };
});

vi.mock('./pages/WorkoutPage', () => {
  moduleLoads.workout += 1;
  return {
    default: () => <div>Workout mock</div>,
  };
});

describe('App route loading', () => {
  it('does not load analytics code on the home route', () => {
    window.location.hash = '#/';

    render(<App />);

    expect(screen.getByText('AI SPORT')).toBeTruthy();
    expect(moduleLoads.analytics).toBe(0);
    expect(moduleLoads.history).toBe(0);
    expect(moduleLoads.workout).toBe(0);
  });
});
