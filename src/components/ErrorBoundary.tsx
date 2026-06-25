import { Component, ErrorInfo, ReactNode } from 'react';
import ErrorReporter from '../services/ErrorReporter';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary — 捕获子组件渲染崩溃，防止白屏
 * 显示友好的错误页面和重新加载按钮
 */
export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AI Sport] ErrorBoundary caught:', error, info.componentStack);
    ErrorReporter.captureError(error, {
      source: 'ErrorBoundary',
      componentStack: info.componentStack ?? undefined,
    });
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            padding: '24px',
            background: 'var(--bg, #f2f2f7)',
            color: 'var(--text-primary, #1c1c1e)',
            fontFamily: '-apple-system, "PingFang SC", sans-serif',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>😅</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>应用出了点问题</h2>
          <p
            style={{
              fontSize: 14,
              color: 'var(--text-secondary, #8e8e93)',
              textAlign: 'center',
              marginBottom: 24,
              maxWidth: 320,
              lineHeight: 1.6,
            }}
          >
            抱歉，页面渲染遇到了意外错误。点击下方按钮重新加载。
          </p>
          <button
            type="button"
            onClick={this.handleReload}
            style={{
              padding: '12px 32px',
              borderRadius: 12,
              border: 'none',
              background: 'var(--primary, #007AFF)',
              color: '#fff',
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            重新加载
          </button>
          {this.state.error && (
            <details style={{ marginTop: 24, maxWidth: 480 }}>
              <summary
                style={{
                  fontSize: 13,
                  color: 'var(--text-secondary, #8e8e93)',
                  cursor: 'pointer',
                }}
              >
                错误详情
              </summary>
              <pre
                style={{
                  marginTop: 8,
                  padding: 12,
                  borderRadius: 8,
                  background: 'rgba(0,0,0,0.05)',
                  fontSize: 12,
                  overflow: 'auto',
                  maxWidth: '100%',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                }}
              >
                {this.state.error.message}
              </pre>
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}
