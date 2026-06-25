/**
 * 存储适配器接口 — 抽象底层存储实现
 *
 * 实现类：
 * - LocalStorageAdapter：浏览器 localStorage（开发/测试/降级）
 * - TauriStoreAdapter：tauri-plugin-store（生产桌面）
 */
export interface IStorageAdapter {
  /** 读取键值，不存在返回 null */
  get(key: string): Promise<string | null>;

  /** 写入键值 */
  set(key: string, value: string): Promise<void>;

  /** 删除键值 */
  remove(key: string): Promise<void>;

  /** 读取所有键值 */
  keys(): Promise<string[]>;

  /** 清空所有数据 */
  clear(): Promise<void>;
}
