import type { IStorageAdapter } from './IStorageAdapter';

/**
 * localStorage 适配器 — 用于浏览器环境、开发模式和测试
 *
 * 限制：localStorage 有 ~5MB 容量上限，且为同步 API（此处包装为 async 以统一接口）
 */
export class LocalStorageAdapter implements IStorageAdapter {
  async get(key: string): Promise<string | null> {
    return localStorage.getItem(key);
  }

  async set(key: string, value: string): Promise<void> {
    try {
      localStorage.setItem(key, value);
    } catch {
      // 存储满时尝试清理并重试
      this.emergencyCleanup();
      localStorage.setItem(key, value);
    }
  }

  async remove(key: string): Promise<void> {
    localStorage.removeItem(key);
  }

  async keys(): Promise<string[]> {
    return Object.keys(localStorage);
  }

  async clear(): Promise<void> {
    localStorage.clear();
  }

  /** 紧急清理：删除超过 30 天的旧数据键 */
  private emergencyCleanup(): void {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('ai_sport_')) {
        try {
          const data = localStorage.getItem(key);
          if (data) {
            const parsed = JSON.parse(data);
            // 如果是数组且超过 100 条，只保留最近 50 条
            if (Array.isArray(parsed) && parsed.length > 100) {
              localStorage.setItem(key, JSON.stringify(parsed.slice(-50)));
            }
          }
        } catch {
          keysToRemove.push(key);
        }
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  }
}
