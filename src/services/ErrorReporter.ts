/**
 * 错误上报服务 — 轻量级实现，不依赖第三方 SDK
 *
 * 功能：
 * 1. 捕获未处理异常和 Promise rejection
 * 2. 错误分级（error / warning / info）
 * 3. 本地日志轮转存储（最多 100 条，FIFO）
 * 4. 可选远程上报接口（Sentry / 自建端点）
 * 5. Tauri 环境下可写入本地文件
 *
 * 使用方式：
 *   import ErrorReporter from './services/ErrorReporter';
 *   ErrorReporter.init();  // 应用启动时调用一次
 *   ErrorReporter.captureError(new Error('something went wrong'));
 */

export type ErrorLevel = 'error' | 'warning' | 'info';

export interface ErrorEntry {
  /** 错误唯一 ID */
  id: string;
  /** 错误级别 */
  level: ErrorLevel;
  /** 错误消息 */
  message: string;
  /** 错误堆栈（如有） */
  stack?: string;
  /** 错误来源（组件/服务名） */
  source?: string;
  /** 附加元数据 */
  metadata?: Record<string, unknown>;
  /** 时间戳 */
  timestamp: number;
  /** 应用版本 */
  appVersion: string;
  /** 运行环境 */
  environment: string;
}

export interface ErrorReporterConfig {
  /** 最大本地日志条数（默认 100） */
  maxLocalEntries?: number;
  /** 远程上报端点 URL（可选） */
  remoteEndpoint?: string;
  /** 远程上报 API Key（可选） */
  apiKey?: string;
  /** 是否启用全局异常捕获（默认 true） */
  catchGlobalErrors?: boolean;
  /** 是否输出到 console（默认 true） */
  consoleOutput?: boolean;
  /** 应用版本号 */
  appVersion?: string;
}

const LOCAL_STORAGE_KEY = 'ai_sport_error_log';

class ErrorReporter {
  private config: Required<ErrorReporterConfig>;
  private initialized = false;
  private reportQueue: ErrorEntry[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.config = {
      maxLocalEntries: 100,
      remoteEndpoint: '',
      apiKey: '',
      catchGlobalErrors: true,
      consoleOutput: true,
      appVersion: '1.0.0',
    };
  }

  /**
   * 初始化错误上报器
   * 应在应用启动时调用一次
   */
  init(config?: ErrorReporterConfig): void {
    if (this.initialized) return;

    Object.assign(this.config, config);

    if (this.config.catchGlobalErrors) {
      this.setupGlobalHandlers();
    }

    this.initialized = true;

    // 启动时上报上次未发送的错误
    this.flushPendingReports();
  }

  /** 手动上报错误 */
  captureError(error: Error | unknown, metadata?: Record<string, unknown>): void {
    const entry = this.createEntry('error', error, metadata);
    this.persistEntry(entry);
    this.scheduleFlush();

    if (this.config.consoleOutput) {
      console.error('[ErrorReporter]', entry.message, error);
    }
  }

  /** 手动上报警告 */
  captureWarning(message: string, metadata?: Record<string, unknown>): void {
    const entry = this.createEntry('warning', message, metadata);
    this.persistEntry(entry);

    if (this.config.consoleOutput) {
      console.warn('[ErrorReporter]', entry.message);
    }
  }

  /** 手动上报信息 */
  captureInfo(message: string, metadata?: Record<string, unknown>): void {
    const entry = this.createEntry('info', message, metadata);
    this.persistEntry(entry);
  }

  /** 获取本地存储的错误日志 */
  getLocalErrors(): ErrorEntry[] {
    try {
      const data = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!data) return [];
      const parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /** 清空本地错误日志 */
  clearLocalErrors(): void {
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch {
      // storage 不可用
    }
  }

  /** 销毁，移除全局监听器 */
  destroy(): void {
    if (!this.initialized) return;

    // 移除全局异常监听
    window.removeEventListener('error', this.handleGlobalError);
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }

    this.initialized = false;
  }

  // ---- 内部方法 ----

  private createEntry(
    level: ErrorLevel,
    errorOrMessage: Error | unknown,
    metadata?: Record<string, unknown>,
  ): ErrorEntry {
    const id = `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

    let message: string;
    let stack: string | undefined;

    if (errorOrMessage instanceof Error) {
      message = errorOrMessage.message;
      stack = errorOrMessage.stack;
    } else if (typeof errorOrMessage === 'string') {
      message = errorOrMessage;
    } else {
      message = String(errorOrMessage);
    }

    return {
      id,
      level,
      message,
      stack,
      metadata,
      timestamp: Date.now(),
      appVersion: this.config.appVersion,
      environment: isTauri ? 'tauri-desktop' : 'web',
    };
  }

  private persistEntry(entry: ErrorEntry): void {
    try {
      const existing = this.getLocalErrors();
      existing.push(entry);

      // FIFO 轮转：超过上限时删除最旧的
      const trimmed = existing.slice(-this.config.maxLocalEntries);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // 存储满了，删除最旧的一半
      try {
        const existing = this.getLocalErrors();
        const half = existing.slice(-Math.floor(this.config.maxLocalEntries / 2));
        half.push(entry);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(half));
      } catch {
        // 完全无法存储，静默失败
      }
    }

    this.reportQueue.push(entry);
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return;

    // 5 秒后批量发送，避免短时间内频繁请求
    this.flushTimer = setTimeout(() => {
      this.flush();
      this.flushTimer = null;
    }, 5000);
  }

  private async flush(): Promise<void> {
    if (this.reportQueue.length === 0 || !this.config.remoteEndpoint) return;

    const batch = [...this.reportQueue];
    this.reportQueue = [];

    try {
      await fetch(this.config.remoteEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {}),
        },
        body: JSON.stringify({
          errors: batch,
          hostname: window.location.hostname,
        }),
      });
    } catch {
      // LOW-4: 远程上报失败，保留完整批次以便下次重试（而非仅保留 3 条导致大部分日志丢失）
      this.reportQueue.unshift(...batch);
    }
  }

  private flushPendingReports(): void {
    // 应用启动时检查是否有未发送的错误
    const pending = this.getLocalErrors().filter((e) => e.level === 'error');
    if (pending.length > 0 && this.config.remoteEndpoint) {
      this.reportQueue.push(...pending);
      this.scheduleFlush();
    }
  }

  private setupGlobalHandlers(): void {
    window.addEventListener('error', this.handleGlobalError);
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection);
  }

  private handleGlobalError = (event: ErrorEvent): void => {
    this.captureError(event.error || event.message, {
      type: 'global_error',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  };

  private handleUnhandledRejection = (event: PromiseRejectionEvent): void => {
    this.captureError(event.reason, {
      type: 'unhandled_rejection',
    });
  };
}

// 单例导出
export default new ErrorReporter();
