import { useCallback, useEffect, useState } from 'react';
import type { IStorageAdapter } from '../services/storage/IStorageAdapter';
import { createStorageAdapter } from '../services/storage/createStorageAdapter';
import ErrorReporter from '../services/ErrorReporter';

export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'ai-sport-theme';

let storage: IStorageAdapter | null = null;

function getStorage(): IStorageAdapter {
  if (!storage) {
    storage = createStorageAdapter();
  }
  return storage;
}

function getSystemTheme(): 'light' | 'dark' {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  const resolved = theme === 'system' ? getSystemTheme() : theme;
  document.documentElement.setAttribute('data-theme', resolved);
}

async function safeGetStorage(key: string): Promise<string | null> {
  try {
    return await getStorage().get(key);
  } catch (err) {
    ErrorReporter.captureWarning('主题存储读取失败', {
      source: 'useTheme',
      action: 'read',
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

async function safeSetStorage(key: string, value: string): Promise<void> {
  try {
    await getStorage().set(key, value);
  } catch (err) {
    ErrorReporter.captureWarning('主题存储写入失败', {
      source: 'useTheme',
      action: 'write',
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** 兼容旧版非标准 addEventListener / 新版标准 addEventListener（LOW-3） */
function watchSystemTheme(handler: () => void): () => void {
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  // 优先使用新版标准 API
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }
  // 旧版降级（Safari < 14）
  mql.addListener(handler);
  return () => mql.removeListener(handler);
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>('system');
  const [hydrated, setHydrated] = useState(false);

  // 启动时异步从存储适配器读取，防止主题闪烁
  useEffect(() => {
    safeGetStorage(STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark' || stored === 'system') {
        setThemeState(stored as Theme);
        applyTheme(stored as Theme);
      }
    }).finally(() => setHydrated(true));
  }, []);

  const setTheme = useCallback(async (newTheme: Theme) => {
    setThemeState(newTheme);
    await safeSetStorage(STORAGE_KEY, newTheme);
    applyTheme(newTheme);
  }, []);

  // theme state 变化时重新应用
  useEffect(() => {
    if (hydrated) applyTheme(theme);
  }, [theme, hydrated]);

  // 监听系统主题变更（仅 system 模式生效）
  useEffect(() => {
    if (theme !== 'system') return;
    return watchSystemTheme(() => applyTheme('system'));
  }, [theme]);

  const resolvedTheme: 'light' | 'dark' = theme === 'system' ? getSystemTheme() : theme;

  return { theme, setTheme, resolvedTheme, hydrated };
}
