import { memo } from 'react';
import type { CameraState } from './CameraView';

interface CameraOverlayProps {
  cameraState: CameraState;
  isActive: boolean;
  loadingStep: string;
  errorMsg: string;
  onRetry?: () => void;
}

/**
 * 摄像头覆盖层组件 — 纯展示，负责各状态的 UI 渲染
 * 状态：idle / loading / ready / error
 */
const CameraOverlay = memo(function CameraOverlay({
  cameraState,
  isActive,
  loadingStep,
  errorMsg,
  onRetry,
}: CameraOverlayProps) {
  // ── 空闲状态（摄像头未启动） ──
  if (!isActive && (cameraState === 'idle' || cameraState === 'loading')) {
    return (
      <div className="camera-overlay">
        <div className="camera-placeholder-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"
              stroke="rgba(255,255,255,0.7)"
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
            <circle cx="12" cy="13" r="4" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />
          </svg>
        </div>
        <span className="camera-placeholder-text">
          {cameraState === 'loading' ? '正在初始化摄像头...' : '等待开始训练'}
        </span>
        <span className="camera-placeholder-hint">点击下方按钮启动摄像头</span>
      </div>
    );
  }

  // ── 加载状态（已激活但模型仍在初始化） ──
  if (isActive && cameraState === 'loading') {
    return (
      <div className="camera-overlay">
        <div className="loading-spinner" role="status" aria-label="正在加载" />
        <p>{loadingStep || '正在初始化摄像头与 AI 模型...'}</p>
        <p className="hint">首次加载需要下载模型文件，请稍候</p>
      </div>
    );
  }

  // ── 就绪状态（摄像头就绪但未激活） ──
  if (!isActive && cameraState === 'ready') {
    return (
      <div className="camera-overlay camera-ready">
        <div className="camera-ready-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.9)" strokeWidth="2" />
            <path
              d="M8 12l3 3 5-6"
              stroke="rgba(52,199,89,1)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <span className="camera-ready-text">摄像头已就绪</span>
        <span className="camera-ready-hint">点击"开始训练"启动 AI 计数</span>
      </div>
    );
  }

  // ── 错误状态 ──
  if (cameraState === 'error') {
    return (
      <div className="camera-overlay camera-error" role="alert">
        <span className="error-icon" aria-hidden="true">
          ⚠️
        </span>
        <p className="error-title">摄像头不可用</p>
        <p className="error-msg">{errorMsg}</p>
        {onRetry && (
          <button type="button" className="error-retry-btn" onClick={onRetry}>
            重试
          </button>
        )}
      </div>
    );
  }

  // 无覆盖层（摄像头运行中）
  return null;
});

export default CameraOverlay;
