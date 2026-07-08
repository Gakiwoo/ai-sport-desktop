import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNotification } from './useNotification';

describe('useNotification', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('初始无通知', () => {
    const { result } = renderHook(() => useNotification());
    expect(result.current.notification).toBeNull();
    expect(result.current.notifExiting).toBe(false);
  });

  it('showNotification 立即显示，并在 VISIBLE_MS 后进入退出态、EXIT_MS 后清除', () => {
    const { result } = renderHook(() => useNotification());
    act(() => {
      result.current.showNotification('你好');
    });
    expect(result.current.notification).toBe('你好');
    expect(result.current.notifExiting).toBe(false);

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.notifExiting).toBe(true);

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current.notification).toBeNull();
    expect(result.current.notifExiting).toBe(false);
  });

  it('退出动画前 dismissNotification 立即隐藏', () => {
    const { result } = renderHook(() => useNotification());
    act(() => {
      result.current.showNotification('提示');
    });
    act(() => {
      result.current.dismissNotification();
    });
    expect(result.current.notifExiting).toBe(true);
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(result.current.notification).toBeNull();
    expect(result.current.notifExiting).toBe(false);
  });

  it('无通知时 dismissNotification 为 no-op', () => {
    const { result } = renderHook(() => useNotification());
    act(() => {
      result.current.dismissNotification();
    });
    expect(result.current.notifExiting).toBe(false);
    expect(result.current.notification).toBeNull();
  });

  it('连续 showNotification 取消前一个计时器', () => {
    const { result } = renderHook(() => useNotification());
    act(() => {
      result.current.showNotification('一');
    });
    act(() => {
      result.current.showNotification('二');
    });
    expect(result.current.notification).toBe('二');
    // 推进到第二条的 VISIBLE_MS：第二条应进入退出态
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(result.current.notifExiting).toBe(true);
  });
});
