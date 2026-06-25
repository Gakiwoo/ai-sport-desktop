import { memo } from 'react';
import { ExerciseType } from '../types';

/* ══════════════════════════════════════════════
   共享插画级 SVG 运动图标
   支持 size 参数控制尺寸
   模块级常量 + React.memo 避免重复渲染
══════════════════════════════════════════════ */

const illustrations: Record<ExerciseType, JSX.Element> = {
  /* ── 跳绳 ─────────────────────────────── */
  jump_rope: (
    <svg viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="60" cy="130" rx="30" ry="5" fill="#DBEFFE" />
      <path
        d="M18 72 Q60 118 102 72"
        stroke="#007AFF"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
      <ellipse cx="48" cy="118" rx="9" ry="5" fill="#1C1C1E" />
      <ellipse cx="72" cy="118" rx="9" ry="5" fill="#1C1C1E" />
      <path d="M48 118 L44 96" stroke="#1C1C1E" strokeWidth="8" strokeLinecap="round" />
      <path d="M72 118 L76 96" stroke="#1C1C1E" strokeWidth="8" strokeLinecap="round" />
      <path d="M44 96 L50 76" stroke="#1C1C1E" strokeWidth="9" strokeLinecap="round" />
      <path d="M76 96 L70 76" stroke="#1C1C1E" strokeWidth="9" strokeLinecap="round" />
      <rect x="47" y="50" width="26" height="30" rx="12" fill="#007AFF" />
      <circle cx="60" cy="36" r="14" fill="#FFD4B8" />
      <path d="M47 32 Q50 18 60 16 Q70 18 73 32" fill="#1C1C1E" />
      <path d="M48 58 L22 72" stroke="#007AFF" strokeWidth="7" strokeLinecap="round" />
      <rect x="14" y="68" width="10" height="18" rx="5" fill="#FF9500" />
      <path d="M72 58 L98 72" stroke="#007AFF" strokeWidth="7" strokeLinecap="round" />
      <rect x="96" y="68" width="10" height="18" rx="5" fill="#FF9500" />
      <path
        d="M55 40 Q60 44 65 40"
        stroke="#1C1C1E"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="55" cy="35" r="2" fill="#1C1C1E" />
      <circle cx="65" cy="35" r="2" fill="#1C1C1E" />
    </svg>
  ),

  /* ── 开合跳 ───────────────────────────── */
  jumping_jacks: (
    <svg viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="60" cy="130" rx="32" ry="5" fill="#D9F5E5" />
      <ellipse cx="28" cy="122" rx="10" ry="5" fill="#1C1C1E" />
      <ellipse cx="92" cy="122" rx="10" ry="5" fill="#1C1C1E" />
      <path d="M28 122 L42 88" stroke="#1C1C1E" strokeWidth="9" strokeLinecap="round" />
      <path d="M92 122 L78 88" stroke="#1C1C1E" strokeWidth="9" strokeLinecap="round" />
      <rect x="46" y="62" width="28" height="30" rx="12" fill="#34C759" />
      <path d="M48 70 L16 42" stroke="#34C759" strokeWidth="8" strokeLinecap="round" />
      <path d="M72 70 L104 42" stroke="#34C759" strokeWidth="8" strokeLinecap="round" />
      <circle cx="14" cy="40" r="8" fill="#FFD4B8" />
      <circle cx="14" cy="40" r="4" fill="#FF9500" />
      <circle cx="106" cy="40" r="8" fill="#FFD4B8" />
      <circle cx="106" cy="40" r="4" fill="#FF9500" />
      <circle cx="60" cy="44" r="14" fill="#FFD4B8" />
      <path d="M47 40 Q50 26 60 24 Q70 26 73 40" fill="#1C1C1E" />
      <path
        d="M54 48 Q60 54 66 48"
        stroke="#1C1C1E"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="54" cy="42" r="2.5" fill="#1C1C1E" />
      <circle cx="66" cy="42" r="2.5" fill="#1C1C1E" />
      <path
        d="M8 58 L2 52 M8 52 L2 46"
        stroke="#34C759"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.6"
      />
      <path
        d="M112 58 L118 52 M112 52 L118 46"
        stroke="#34C759"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  ),

  /* ── 深蹲 ─────────────────────────────── */
  squats: (
    <svg viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="60" cy="130" rx="30" ry="5" fill="#FFE8D0" />
      <line
        x1="24"
        y1="124"
        x2="96"
        y2="124"
        stroke="#FF9500"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="5 4"
      />
      <ellipse cx="36" cy="122" rx="12" ry="5" fill="#1C1C1E" />
      <ellipse cx="84" cy="122" rx="12" ry="5" fill="#1C1C1E" />
      <path d="M36 120 L40 96" stroke="#1C1C1E" strokeWidth="10" strokeLinecap="round" />
      <path d="M84 120 L80 96" stroke="#1C1C1E" strokeWidth="10" strokeLinecap="round" />
      <circle cx="40" cy="96" r="6" fill="#FF9500" />
      <circle cx="80" cy="96" r="6" fill="#FF9500" />
      <path d="M40 96 L50 76" stroke="#1C1C1E" strokeWidth="10" strokeLinecap="round" />
      <path d="M80 96 L70 76" stroke="#1C1C1E" strokeWidth="10" strokeLinecap="round" />
      <rect x="44" y="58" width="32" height="22" rx="10" fill="#FF9500" />
      <path d="M46 66 L22 64" stroke="#FF9500" strokeWidth="8" strokeLinecap="round" />
      <path d="M74 66 L98 64" stroke="#FF9500" strokeWidth="8" strokeLinecap="round" />
      <circle cx="20" cy="64" r="6" fill="#FFD4B8" />
      <circle cx="100" cy="64" r="6" fill="#FFD4B8" />
      <circle cx="60" cy="42" r="14" fill="#FFD4B8" />
      <path d="M47 38 Q50 24 60 22 Q70 24 73 38" fill="#1C1C1E" />
      <path
        d="M55 46 Q60 50 65 46"
        stroke="#1C1C1E"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="55" cy="40" r="2.5" fill="#1C1C1E" />
      <circle cx="65" cy="40" r="2.5" fill="#1C1C1E" />
      <path d="M52 36 L57 34" stroke="#1C1C1E" strokeWidth="2" strokeLinecap="round" />
      <path d="M63 34 L68 36" stroke="#1C1C1E" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),

  /* ── 立定跳远 ─────────────────────────── */
  standing_long_jump: (
    <svg viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="110" width="6" height="20" rx="3" fill="#AF52DE" opacity="0.4" />
      <line
        x1="8"
        y1="126"
        x2="112"
        y2="126"
        stroke="#E5E5EA"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <rect x="106" y="110" width="6" height="20" rx="3" fill="#AF52DE" opacity="0.4" />
      <path
        d="M28 110 Q66 50 104 108"
        stroke="#AF52DE"
        strokeWidth="2.5"
        strokeDasharray="5 4"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M98 102 L104 108 L97 112"
        stroke="#AF52DE"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <ellipse cx="24" cy="122" rx="9" ry="4" fill="#1C1C1E" />
      <path d="M24 120 L30 98" stroke="#1C1C1E" strokeWidth="9" strokeLinecap="round" />
      <path d="M30 98 L36 80" stroke="#1C1C1E" strokeWidth="9" strokeLinecap="round" />
      <path d="M36 80 L48 60" stroke="#AF52DE" strokeWidth="10" strokeLinecap="round" />
      <path d="M40 70 L58 52" stroke="#AF52DE" strokeWidth="7" strokeLinecap="round" />
      <path d="M44 76 L60 62" stroke="#AF52DE" strokeWidth="7" strokeLinecap="round" />
      <circle cx="60" cy="50" r="6" fill="#FFD4B8" />
      <circle cx="62" cy="60" r="6" fill="#FFD4B8" />
      <circle cx="52" cy="46" r="13" fill="#FFD4B8" />
      <path d="M40 42 Q43 28 52 26 Q62 28 65 42" fill="#1C1C1E" />
      <circle cx="48" cy="44" r="2.5" fill="#1C1C1E" />
      <circle cx="57" cy="44" r="2.5" fill="#1C1C1E" />
      <path
        d="M48 50 Q52 54 57 50"
        stroke="#1C1C1E"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  ),

  /* ── 原地纵跳 ─────────────────────────── */
  vertical_jump: (
    <svg viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="60" cy="130" rx="28" ry="5" fill="#FFE0DF" />
      <path
        d="M92 100 L92 34"
        stroke="#FF3B30"
        strokeWidth="3"
        strokeLinecap="round"
        opacity="0.2"
      />
      <path
        d="M92 100 L92 34"
        stroke="#FF3B30"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M86 42 L92 34 L98 42"
        stroke="#FF3B30"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M14 54 L22 54"
        stroke="#FF3B30"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.5"
      />
      <path
        d="M10 64 L20 64"
        stroke="#FF3B30"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.35"
      />
      <path
        d="M14 74 L22 74"
        stroke="#FF3B30"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.25"
      />
      <ellipse cx="50" cy="122" rx="9" ry="5" fill="#1C1C1E" />
      <ellipse cx="70" cy="122" rx="9" ry="5" fill="#1C1C1E" />
      <path d="M50 120 L48 96" stroke="#1C1C1E" strokeWidth="9" strokeLinecap="round" />
      <path d="M70 120 L72 96" stroke="#1C1C1E" strokeWidth="9" strokeLinecap="round" />
      <rect x="44" y="64" width="32" height="35" rx="14" fill="#FF3B30" />
      <path d="M46 74 L28 44" stroke="#FF3B30" strokeWidth="8" strokeLinecap="round" />
      <path d="M74 74 L76 44" stroke="#FF3B30" strokeWidth="8" strokeLinecap="round" />
      <circle cx="26" cy="42" r="7" fill="#FFD4B8" />
      <circle cx="76" cy="42" r="7" fill="#FFD4B8" />
      <circle cx="60" cy="46" r="14" fill="#FFD4B8" />
      <path d="M47 42 Q50 28 60 26 Q70 28 73 42" fill="#1C1C1E" />
      <path
        d="M53 52 Q60 58 67 52"
        stroke="#1C1C1E"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="53" cy="44" r="2.5" fill="#1C1C1E" />
      <circle cx="67" cy="44" r="2.5" fill="#1C1C1E" />
      <ellipse cx="50" cy="49" rx="4" ry="2.5" fill="#FFB3A7" opacity="0.6" />
      <ellipse cx="70" cy="49" rx="4" ry="2.5" fill="#FFB3A7" opacity="0.6" />
    </svg>
  ),

  /* ── 仰卧起坐 ─────────────────────────── */
  sit_ups: (
    <svg viewBox="0 0 120 140" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* 地面 */}
      <ellipse cx="60" cy="128" rx="42" ry="6" fill="#D0F0EC" />
      {/* 垫子 */}
      <rect x="22" y="104" width="76" height="10" rx="5" fill="#0A8F85" opacity="0.2" />
      {/* 腿（弯曲跪地） */}
      <ellipse cx="88" cy="110" rx="10" ry="5" fill="#1C1C1E" />
      <path d="M88 108 L82 88" stroke="#1C1C1E" strokeWidth="9" strokeLinecap="round" />
      <circle cx="82" cy="88" r="6" fill="#0A8F85" />
      {/* 身体（坐起状态，微微前倾） */}
      <path d="M82 88 L52 72" stroke="#1C1C1E" strokeWidth="10" strokeLinecap="round" />
      <rect x="28" y="60" width="32" height="22" rx="10" fill="#0A8F85" />
      {/* 头 */}
      <circle cx="30" cy="52" r="14" fill="#FFD4B8" />
      <path d="M17 48 Q20 34 30 32 Q40 34 43 48" fill="#1C1C1E" />
      <path
        d="M25 56 Q30 60 35 56"
        stroke="#1C1C1E"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="25" cy="50" r="2.5" fill="#1C1C1E" />
      <circle cx="35" cy="50" r="2.5" fill="#1C1C1E" />
      {/* 手臂（交叉在胸前） */}
      <path d="M36 68 L48 66" stroke="#1C1C1E" strokeWidth="8" strokeLinecap="round" />
      <path d="M48 66 L56 70" stroke="#1C1C1E" strokeWidth="7" strokeLinecap="round" />
      {/* 运动线条 */}
      <path
        d="M20 68 L12 64"
        stroke="#0A8F85"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.4"
      />
      <path
        d="M18 58 L10 56"
        stroke="#0A8F85"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.3"
      />
    </svg>
  ),
};

const ExerciseIllustration = memo(function ExerciseIllustration({
  type,
  size,
}: {
  type: ExerciseType;
  size?: number; // svg 宽高 px
}) {
  const style = size ? { width: size, height: size } : {};

  return <div style={style}>{illustrations[type] ?? null}</div>;
});

export default ExerciseIllustration;
