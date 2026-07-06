import { useNavigate } from 'react-router-dom';
import { EXERCISE_CONFIGS, EXERCISE_CARD_THEMES } from '../constants/exerciseConfig';
import ExerciseIllustration from '../components/ExerciseIllustration';
import ThemeToggle from '../components/ThemeToggle';
import './HomePage.css';

/* ── 首页组件 ───────────────────────────────────────── */
export default function HomePage() {
  const navigate = useNavigate();

  return (
    <div className="home-page">
      {/* 顶栏 */}
      <header className="home-topbar">
        <h1 className="home-logo">AI SPORT</h1>
        <div className="home-nav-actions">
          <ThemeToggle />
          <button
            type="button"
            className="home-nav-btn"
            onClick={() => navigate('/teacher')}
            title="校园试点"
            aria-label="校园试点"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M4 6h16M6 10h12M8 14h8M10 18h4"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
            <span>试点</span>
          </button>
          <button
            type="button"
            className="home-nav-btn"
            onClick={() => navigate('/history')}
            title="训练历史"
            aria-label="训练历史"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
              <path
                d="M12 7v5l3 3"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>历史</span>
          </button>
          <button
            type="button"
            className="home-nav-btn home-nav-btn--primary"
            onClick={() => navigate('/analytics')}
            title="数据分析"
            aria-label="数据分析"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M18 20V10M12 20V4M6 20v-6"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>分析</span>
          </button>
        </div>
      </header>

      {/* 卡片网格 */}
      <main className="home-main">
        <div className="exercise-grid">
          {EXERCISE_CONFIGS.map((ex) => {
            const theme = EXERCISE_CARD_THEMES[ex.type];
            return (
              <button
                type="button"
                key={ex.type}
                className="exercise-card"
                style={{ background: theme.gradient }}
                onClick={() => navigate(`/workout/${ex.type}`)}
                aria-label={ex.name}
              >
                <div className="exercise-card-inner">
                  {/* 名称标签 — 上方居中醒目 */}
                  <div
                    className="exercise-label"
                    style={{ background: theme.labelBg, color: theme.accent }}
                  >
                    <span className="exercise-name">{ex.name}</span>
                  </div>
                  {/* 插画区 */}
                  <div className="exercise-illustration">
                    <ExerciseIllustration type={ex.type} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
