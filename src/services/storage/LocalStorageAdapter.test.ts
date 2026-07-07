import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalStorageAdapter } from './LocalStorageAdapter';

describe('LocalStorageAdapter', () => {
  let adapter: LocalStorageAdapter;

  beforeEach(() => {
    localStorage.clear();
    adapter = new LocalStorageAdapter();
  });

  it('get 在键不存在时返回 null', async () => {
    expect(await adapter.get('missing')).toBeNull();
  });

  it('set 后 get 可往返读回', async () => {
    await adapter.set('k1', 'v1');
    expect(await adapter.get('k1')).toBe('v1');
  });

  it('set 覆盖已有键', async () => {
    await adapter.set('k', 'a');
    await adapter.set('k', 'b');
    expect(await adapter.get('k')).toBe('b');
  });

  it('remove 删除键后 get 返回 null', async () => {
    await adapter.set('k', 'v');
    await adapter.remove('k');
    expect(await adapter.get('k')).toBeNull();
  });

  it('keys 返回全部键', async () => {
    await adapter.set('a', '1');
    await adapter.set('b', '2');
    const keys = await adapter.keys();
    expect(keys.sort()).toEqual(['a', 'b']);
  });

  it('clear 清空所有键', async () => {
    await adapter.set('a', '1');
    await adapter.set('b', '2');
    await adapter.clear();
    expect(await adapter.keys()).toEqual([]);
  });

  it('容量满时 emergencyCleanup 裁剪超长 ai_sport_ 数组并写入新值', async () => {
    // 构造超长（120 条）的 ai_sport_ 数据，触发裁剪到最近 50 条
    const oversized = Array.from({ length: 120 }, (_, i) => ({ id: `w${i}` }));
    localStorage.setItem('ai_sport_history', JSON.stringify(oversized));

    // 模拟 setItem 首次抛容量错误，第二次恢复默认实现
    const setItem = localStorage.setItem as unknown as ReturnType<typeof vi.fn>;
    setItem.mockImplementationOnce(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });

    await adapter.set('ai_sport_new', 'x');

    // 新值成功写入（第二次调用走默认实现）
    expect(await adapter.get('ai_sport_new')).toBe('x');
    // 超长数组已裁剪到最近 50 条
    const trimmed = JSON.parse(localStorage.getItem('ai_sport_history') as string);
    expect(Array.isArray(trimmed)).toBe(true);
    expect(trimmed).toHaveLength(50);
    expect(trimmed[49].id).toBe('w119');
  });

  it('emergencyCleanup 移除损坏（无法解析）的 ai_sport_ 键', async () => {
    localStorage.setItem('ai_sport_broken', '{not-valid-json');
    const setItem = localStorage.setItem as unknown as ReturnType<typeof vi.fn>;
    setItem.mockImplementationOnce(() => {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    });

    await adapter.set('ai_sport_other', 'y');
    expect(await adapter.get('ai_sport_other')).toBe('y');
    // 损坏键被清理
    expect(localStorage.getItem('ai_sport_broken')).toBeNull();
  });
});
