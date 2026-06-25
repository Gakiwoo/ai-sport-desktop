import type { IStorageAdapter } from './IStorageAdapter';
import { LocalStorageAdapter } from './LocalStorageAdapter';
import { TauriStoreAdapter } from './TauriStoreAdapter';

/**
 * 自动选择存储适配器
 *
 * 检测策略：
 * 1. 如果在 Tauri 环境中（window.__TAURI__ 存在）→ 使用 TauriStoreAdapter
 * 2. 否则降级到 LocalStorageAdapter
 *
 * TauriStoreAdapter 初始化失败时也会自动降级到 localStorage
 */
export function createStorageAdapter(): IStorageAdapter {
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  if (isTauri) {
    try {
      return new TauriStoreAdapter();
    } catch {
      console.warn('[Storage] TauriStoreAdapter 创建失败，降级到 localStorage');
    }
  }

  return new LocalStorageAdapter();
}
