export interface StudentRankEntry {
  rank: number;
  studentId: string;
  studentName: string;
  avgScore: number;
  sessions: number;
  trend: 'improving' | 'declining' | 'stable';
}

export interface StudentRankingProps {
  students: StudentRankEntry[];
  onSelectStudent?: (studentId: string) => void;
  /** 当前选中学生 id（与进步趋势图联动高亮） */
  selectedStudentId?: string | null;
}

const TREND_META: Record<StudentRankEntry['trend'], { label: string; className: string }> = {
  improving: { label: '进步', className: 'report-rank-trend--improving' },
  declining: { label: '退步', className: 'report-rank-trend--declining' },
  stable: { label: '平稳', className: 'report-rank-trend--stable' },
};

function TrendIcon({ trend }: { trend: StudentRankEntry['trend'] }) {
  if (trend === 'stable') {
    return (
      <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
        <path d="M1.5 6h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  const up = trend === 'improving';
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path
        d={up ? 'M6 10V2M6 2L2.5 5.5M6 2l3.5 3.5' : 'M6 2v8M6 10l3.5-3.5M6 10l-3.5-3.5'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** 前三名奖牌配色 */
function rankBadgeClass(rank: number): string {
  if (rank === 1) return 'report-rank-badge report-rank-badge--gold';
  if (rank === 2) return 'report-rank-badge report-rank-badge--silver';
  if (rank === 3) return 'report-rank-badge report-rank-badge--bronze';
  return 'report-rank-badge';
}

/**
 * 学生排名列表 — 名次徽章、姓名、训练次数、平均分、趋势
 * 样式定义于 ReportPage.css（.report-student-list 系列）
 */
export default function StudentRanking({
  students,
  onSelectStudent,
  selectedStudentId,
}: StudentRankingProps) {
  if (students.length === 0) {
    return <p className="report-chart-empty">暂无学生数据</p>;
  }

  return (
    <ul className="report-student-list">
      {students.map((s) => {
        const meta = TREND_META[s.trend];
        const active = selectedStudentId != null && s.studentId === selectedStudentId;
        const interactive = Boolean(onSelectStudent);
        return (
          <li key={s.studentId}>
            <button
              type="button"
              className={`report-student-item ${active ? 'report-student-item--active' : ''}`}
              onClick={() => onSelectStudent?.(s.studentId)}
              disabled={!interactive}
              title={interactive ? '查看该学生进步趋势' : undefined}
            >
              <span className={rankBadgeClass(s.rank)}>{s.rank}</span>
              <span className="report-student-name">{s.studentName || '未知学生'}</span>
              <span className="report-student-sessions">{s.sessions} 次</span>
              <span className="report-student-score">{s.avgScore.toFixed(1)}</span>
              <span className={`report-rank-trend ${meta.className}`}>
                <TrendIcon trend={s.trend} />
                {meta.label}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
