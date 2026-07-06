import { useEffect, useRef } from 'react';

interface TargetModalProps {
  /** 是否显示弹窗 */
  visible: boolean;
  /** 训练模式 */
  mode: 'count' | 'timed';
  /** 输入框当前值（受控） */
  value: string;
  /** 是否显示输入错误 */
  error: boolean;
  /** 输入变化 */
  onChange: (value: string) => void;
  /** 错误状态变化（验证失败时通知父组件） */
  onError: (error: boolean) => void;
  /** 关闭弹窗 */
  onClose: () => void;
  /** 确认回调（已内部校验） */
  onConfirm: (mode: 'count' | 'timed', value: number) => void;
}

/**
 * 目标设置弹窗
 *
 * - 定数模式：目标次数，范围 [1, 9999]
 * - 定时模式：目标时长（秒），范围 [10, 3600]
 */
export default function TargetModal({
  visible,
  mode,
  value,
  error,
  onChange,
  onError,
  onClose,
  onConfirm,
}: TargetModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  // 弹窗打开时聚焦输入框
  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [visible]);

  if (!visible) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
  };

  const commit = () => {
    const val = parseInt(value, 10);
    if (isNaN(val) || val <= 0) {
      onError(true);
      return;
    }
    onError(false);
    const clamped =
      mode === 'count'
        ? Math.max(1, Math.min(val, 9999))
        : Math.max(10, Math.min(val, 3600));
    onConfirm(mode, clamped);
  };

  const handleOverlayClick = () => onClose();

  const handleBoxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="设置目标"
      onClick={handleOverlayClick}
    >
      <div className="modal-box" onClick={handleBoxClick}>
        <h3 className="modal-title">
          {mode === 'count' ? '设置目标次数' : '设置目标时长（秒）'}
        </h3>

        <input
          ref={inputRef}
          type="number"
          className={`modal-input${error ? ' modal-input--invalid' : ''}`}
          value={value}
          onChange={(e) => { onError(false); onChange(e.target.value); }}
          onKeyDown={handleKeyDown}
          min={mode === 'count' ? 1 : 10}
          max={mode === 'count' ? 9999 : 3600}
          aria-label={mode === 'count' ? '目标次数' : '目标时长（秒）'}
          placeholder={mode === 'count' ? '输入目标次数' : '输入秒数（如 60）'}
        />

        <div className="modal-actions">
          <button
            type="button"
            className="modal-btn modal-btn--cancel"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="modal-btn modal-btn--confirm"
            onClick={commit}
          >
            确定
          </button>
        </div>
      </div>
    </div>
  );
}
