import { ExerciseType, WorkoutSession } from '../../types';
import { EXERCISE_NAMES } from '../../constants/exerciseConfig';

interface ResultPanelProps {
  /** 训练结果会话 */
  session: WorkoutSession;
  /** 运动类型 */
  exerciseType: ExerciseType;
  /** 定数模式目标次数（用于判断是否达成） */
  targetCount: number;
  /** 关闭结果面板 */
  onDismiss: () => void;
  /** "再来一次"回调 */
  onAgain: () => void;
  /** "查看历史"回调 */
  onViewHistory: () => void;
}

/**
 * 训练结果摘要面板
 *
 * - 显示运动类型、完成次数、用时
 * - 标注模式（定时/定数）
 * - 达成目标时显示 badge
 * - 计算并显示平均速率
 */
export default function ResultPanel({
  session,
  exerciseType,
  targetCount,
  onDismiss,
  onAgain,
  onViewHistory,
}: ResultPanelProps) {
  const rate = session.duration > 0 ? ((session.count / session.duration) * 60).toFixed(1) : '—';

  const handleOverlayClick = () => onDismiss();

  const handlePanelClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="训练结果"
      onClick={handleOverlayClick}
    >
      <div className="result-panel" onClick={handlePanelClick}>
        <div className="result-emoji">🎉</div>
        <h2 className="result-title">训练完成</h2>

        <div className="result-stats">
          <div className="result-stat">
            <div className="result-stat-value">{EXERCISE_NAMES[exerciseType]}</div>
            <div className="result-stat-label">运动类型</div>
          </div>
          <div className="result-stat-divider" />
          <div className="result-stat">
            <div className="result-stat-value result-stat--accent">{session.count}</div>
            <div className="result-stat-label">完成次数</div>
          </div>
          <div className="result-stat-divider" />
          <div className="result-stat">
            <div className="result-stat-value">{session.duration}s</div>
            <div className="result-stat-label">用时</div>
          </div>
        </div>

        <div className="result-mode-badge">
          {session.mode === 'timed' ? '⏰ 定时模式' : '🎯 定数模式'}
        </div>

        {session.mode === 'count' && session.count >= targetCount && (
          <div className="result-badge">✅ 已达成目标</div>
        )}

        <div className="result-rate">平均速率 {rate} 次/分钟</div>

        <div className="result-actions">
          <button type="button" className="modal-btn modal-btn--confirm" onClick={onAgain}>
            再来一次
          </button>
          <button type="button" className="modal-btn modal-btn--cancel" onClick={onViewHistory}>
            查看历史
          </button>
        </div>
      </div>
    </div>
  );
}
