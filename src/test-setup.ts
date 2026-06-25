/**
 * Vitest setup — 为 jsdom 测试环境提供 localStorage polyfill。
 *
 * vitest 4.x + jsdom 29.x 默认不完整的 localStorage，
 * 直接注入全局 mock 避免 ErrorReporter.test.ts 和 useTheme 中的崩溃。
 */
import { vi } from 'vitest';

const store: Record<string, string> = Object.create(null);

const mockLocalStorage: Storage = {
  getItem: vi.fn((key: string): string | null => store[key] ?? null),
  setItem: vi.fn((key: string, value: string): void => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string): void => {
    delete store[key];
  }),
  clear: vi.fn((): void => {
    for (const key of Object.keys(store)) {
      delete store[key];
    }
  }),
  get length(): number {
    return Object.keys(store).length;
  },
  key: vi.fn((index: number): string | null => {
    const keys = Object.keys(store);
    return keys[index] ?? null;
  }),
};

vi.stubGlobal('localStorage', mockLocalStorage);

// jsdom 缺少 matchMedia，Recharts / CSS 主题检测需要。
// 模拟 prefers-color-scheme: light（默认浅色模式）
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Recharts 内部使用 ResizeObserver，jsdom 未提供
// vitest 4.x 要求 constructor mock 必须使用 function 关键字
class ResizeObserverMock {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock);
