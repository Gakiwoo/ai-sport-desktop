import type { Store } from '@tauri-apps/plugin-store';
import type { IStorageAdapter } from './IStorageAdapter';
import ErrorReporter from '../ErrorReporter';

/**
 * Tauri Store 适配器 — 用于生产桌面环境
 *
 * 使用 @tauri-apps/plugin-store 实现持久化存储：
 * - 无 localStorage 5MB 容量限制
 * - 数据存储在应用数据目录的 JSON 文件中
 * - 支持 Tauri 的安全沙箱
 *
 * 安装依赖：
 *   cargo add tauri-plugin-store
 *   npm install @tauri-apps/plugin-store
 *
 * 注册插件（src-tauri/src/lib.rs）：
 *   .plugin(tauri_plugin_store::Builder::default().build())
 */
export class TauriStoreAdapter implements IStorageAdapter {
  private store: Store | null = null;
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
      ErrorReporter.captureWarning('TauriStore 初始化失败，降级到 localStorage', {
        source: 'TauriStoreAdapter',
        error: err instanceof Error ? err.message : String(err),
      });
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
    if (!this.store) return;

    await this.store.set(key, value);
    await this.store.save();
  }

  async remove(key: string): Promise<void> {
    await this.ensureReady();
    if (!this.store) return;

    await this.store.delete(key);
    await this.store.save();
  }

  async keys(): Promise<string[]> {
    await this.ensureReady();
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
