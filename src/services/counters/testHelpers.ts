/**
 * 测试辅助工具 — 快速构建 Pose 对象（Desktop / 归一化坐标）
 *
 * Mobile 端的像素坐标 = 归一化坐标 × (480, 360)。
 * Desktop 计数器基于归一化坐标（MediaPipe 默认输出 0-1）工作，
 * 因此本文件的预设姿态使用归一化坐标，几何与 Mobile 端逐点对应，
 * 便于跨端 golden 框架复用同一套 fixture（动作序列一致）。
 */

import { Pose, Keypoint } from '../../types';
import { KEYPOINT_NAMES } from '../../constants/exerciseConfig';

/** 从部分关键点构建完整 Pose（缺失关键点自动补零分） */
export function buildPose(
  overrides: Partial<Record<string, { x: number; y: number; score?: number }>>,
): Pose {
  const keypoints: Keypoint[] = KEYPOINT_NAMES.map((name) => {
    const o = overrides[name];
    return {
      name,
      x: o?.x ?? 0,
      y: o?.y ?? 0,
      score: o?.score ?? 0,
    };
  });
  return { keypoints, score: 0.9 };
}

/** 给所有关键点设置相同 score */
export function withScore(pose: Pose, score: number): Pose {
  return {
    ...pose,
    keypoints: pose.keypoints.map((kp) => ({ ...kp, score })),
  };
}

// ── 预设姿态（归一化坐标 0-1，几何对应 Mobile 像素坐标 / (480, 360)）──

/** 站立面对摄像头 */
export function standingPose(): Pose {
  return buildPose({
    nose: { x: 0.5, y: 0.1, score: 0.9 },
    left_shoulder: { x: 0.35, y: 0.25, score: 0.9 },
    right_shoulder: { x: 0.65, y: 0.25, score: 0.9 },
    left_elbow: { x: 0.3, y: 0.3806, score: 0.9 },
    right_elbow: { x: 0.7, y: 0.3806, score: 0.9 },
    left_wrist: { x: 0.2792, y: 0.5, score: 0.9 },
    right_wrist: { x: 0.7208, y: 0.5, score: 0.9 },
    left_hip: { x: 0.4, y: 0.55, score: 0.9 },
    right_hip: { x: 0.6, y: 0.55, score: 0.9 },
    left_knee: { x: 0.4, y: 0.7194, score: 0.9 },
    right_knee: { x: 0.6, y: 0.7194, score: 0.9 },
    left_ankle: { x: 0.4, y: 0.9, score: 0.9 },
    right_ankle: { x: 0.6, y: 0.9, score: 0.9 },
  });
}

/** 仰卧姿态（肩→髋→膝角度 ≈ 170°，接近平躺） */
export function lyingPose(): Pose {
  return buildPose({
    nose: { x: 0.5, y: 0.3, score: 0.9 },
    left_shoulder: { x: 0.4, y: 0.35, score: 0.9 },
    right_shoulder: { x: 0.6, y: 0.35, score: 0.9 },
    left_elbow: { x: 0.3, y: 0.3806, score: 0.9 },
    right_elbow: { x: 0.7, y: 0.3806, score: 0.9 },
    left_wrist: { x: 0.25, y: 0.4, score: 0.9 },
    right_wrist: { x: 0.75, y: 0.4, score: 0.9 },
    left_hip: { x: 0.4292, y: 0.55, score: 0.9 },
    right_hip: { x: 0.5708, y: 0.55, score: 0.9 },
    left_knee: { x: 0.4292, y: 0.7194, score: 0.9 },
    right_knee: { x: 0.5708, y: 0.7194, score: 0.9 },
    left_ankle: { x: 0.4292, y: 0.9, score: 0.9 },
    right_ankle: { x: 0.5708, y: 0.9, score: 0.9 },
  });
}

/** 坐起姿态（肩→髋→膝角度 ≈ 70°，上身前倾肘触膝） */
export function sittingUpPose(): Pose {
  return buildPose({
    nose: { x: 0.5, y: 0.4, score: 0.9 },
    left_shoulder: { x: 0.4208, y: 0.4806, score: 0.9 },
    right_shoulder: { x: 0.5792, y: 0.4806, score: 0.9 },
    left_elbow: { x: 0.3792, y: 0.55, score: 0.9 },
    right_elbow: { x: 0.6208, y: 0.55, score: 0.9 },
    left_wrist: { x: 0.4, y: 0.6194, score: 0.9 },
    right_wrist: { x: 0.6, y: 0.6194, score: 0.9 },
    left_hip: { x: 0.4292, y: 0.55, score: 0.9 },
    right_hip: { x: 0.5708, y: 0.55, score: 0.9 },
    left_knee: { x: 0.4292, y: 0.7194, score: 0.9 },
    right_knee: { x: 0.5708, y: 0.7194, score: 0.9 },
    left_ankle: { x: 0.4292, y: 0.9, score: 0.9 },
    right_ankle: { x: 0.5708, y: 0.9, score: 0.9 },
  });
}

/** 深蹲底部姿态（膝盖角 ≈ 85°，蹲得很深） */
export function squatBottomPose(): Pose {
  return buildPose({
    nose: { x: 0.5, y: 0.2778, score: 0.9 },
    left_shoulder: { x: 0.375, y: 0.3194, score: 0.9 },
    right_shoulder: { x: 0.625, y: 0.3194, score: 0.9 },
    left_elbow: { x: 0.3167, y: 0.4167, score: 0.9 },
    right_elbow: { x: 0.6833, y: 0.4167, score: 0.9 },
    left_wrist: { x: 0.2917, y: 0.5, score: 0.9 },
    right_wrist: { x: 0.7083, y: 0.5, score: 0.9 },
    left_hip: { x: 0.4375, y: 0.6528, score: 0.9 },
    right_hip: { x: 0.5625, y: 0.6528, score: 0.9 },
    left_knee: { x: 0.3229, y: 0.7222, score: 0.9 },
    right_knee: { x: 0.6771, y: 0.7222, score: 0.9 },
    left_ankle: { x: 0.4, y: 0.9, score: 0.9 },
    right_ankle: { x: 0.6, y: 0.9, score: 0.9 },
  });
}

/**
 * 开合跳张开姿态（手臂举起 + 腿分开）
 *
 * 采用 Desktop 原生几何（与 Desktop ExerciseCounters.test.ts 内部预设一致），
 * 以匹配 JumpingJacksCounter 的相对展幅阈值：
 *   standing 手腕X展幅（归一化髋宽）≈ 2.208 → 作为基线
 *   open 手腕X展幅 ≈ 4.0 → 远超 openThreshold(baseline + 0.7 ≈ 2.908)
 * 注：此前误用 Mobile 像素/480 的几何（展幅≈2.792 < 阈值）导致 Desktop 漏计。
 */
export function jumpingJackOpenPose(): Pose {
  return buildPose({
    nose: { x: 0.5, y: 0.1, score: 0.9 },
    left_shoulder: { x: 0.35, y: 0.25, score: 0.9 },
    right_shoulder: { x: 0.65, y: 0.25, score: 0.9 },
    left_elbow: { x: 0.24, y: 0.14, score: 0.9 },
    right_elbow: { x: 0.76, y: 0.14, score: 0.9 },
    left_wrist: { x: 0.18, y: 0.05, score: 0.9 },
    right_wrist: { x: 0.82, y: 0.05, score: 0.9 },
    left_hip: { x: 0.42, y: 0.55, score: 0.9 },
    right_hip: { x: 0.58, y: 0.55, score: 0.9 },
    left_knee: { x: 0.34, y: 0.72, score: 0.9 },
    right_knee: { x: 0.66, y: 0.72, score: 0.9 },
    left_ankle: { x: 0.25, y: 0.9, score: 0.9 },
    right_ankle: { x: 0.75, y: 0.9, score: 0.9 },
  });
}

/** 跳跃腾空姿态（髋部/脚踝Y上升 = Y值减小） */
export function airbornePose(): Pose {
  return buildPose({
    nose: { x: 0.5, y: 0.05, score: 0.9 },
    left_shoulder: { x: 0.35, y: 0.2, score: 0.9 },
    right_shoulder: { x: 0.65, y: 0.2, score: 0.9 },
    left_elbow: { x: 0.3, y: 0.3194, score: 0.9 },
    right_elbow: { x: 0.7, y: 0.3194, score: 0.9 },
    left_wrist: { x: 0.2792, y: 0.4194, score: 0.9 },
    right_wrist: { x: 0.7208, y: 0.4194, score: 0.9 },
    left_hip: { x: 0.4, y: 0.45, score: 0.9 },
    right_hip: { x: 0.6, y: 0.45, score: 0.9 },
    left_knee: { x: 0.4, y: 0.6194, score: 0.9 },
    right_knee: { x: 0.6, y: 0.6194, score: 0.9 },
    left_ankle: { x: 0.4, y: 0.8, score: 0.9 },
    right_ankle: { x: 0.6, y: 0.8, score: 0.9 },
  });
}

/** 低置信度姿态（所有关键点 score < 0.3） */
export function lowConfidencePose(): Pose {
  return buildPose({
    nose: { x: 0.5, y: 0.1, score: 0.1 },
    left_shoulder: { x: 0.35, y: 0.25, score: 0.1 },
    right_shoulder: { x: 0.65, y: 0.25, score: 0.1 },
    left_elbow: { x: 0.3, y: 0.3806, score: 0.1 },
    right_elbow: { x: 0.7, y: 0.3806, score: 0.1 },
    left_wrist: { x: 0.2792, y: 0.5, score: 0.1 },
    right_wrist: { x: 0.7208, y: 0.5, score: 0.1 },
    left_hip: { x: 0.4, y: 0.55, score: 0.1 },
    right_hip: { x: 0.6, y: 0.55, score: 0.1 },
    left_knee: { x: 0.4, y: 0.7194, score: 0.1 },
    right_knee: { x: 0.6, y: 0.7194, score: 0.1 },
    left_ankle: { x: 0.4, y: 0.9, score: 0.1 },
    right_ankle: { x: 0.6, y: 0.9, score: 0.1 },
  });
}

/** 跳绳甩绳 — 手腕抬高（归一化坐标，与 Mobile 一致） */
export function ropeSwingPose(): Pose {
  return buildPose({
    nose: { x: 0.5, y: 0.1, score: 0.9 },
    left_shoulder: { x: 0.35, y: 0.25, score: 0.9 },
    right_shoulder: { x: 0.65, y: 0.25, score: 0.9 },
    left_elbow: { x: 0.28, y: 0.2, score: 0.9 },
    right_elbow: { x: 0.72, y: 0.2, score: 0.9 },
    left_wrist: { x: 0.25, y: 0.1, score: 0.9 },
    right_wrist: { x: 0.75, y: 0.1, score: 0.9 },
    left_hip: { x: 0.4, y: 0.55, score: 0.9 },
    right_hip: { x: 0.6, y: 0.55, score: 0.9 },
    left_knee: { x: 0.4, y: 0.72, score: 0.9 },
    right_knee: { x: 0.6, y: 0.72, score: 0.9 },
    left_ankle: { x: 0.4, y: 0.9, score: 0.9 },
    right_ankle: { x: 0.6, y: 0.9, score: 0.9 },
  });
}

/** 立定跳远落地 — 身体前移（归一化坐标，与 Mobile 一致） */
export function longJumpLandingPose(): Pose {
  return buildPose({
    nose: { x: 0.6, y: 0.2, score: 0.9 },
    left_shoulder: { x: 0.45, y: 0.28, score: 0.9 },
    right_shoulder: { x: 0.75, y: 0.28, score: 0.9 },
    left_elbow: { x: 0.4, y: 0.38, score: 0.9 },
    right_elbow: { x: 0.8, y: 0.38, score: 0.9 },
    left_wrist: { x: 0.38, y: 0.48, score: 0.9 },
    right_wrist: { x: 0.82, y: 0.48, score: 0.9 },
    left_hip: { x: 0.5, y: 0.55, score: 0.9 },
    right_hip: { x: 0.7, y: 0.55, score: 0.9 },
    left_knee: { x: 0.5, y: 0.72, score: 0.9 },
    right_knee: { x: 0.7, y: 0.72, score: 0.9 },
    left_ankle: { x: 0.5, y: 0.9, score: 0.9 },
    right_ankle: { x: 0.7, y: 0.9, score: 0.9 },
  });
}

/** 缺失关键点的姿态 */
export function missingKeypointPose(): Pose {
  return buildPose({
    nose: { x: 0.5, y: 0.1, score: 0.9 },
    left_shoulder: { x: 0.35, y: 0.25, score: 0.9 },
  });
}
