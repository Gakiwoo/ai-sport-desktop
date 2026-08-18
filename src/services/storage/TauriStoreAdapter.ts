import type { Store } from '@tauri-apps/plugin-store';
import type { IStorageAdapter } from './IStorageAdapter';
import { LocalStorageAdapter } from './LocalStorageAdapter';
import ErrorReporter from '../ErrorReporter';

/**
 * Tauri Store 适配器 — 用于生产桌面环境
 *
 * 使用 @tauri-apps/plugin-store 实现持久化存储：
 * - 无 localStorage 5MB 容量限制
 * - 数据存储在应用数据目录的 JSON 文件中
 * - 支持 Tauri 的安全沙箱
 *
 * P1-13 修复：此前初始化失败时 store 保持 null，get 返回 null、set 静默丢弃
 * （注释宣称"降级到 localStorage"但代码没有任何回退）→ 用户数据静默消失。
 * 现在初始化失败会真实委派给 LocalStorageAdapter，读写均有真实落盘。
 */
export class TauriStoreAdapter implements IStorageAdapter {
  private store: Store | null = null;
  private fallback: LocalStorageAdapter | null = null;
  private initPromise: Promise<void> | null = null;
  private readonly storeFile = 'ai-sport-store.json';

  constructor() {
    this.initPromise = this.init();
  }

  private async init(): Promise<void> {
    try {
      // 动态导入，非 Tauri 环境不会报错
      const { load } = await import('@tauri-apps/plugin-store');
      this.store = await load(this.storeFile, { autoSave: 100, defaults: {} });
    } catch (err) {
      // P1-13：真实降级到 localStorage（不再是假降级）
      ErrorReporter.captureError(err, {
        source: 'TauriStoreAdapter.init',
        error: err instanceof Error ? err.message : String(err),
      });
      try {
        this.fallback = new LocalStorageAdapter();
        ErrorReporter.captureWarning('TauriStore 初始化失败，已真实降级到 localStorage', {
          source: 'TauriStoreAdapter',
        });
      } catch (fallbackErr) {
        // localStorage 也不可用（极端环境）：保持 null，后续操作安全返回
        ErrorReporter.captureError(fallbackErr, {
          source: 'TauriStoreAdapter.fallback',
        });
      }
    }
  }

  private async ensureReady(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
      this.initPromise = null;
    }
  }

  async get(key: string): Promise<string | null> {
    await this.ensureReady();
    if (this.fallback) return this.fallback.get(key);
    if (!this.store) return null;

    try {
      const value = await this.store.get(key);
      return value !== null && value !== undefined ? String(value) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    await this.ensureReady();
    if (this.fallback) return this.fallback.set(key, value);
    if (!this.store) return;

    await this.store.set(key, value);
    await this.store.save();
  }

  async remove(key: string): Promise<void> {
    await this.ensureReady();
    if (this.fallback) return this.fallback.remove(key);
    if (!this.store) return;

    await this.store.delete(key);
    await this.store.save();
  }

  async keys(): Promise<string[]> {
    await this.ensureReady();
    if (this.fallback) return this.fallback.keys();
    if (!this.store) return [];

    try {
      const entries = await this.store.entries();
      return entries.map(([key]: [string, unknown]) => key);
    } catch {
      return [];
    }
  }

  async clear(): Promise<void> {
    await this.ensureReady();
    if (this.fallback) return this.fallback.clear();
    if (!this.store) return;

    try {
      const allKeys = await this.keys();
      for (const key of allKeys) {
        await this.store.delete(key);
      }
      await this.store.save();
    } catch (err) {
      ErrorReporter.captureWarning('TauriStore clear() 失败', {
        source: 'TauriStoreAdapter',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
