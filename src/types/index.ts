export type ExerciseType =
  | 'jump_rope'
  | 'jumping_jacks'
  | 'squats'
  | 'standing_long_jump'
  | 'vertical_jump'
  | 'sit_ups';

/** 训练模式：定数（目标次数）或定时（目标时长） */
export type WorkoutMode = 'count' | 'timed';

export interface Keypoint {
  x: number;
  y: number;
  score?: number;
  name?: string;
}

export interface Pose {
  keypoints: Keypoint[];
  /** 预构建的查找表，keypointMap.get(name) 代替 Array.find，O(1) */
  keypointMap?: Map<string, Keypoint>;
  score?: number;
}

export interface WorkoutSession {
  id: string;
  exerciseType: ExerciseType;
  mode: WorkoutMode;
  count: number;
  duration: number;
  timestamp: number;
}

export interface ExerciseConfig {
  type: ExerciseType;
  name: string;
}

export interface FormFeedback {
  type: 'warning' | 'error' | 'success';
  message: string;
}
