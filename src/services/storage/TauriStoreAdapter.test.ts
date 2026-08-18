import { describe, it, expect, beforeEach, vi } from 'vitest';
import { load } from '@tauri-apps/plugin-store';
import { TauriStoreAdapter } from './TauriStoreAdapter';

vi.mock('@tauri-apps/plugin-store', () => ({
  load: vi.fn(),
}));

type FakeStore = {
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  entries: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
};

function makeFakeStore(): FakeStore {
  return {
    get: vi.fn(async () => null),
    set: vi.fn(async () => {}),
    delete: vi.fn(async () => {}),
    entries: vi.fn(async () => [] as [string, unknown][]),
    save: vi.fn(async () => {}),
  };
}

describe('TauriStoreAdapter', () => {
  let store: FakeStore;
  let adapter: TauriStoreAdapter;

  beforeEach(async () => {
    store = makeFakeStore();
    (load as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(store);
    adapter = new TauriStoreAdapter();
    // 等待构造函数内 init() 完成
    await adapter.get('__init_flush__');
  });

  it('get 将底层值转为字符串返回', async () => {
    store.get.mockResolvedValue(123);
    expect(await adapter.get('k')).toBe('123');
  });

  it('get 在底层值为 null/undefined 时返回 null', async () => {
    store.get.mockResolvedValue(null);
    expect(await adapter.get('k')).toBeNull();
    store.get.mockResolvedValue(undefined);
    expect(await adapter.get('k')).toBeNull();
  });

  it('get 在底层抛错时降级返回 null', async () => {
    store.get.mockRejectedValue(new Error('read fail'));
    expect(await adapter.get('k')).toBeNull();
  });

  it('set 写入并触发 save', async () => {
    await adapter.set('k', 'v');
    expect(store.set).toHaveBeenCalledWith('k', 'v');
    expect(store.save).toHaveBeenCalled();
  });

  it('remove 删除并触发 save', async () => {
    await adapter.remove('k');
    expect(store.delete).toHaveBeenCalledWith('k');
    expect(store.save).toHaveBeenCalled();
  });

  it('keys 映射 entries 的键', async () => {
    store.entries.mockResolvedValue([
      ['a', 1],
      ['b', 2],
    ]);
    expect(await adapter.keys()).toEqual(['a', 'b']);
  });

  it('keys 在底层抛错时降级返回空数组', async () => {
    store.entries.mockRejectedValue(new Error('entries fail'));
    expect(await adapter.keys()).toEqual([]);
  });

  it('clear 删除所有键并 save', async () => {
    store.entries.mockResolvedValue([
      ['a', 1],
      ['b', 2],
    ]);
    await adapter.clear();
    expect(store.delete).toHaveBeenCalledWith('a');
    expect(store.delete).toHaveBeenCalledWith('b');
    expect(store.save).toHaveBeenCalled();
  });

  it('初始化失败时真实降级到 localStorage：读写均有真实落盘（P1-13）', async () => {
    (load as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('no tauri'));
    const degraded = new TauriStoreAdapter();
    await degraded.get('x'); // flush init

    // 写入后能从 localStorage 读回（此前是静默丢弃）
    await degraded.set('persist-key', 'persist-value');
    expect(await degraded.get('persist-key')).toBe('persist-value');
    expect(localStorage.getItem('persist-key')).toBe('persist-value');

    expect(await degraded.keys()).toContain('persist-key');

    await degraded.remove('persist-key');
    expect(await degraded.get('persist-key')).toBeNull();
    expect(localStorage.getItem('persist-key')).toBeNull();
  });
});
