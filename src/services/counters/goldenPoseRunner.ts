import { ExerciseType, Pose } from '../../types';
import { ExerciseCounter } from '../ExerciseCounter';
import { JumpRopeCounter } from './JumpRopeCounter';
import { JumpingJacksCounter } from './JumpingJacksCounter';
import { SquatsCounter } from './SquatsCounter';
import { StandingLongJumpCounter } from './StandingLongJumpCounter';
import { VerticalJumpCounter } from './VerticalJumpCounter';
import { SitUpCounter } from './SitUpCounter';
import {
  airbornePose,
  jumpingJackOpenPose,
  longJumpLandingPose,
  lowConfidencePose,
  lyingPose,
  missingKeypointPose,
  ropeSwingPose,
  sittingUpPose,
  squatBottomPose,
  standingPose,
} from './testHelpers';
import { GoldenPoseFixture, GoldenPosePreset } from './fixtures/goldenPoses/types';
import { expect } from 'vitest';

const PRESET_BUILDERS: Record<GoldenPosePreset, () => Pose> = {
  standing: standingPose,
  squat_bottom: squatBottomPose,
  lying: lyingPose,
  sitting_up: sittingUpPose,
  jumping_jack_open: jumpingJackOpenPose,
  airborne: airbornePose,
  rope_swing: ropeSwingPose,
  long_jump_landing: longJumpLandingPose,
  low_confidence: lowConfidencePose,
  missing_keypoint: missingKeypointPose,
};

export function poseFromPreset(preset: GoldenPosePreset): Pose {
  const builder = PRESET_BUILDERS[preset];
  if (!builder) {
    throw new Error(`Unknown golden pose preset: ${preset}`);
  }
  return builder();
}

export function createCounterForExercise(type: ExerciseType): ExerciseCounter {
  switch (type) {
    case 'jump_rope':
      return new JumpRopeCounter();
    case 'jumping_jacks':
      return new JumpingJacksCounter();
    case 'squats':
      return new SquatsCounter();
    case 'standing_long_jump':
      return new StandingLongJumpCounter();
    case 'vertical_jump':
      return new VerticalJumpCounter();
    case 'sit_ups':
      return new SitUpCounter();
  }
}

export interface GoldenPoseRunResult {
  count: number;
  phase: string;
  calibrated?: boolean;
}

export function runGoldenPoseFixture(fixture: GoldenPoseFixture): GoldenPoseRunResult {
  const counter = createCounterForExercise(fixture.exerciseType);
  // Desktop 基类 setFrameInterval 为兼容 no-op；计数器基于帧计数驱动
  counter.setFrameInterval(fixture.frameIntervalMs);

  for (const step of fixture.steps) {
    const pose = poseFromPreset(step.preset);
    for (let i = 0; i < step.frames; i++) {
      counter.processFrame(pose);
    }
  }

  // Desktop 计数器目前不实现 isCalibrated()，此处防御性读取（返回 undefined 时跳过断言）
  const calibrated =
    'isCalibrated' in counter &&
    typeof (counter as { isCalibrated: () => boolean }).isCalibrated === 'function'
      ? (counter as { isCalibrated: () => boolean }).isCalibrated()
      : undefined;

  return {
    count: counter.getCount(),
    phase: counter.getPhase(),
    calibrated,
  };
}

export function assertGoldenExpectation(
  fixture: GoldenPoseFixture,
  result: GoldenPoseRunResult,
): void {
  const { expect: exp } = fixture;

  if (exp.minCount !== undefined) {
    expect(result.count).toBeGreaterThanOrEqual(exp.minCount);
  }
  if (exp.maxCount !== undefined) {
    expect(result.count).toBeLessThanOrEqual(exp.maxCount);
  }

  // Desktop 计数器的 phase 命名与 Mobile fixture 定义的预期 phase 列表尚未统一
  // （跨端 phase 对齐属 R9 范围），此处跳过 phase 断言，仅校验 count / calibrated。
  // 待 R9 统一阶段命名后，可在此打开 phase 断言以纳入跨端对比。

  // Desktop 无 calibrated 概念时 result.calibrated 为 undefined，跳过校准断言
  if (exp.calibrated !== undefined && result.calibrated !== undefined) {
    expect(result.calibrated).toBe(exp.calibrated);
  }
}
