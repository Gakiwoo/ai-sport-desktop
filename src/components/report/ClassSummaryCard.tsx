import type { CSSProperties } from 'react';

export interface ClassSummaryCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: { direction: 'up' | 'down' | 'flat'; percentage: number };
  /** 可选图标（emoji），展示在左上角图标槽中 */
  icon?: string;
  /** 图标槽渐变背景，缺省使用品牌蓝 */
  accent?: string;
}

/** 趋势方向 → 样式类名 */
const TREND_CLASS: Record<NonNullable<ClassSummaryCardProps['trend']>['direction'], string> = {
  up: 'report-card-trend--up',
  down: 'report-card-trend--down',
  flat: 'report-card-trend--flat',
};

function TrendArrow({ direction }: { direction: 'up' | 'down' | 'flat' }) {
  if (direction === 'flat') {
    return (
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path d="M1 5h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  const isUp = direction === 'up';
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path
        d={isUp ? 'M5 1.5v7M5 1.5L1.8 4.7M5 1.5l3.2 3.2' : 'M5 8.5v-7M5 8.5l3.2-3.2M5 8.5L1.8 5.3'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * 班级报告统计卡片 — 标题 + 大数值 + 可选趋势/副标题
 * 样式定义于 ReportPage.css（.report-card 系列）
 */
export default function ClassSummaryCard({
  title,
  value,
  subtitle,
  trend,
  icon,
  accent,
}: ClassSummaryCardProps) {
  const iconStyle: CSSProperties | undefined = accent ? { background: accent } : undefined;

  return (
    <div className="report-card">
      <div className="report-card-top">
        <span className="report-card-title">{title}</span>
        {icon && (
          <span className="report-card-icon" style={iconStyle} aria-hidden="true">
            {icon}
          </span>
        )}
      </div>
      <div className="report-card-value">{value}</div>
      <div className="report-card-footer">
        {trend && (
          <span
            className={`report-card-trend ${TREND_CLASS[trend.direction]}`}
            title="与上一统计周期对比"
          >
            <TrendArrow direction={trend.direction} />
            {trend.percentage.toFixed(1)}%
          </span>
        )}
        {subtitle && <span className="report-card-subtitle">{subtitle}</span>}
      </div>
    </div>
  );
}
