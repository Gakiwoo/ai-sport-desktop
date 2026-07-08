import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseNotificationResult {
  notification: string | null;
  notifExiting: boolean;
  showNotification: (msg: string) => void;
  dismissNotification: () => void;
}

const VISIBLE_MS = 4000;
const EXIT_MS = 250;

/**
 * 训练页通知条的状态与计时管理。
 * 从 WorkoutPage 抽取，消除页内联的计时器 ref 与两个 useCallback，
 * 使通知逻辑可独立复用与测试（R7 收尾）。
 */
export function useNotification(): UseNotificationResult {
  const [notification, setNotification] = useState<string | null>(null);
  const [notifExiting, setNotifExiting] = useState(false);
  const notifTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifExitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (notifTimerRef.current) {
      clearTimeout(notifTimerRef.current);
      notifTimerRef.current = null;
    }
    if (notifExitTimerRef.current) {
      clearTimeout(notifExitTimerRef.current);
      notifExitTimerRef.current = null;
    }
  }, []);

  const showNotification = useCallback(
    (msg: string) => {
      clearTimers();
      setNotification(msg);
      setNotifExiting(false);
      notifTimerRef.current = setTimeout(() => {
        setNotifExiting(true);
        notifExitTimerRef.current = setTimeout(() => {
          setNotification(null);
          setNotifExiting(false);
          notifExitTimerRef.current = null;
        }, EXIT_MS);
      }, VISIBLE_MS);
    },
    [clearTimers],
  );

  const dismissNotification = useCallback(() => {
    clearTimers();
    if (!notification) return;
    setNotifExiting(true);
    notifExitTimerRef.current = setTimeout(() => {
      setNotification(null);
      setNotifExiting(false);
      notifExitTimerRef.current = null;
    }, EXIT_MS);
  }, [clearTimers, notification]);

  useEffect(() => clearTimers, [clearTimers]);

  return { notification, notifExiting, showNotification, dismissNotification };
}
