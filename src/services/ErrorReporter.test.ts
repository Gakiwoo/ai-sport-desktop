import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import ErrorReporter from './ErrorReporter';

describe('ErrorReporter', () => {
  beforeEach(() => {
    localStorage.clear();
    ErrorReporter.destroy();
  });

  afterEach(() => {
    ErrorReporter.destroy();
  });

  it('captures errors and persists to localStorage', () => {
    ErrorReporter.init({ appVersion: '1.0.0', consoleOutput: false });

    ErrorReporter.captureError(new Error('test error'));

    const errors = ErrorReporter.getLocalErrors();
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toBe('test error');
    expect(errors[0].level).toBe('error');
    expect(errors[0].appVersion).toBe('1.0.0');
  });

  it('captures warnings with correct level', () => {
    ErrorReporter.init({ consoleOutput: false });

    ErrorReporter.captureWarning('something off');

    const errors = ErrorReporter.getLocalErrors();
    expect(errors).toHaveLength(1);
    expect(errors[0].level).toBe('warning');
    expect(errors[0].message).toBe('something off');
  });

  it('captures info messages', () => {
    ErrorReporter.init({ consoleOutput: false });

    ErrorReporter.captureInfo('just logging');

    const errors = ErrorReporter.getLocalErrors();
    expect(errors).toHaveLength(1);
    expect(errors[0].level).toBe('info');
  });

  it('rotates entries when exceeding maxLocalEntries', () => {
    ErrorReporter.init({ maxLocalEntries: 5, consoleOutput: false });

    for (let i = 0; i < 8; i++) {
      ErrorReporter.captureInfo(`msg-${i}`);
    }

    const errors = ErrorReporter.getLocalErrors();
    expect(errors).toHaveLength(5);
    expect(errors[0].message).toBe('msg-3'); // oldest kept
    expect(errors[4].message).toBe('msg-7'); // newest
  });

  it('detects environment correctly', () => {
    ErrorReporter.init({ consoleOutput: false });

    ErrorReporter.captureError(new Error('env test'));

    const errors = ErrorReporter.getLocalErrors();
    // In test environment (jsdom), no __TAURI_INTERNALS__
    expect(errors[0].environment).toBe('web');
  });

  it('clears local errors', () => {
    ErrorReporter.init({ consoleOutput: false });
    ErrorReporter.captureError(new Error('will be cleared'));

    ErrorReporter.clearLocalErrors();
    expect(ErrorReporter.getLocalErrors()).toHaveLength(0);
  });

  it('handles global errors when catchGlobalErrors is true', () => {
    const errorSpy = vi.spyOn(window, 'addEventListener');

    ErrorReporter.init({ catchGlobalErrors: true, consoleOutput: false });

    expect(errorSpy).toHaveBeenCalledWith('error', expect.any(Function));
    expect(errorSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function));

    errorSpy.mockRestore();
  });

  it('does not register global handlers when catchGlobalErrors is false', () => {
    const errorSpy = vi.spyOn(window, 'addEventListener');

    ErrorReporter.init({ catchGlobalErrors: false, consoleOutput: false });

    expect(errorSpy).not.toHaveBeenCalledWith('error', expect.any(Function));

    errorSpy.mockRestore();
  });

  it('includes metadata in captured errors', () => {
    ErrorReporter.init({ consoleOutput: false });

    ErrorReporter.captureError(new Error('with meta'), { userId: '123', action: 'save' });

    const errors = ErrorReporter.getLocalErrors();
    expect(errors[0].metadata).toEqual({ userId: '123', action: 'save' });
  });
});
