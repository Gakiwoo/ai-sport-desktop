import { describe, expect, it } from 'vitest';
import { KEYPOINT_NAMES } from '../../constants/exerciseConfig';
import { Pose, Keypoint } from '../../types';
import { getLandingKneeAlignmentFeedback } from './landingFeedback';

type PointOverride = { x: number; y: number; score?: number };

function buildPose(overrides: Partial<Record<string, PointOverride>>): Pose {
  const keypoints: Keypoint[] = KEYPOINT_NAMES.map((name) => {
    const point = overrides[name];
    return {
      name,
      x: point?.x ?? 0,
      y: point?.y ?? 0,
      score: point?.score ?? 0,
    };
  });
  return { keypoints, score: 0.9 };
}

/** 标准站立姿态：膝盖与髋部 X 坐标对齐 */
function alignedPose(): Pose {
  return buildPose({
    left_hip: { x: 0.4, y: 0.55, score: 0.9 },
    right_hip: { x: 0.6, y: 0.55, score: 0.9 },
    left_knee: { x: 0.4, y: 0.72, score: 0.9 },
    right_knee: { x: 0.6, y: 0.72, score: 0.9 },
  });
}

/** 缺少关键关键点的姿态（膝盖点不存在） */
function incompletePose(): Pose {
  const fullPose = buildPose({
    left_hip: { x: 0.4, y: 0.55, score: 0.9 },
    right_hip: { x: 0.6, y: 0.55, score: 0.9 },
  });
  // 移除膝盖关键点，使其在 getKeypoint 查找时返回 undefined
  fullPose.keypoints = fullPose.keypoints.filter(
    (kp) => kp.name !== 'left_knee' && kp.name !== 'right_knee',
  );
  return fullPose;
}

describe('getLandingKneeAlignmentFeedback', () => {
  it('在帧窗口外返回 null', () => {
    const pose = alignedPose();
    // currentFrame=100, lastCountFrame=50, window=20 → 差值 50 > 20
    expect(getLandingKneeAlignmentFeedback(pose, 100, 50, 20)).toBeNull();
  });

  it('在帧窗口内且对齐良好返回 null', () => {
    const pose = alignedPose();
    // 膝盖 avgX=0.50，髋 avgX=0.50，偏移=0，髋宽=0.20 → 无需警告
    const result = getLandingKneeAlignmentFeedback(pose, 55, 50, 20);
    expect(result).toBeNull();
  });

  it('膝盖偏移超过髋宽 50% 时返回警告', () => {
    // 膝盖整体右偏：avgX=0.75，髋 avgX=0.50，偏移=0.25，髋宽=0.20 → 0.25 > 0.10 → 触发
    const offsetPose = buildPose({
      left_hip: { x: 0.4, y: 0.55, score: 0.9 },
      right_hip: { x: 0.6, y: 0.55, score: 0.9 },
      left_knee: { x: 0.7, y: 0.72, score: 0.9 },
      right_knee: { x: 0.8, y: 0.72, score: 0.9 },
    });
    // 膝盖 avgX=0.75，髋 avgX=0.50，偏移=0.25，髋宽=0.20 → 0.25 > 0.10 → 触发
    const result = getLandingKneeAlignmentFeedback(offsetPose, 55, 50, 20);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('warning');
    expect(result!.message).toBe('落地时膝盖对准脚尖');
  });

  it('缺少关键点时返回 null', () => {
    const pose = incompletePose();
    const result = getLandingKneeAlignmentFeedback(pose, 55, 50, 20);
    expect(result).toBeNull();
  });

  it('髋宽极小时返回 null（避免除零）', () => {
    const pose = buildPose({
      left_hip: { x: 0.5, y: 0.55, score: 0.9 },
      right_hip: { x: 0.5, y: 0.55, score: 0.9 }, // 髋宽=0
      left_knee: { x: 0.5, y: 0.72, score: 0.9 },
      right_knee: { x: 0.5, y: 0.72, score: 0.9 },
    });
    const result = getLandingKneeAlignmentFeedback(pose, 55, 50, 20);
    expect(result).toBeNull();
  });

  it('恰好在帧窗口边界时仍可返回反馈', () => {
    const pose = buildPose({
      left_hip: { x: 0.4, y: 0.55, score: 0.9 },
      right_hip: { x: 0.6, y: 0.55, score: 0.9 },
      left_knee: { x: 0.7, y: 0.72, score: 0.9 },
      right_knee: { x: 0.8, y: 0.72, score: 0.9 },
    });
    // currentFrame=70, lastCountFrame=50, window=20 → 差值 20 = 20 → 不超窗口
    const result = getLandingKneeAlignmentFeedback(pose, 70, 50, 20);
    expect(result).not.toBeNull();
  });
});
