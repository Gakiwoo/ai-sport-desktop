import { useTheme, type Theme } from '../hooks/useTheme';

const themeIcons: Record<Theme, string> = {
  light: '☀️',
  dark: '🌙',
  system: '💻',
};

const themeLabels: Record<Theme, string> = {
  light: '浅色',
  dark: '深色',
  system: '跟随系统',
};

const themeOrder: Theme[] = ['light', 'dark', 'system'];

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    const idx = themeOrder.indexOf(theme);
    const next = themeOrder[(idx + 1) % themeOrder.length];
    setTheme(next);
  };

  return (
    <button
      className="theme-toggle"
      onClick={cycleTheme}
      title={`当前: ${themeLabels[theme]}（点击切换）`}
      aria-label={`切换主题，当前${themeLabels[theme]}`}
    >
      <span className="theme-toggle-icon">{themeIcons[theme]}</span>
    </button>
  );
}
