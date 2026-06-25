import { ExerciseType } from '../types';
import type { ExerciseConfig } from '../types';

export const EXERCISE_CONFIGS: ExerciseConfig[] = [
  { type: 'jump_rope', name: '跳绳' },
  { type: 'jumping_jacks', name: '开合跳' },
  { type: 'squats', name: '深蹲' },
  { type: 'standing_long_jump', name: '立定跳远' },
  { type: 'vertical_jump', name: '原地纵跳' },
  { type: 'sit_ups', name: '仰卧起坐' },
];

export const EXERCISE_NAMES: Record<ExerciseType, string> = {
  jump_rope: '跳绳',
  jumping_jacks: '开合跳',
  squats: '深蹲',
  standing_long_jump: '立定跳远',
  vertical_jump: '原地纵跳',
  sit_ups: '仰卧起坐',
};

export const DEFAULT_TARGETS: Record<ExerciseType, number> = {
  jump_rope: 100,
  jumping_jacks: 30,
  squats: 20,
  standing_long_jump: 5,
  vertical_jump: 10,
  sit_ups: 30,
};

/** 定时模式默认时长（秒） */
export const DEFAULT_DURATIONS: Record<ExerciseType, number> = {
  jump_rope: 60,
  jumping_jacks: 60,
  squats: 60,
  standing_long_jump: 30,
  vertical_jump: 30,
  sit_ups: 60,
};

/* 运动品牌色 — 统一导出，HomePage / HistoryPage / AnalyticsPage 共用 */
export const EXERCISE_COLORS: Record<ExerciseType, string> = {
  jump_rope: '#007AFF',
  jumping_jacks: '#34C759',
  squats: '#FF9500',
  standing_long_jump: '#AF52DE',
  vertical_jump: '#FF3B30',
  sit_ups: '#0A8F85',
};

/* 运动卡片主题（亮色渐变背景 + accent + labelBg） — HomePage 专用 */
export const EXERCISE_CARD_THEMES: Record<
  ExerciseType,
  {
    gradient: string;
    accent: string;
    labelBg: string;
  }
> = {
  jump_rope: {
    gradient: 'linear-gradient(145deg, #EBF4FF 0%, #C8E4FF 100%)',
    accent: '#007AFF',
    labelBg: 'rgba(0,122,255,0.10)',
  },
  jumping_jacks: {
    gradient: 'linear-gradient(145deg, #EDFBF2 0%, #C6EFD5 100%)',
    accent: '#25A244',
    labelBg: 'rgba(37,162,68,0.10)',
  },
  squats: {
    gradient: 'linear-gradient(145deg, #FFF5EA 0%, #FFE0BC 100%)',
    accent: '#D4700A',
    labelBg: 'rgba(212,112,10,0.10)',
  },
  standing_long_jump: {
    gradient: 'linear-gradient(145deg, #F6F0FF 0%, #E2D3FD 100%)',
    accent: '#8A3FD4',
    labelBg: 'rgba(138,63,212,0.10)',
  },
  vertical_jump: {
    gradient: 'linear-gradient(145deg, #FFF2F1 0%, #FFCCC9 100%)',
    accent: '#D4201A',
    labelBg: 'rgba(212,32,26,0.10)',
  },
  sit_ups: {
    gradient: 'linear-gradient(145deg, #E8FAF8 0%, #BDECE6 100%)',
    accent: '#0A8F85',
    labelBg: 'rgba(10,143,133,0.10)',
  },
};

export const KEYPOINT_NAMES = [
  'nose',
  'left_eye_inner',
  'left_eye',
  'left_eye_outer',
  'right_eye_inner',
  'right_eye',
  'right_eye_outer',
  'left_ear',
  'right_ear',
  'mouth_left',
  'mouth_right',
  'left_shoulder',
  'right_shoulder',
  'left_elbow',
  'right_elbow',
  'left_wrist',
  'right_wrist',
  'left_pinky',
  'right_pinky',
  'left_index',
  'right_index',
  'left_thumb',
  'right_thumb',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
  'left_heel',
  'right_heel',
  'left_foot_index',
  'right_foot_index',
];
