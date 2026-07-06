interface NotificationBarProps {
  /** 通知文本，null 时隐藏 */
  message: string | null;
  /** 是否正在退出动画 */
  exiting: boolean;
  /** 点击关闭 */
  onDismiss: () => void;
}

/**
 * 顶部通知条
 *
 * - 点击通知条任意位置可关闭
 * - 支持退出动画（外部控制 exiting 状态）
 */
export default function NotificationBar({
  message,
  exiting,
  onDismiss,
}: NotificationBarProps) {
  if (!message) return null;

  return (
    <div
      className={`notification-bar${exiting ? ' notification-bar--exiting' : ''}`}
      onClick={onDismiss}
      role="status"
      aria-live="polite"
    >
      <span>{message}</span>
      <span className="notification-close">✕</span>
    </div>
  );
}
