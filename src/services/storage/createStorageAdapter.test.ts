import { describe, it, expect, afterEach, vi } from 'vitest';
import { createStorageAdapter } from './createStorageAdapter';
import { LocalStorageAdapter } from './LocalStorageAdapter';
import { TauriStoreAdapter } from './TauriStoreAdapter';

// 避免真实加载 Tauri 运行时；返回最小可用 fake store
vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(async () => ({
    get: async () => null,
    set: async () => {},
    delete: async () => {},
    entries: async () => [],
    save: async () => {},
  })),
}));

describe('createStorageAdapter', () => {
  const marker = '__TAURI_INTERNALS__';
  const original = (window as unknown as Record<string, unknown>)[marker];

  afterEach(() => {
    if (original === undefined) {
      delete (window as unknown as Record<string, unknown>)[marker];
    } else {
      (window as unknown as Record<string, unknown>)[marker] = original;
    }
  });

  it('非 Tauri 环境返回 LocalStorageAdapter', () => {
    delete (window as unknown as Record<string, unknown>)[marker];
    const adapter = createStorageAdapter();
    expect(adapter).toBeInstanceOf(LocalStorageAdapter);
  });

  it('Tauri 环境返回 TauriStoreAdapter', () => {
    (window as unknown as Record<string, unknown>)[marker] = {};
    const adapter = createStorageAdapter();
    expect(adapter).toBeInstanceOf(TauriStoreAdapter);
  });
});
