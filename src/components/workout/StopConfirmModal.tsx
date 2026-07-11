interface StopConfirmModalProps {
  /** 是否显示弹窗 */
  visible: boolean;
  /** 当前已完成次数 */
  count: number;
  /** 训练模式 */
  mode: 'count' | 'timed';
  /** 定数模式目标次数 */
  targetCount: number;
  /** 已用时（秒） */
  elapsed: number;
  /** 格式化时间函数 */
  formatTime: (s: number) => string;
  /** 关闭弹窗 */
  onClose: () => void;
  /** 确认结束回调 */
  onConfirm: () => void;
  /** 是否正在保存 */
  isSaving: boolean;
}

/**
 * 结束训练确认弹窗
 *
 * - 显示当前完成次数、模式信息、距离目标差距
 * - 防误触：未达目标时二次确认
 */
export default function StopConfirmModal({
  visible,
  count,
  mode,
  targetCount,
  elapsed,
  formatTime,
  onClose,
  onConfirm,
  isSaving,
}: StopConfirmModalProps) {
  if (!visible) return null;

  const handleOverlayClick = () => onClose();

  const handleBoxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="结束训练确认"
      onClick={handleOverlayClick}
    >
      <div className="modal-box" onClick={handleBoxClick}>
        <h3 className="modal-title">结束训练</h3>
        <p className="modal-desc">
          当前已完成 <strong>{count}</strong> 次，
          {mode === 'count'
            ? count >= targetCount
              ? '已达成目标！'
              : `距离目标还差 ${targetCount - count} 次。`
            : `已用时 ${formatTime(elapsed)}。`}
          确认结束本次训练？
        </p>
        <div className="modal-actions">
          <button type="button" className="modal-btn modal-btn--cancel" onClick={onClose}>
            继续训练
          </button>
          <button
            type="button"
            className="modal-btn modal-btn--stop-confirm"
            onClick={onConfirm}
            disabled={isSaving}
            autoFocus
          >
            {isSaving ? '保存中...' : '确认结束'}
          </button>
        </div>
      </div>
    </div>
  );
}
