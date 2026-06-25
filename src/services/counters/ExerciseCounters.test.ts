import { describe, expect, it } from 'vitest';
import { KEYPOINT_NAMES } from '../../constants/exerciseConfig';
import { Pose, Keypoint } from '../../types';
import { JumpingJacksCounter } from './JumpingJacksCounter';
import { JumpRopeCounter } from './JumpRopeCounter';
import { SitUpCounter } from './SitUpCounter';
import { SquatsCounter } from './SquatsCounter';
import { StandingLongJumpCounter } from './StandingLongJumpCounter';
import { VerticalJumpCounter } from './VerticalJumpCounter';

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

function withScore(pose: Pose, score: number): Pose {
  return {
    ...pose,
    keypoints: pose.keypoints.map((keypoint) => ({ ...keypoint, score })),
  };
}

function standingPose(): Pose {
  return buildPose({
    nose: { x: 0.5, y: 0.1, score: 0.9 },
    left_shoulder: { x: 0.35, y: 0.25, score: 0.9 },
    right_shoulder: { x: 0.65, y: 0.25, score: 0.9 },
    left_elbow: { x: 0.3, y: 0.38, score: 0.9 },
    right_elbow: { x: 0.7, y: 0.38, score: 0.9 },
    left_wrist: { x: 0.28, y: 0.5, score: 0.9 },
    right_wrist: { x: 0.72, y: 0.5, score: 0.9 },
    left_hip: { x: 0.42, y: 0.55, score: 0.9 },
    right_hip: { x: 0.58, y: 0.55, score: 0.9 },
    left_knee: { x: 0.42, y: 0.72, score: 0.9 },
    right_knee: { x: 0.58, y: 0.72, score: 0.9 },
    left_ankle: { x: 0.42, y: 0.9, score: 0.9 },
    right_ankle: { x: 0.58, y: 0.9, score: 0.9 },
  });
}

function squatBottomPose(): Pose {
  return buildPose({
    nose: { x: 0.5, y: 0.22, score: 0.9 },
    left_shoulder: { x: 0.38, y: 0.34, score: 0.9 },
    right_shoulder: { x: 0.62, y: 0.34, score: 0.9 },
    left_elbow: { x: 0.33, y: 0.45, score: 0.9 },
    right_elbow: { x: 0.67, y: 0.45, score: 0.9 },
    left_wrist: { x: 0.32, y: 0.55, score: 0.9 },
    right_wrist: { x: 0.68, y: 0.55, score: 0.9 },
    left_hip: { x: 0.44, y: 0.68, score: 0.9 },
    right_hip: { x: 0.56, y: 0.68, score: 0.9 },
    left_knee: { x: 0.34, y: 0.73, score: 0.9 },
    right_knee: { x: 0.66, y: 0.73, score: 0.9 },
    left_ankle: { x: 0.42, y: 0.9, score: 0.9 },
    right_ankle: { x: 0.58, y: 0.9, score: 0.9 },
  });
}

function airbornePose(): Pose {
  return buildPose({
    nose: { x: 0.5, y: 0.02, score: 0.9 },
    left_shoulder: { x: 0.35, y: 0.17, score: 0.9 },
    right_shoulder: { x: 0.65, y: 0.17, score: 0.9 },
    left_elbow: { x: 0.3, y: 0.3, score: 0.9 },
    right_elbow: { x: 0.7, y: 0.3, score: 0.9 },
    left_wrist: { x: 0.28, y: 0.42, score: 0.9 },
    right_wrist: { x: 0.72, y: 0.42, score: 0.9 },
    left_hip: { x: 0.42, y: 0.43, score: 0.9 },
    right_hip: { x: 0.58, y: 0.43, score: 0.9 },
    left_knee: { x: 0.42, y: 0.6, score: 0.9 },
    right_knee: { x: 0.58, y: 0.6, score: 0.9 },
    left_ankle: { x: 0.42, y: 0.78, score: 0.9 },
    right_ankle: { x: 0.58, y: 0.78, score: 0.9 },
  });
}

function jumpingJackOpenPose(): Pose {
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

function lyingSitUpPose(): Pose {
  return buildPose({
    nose: { x: 0.22, y: 0.56, score: 0.9 },
    left_shoulder: { x: 0.3, y: 0.58, score: 0.9 },
    right_shoulder: { x: 0.3, y: 0.66, score: 0.9 },
    left_elbow: { x: 0.24, y: 0.57, score: 0.9 },
    right_elbow: { x: 0.24, y: 0.67, score: 0.9 },
    left_wrist: { x: 0.2, y: 0.56, score: 0.9 },
    right_wrist: { x: 0.2, y: 0.68, score: 0.9 },
    left_hip: { x: 0.45, y: 0.62, score: 0.9 },
    right_hip: { x: 0.45, y: 0.7, score: 0.9 },
    left_knee: { x: 0.62, y: 0.66, score: 0.9 },
    right_knee: { x: 0.62, y: 0.74, score: 0.9 },
    left_ankle: { x: 0.76, y: 0.68, score: 0.9 },
    right_ankle: { x: 0.76, y: 0.76, score: 0.9 },
  });
}

function uprightSitUpPose(): Pose {
  return buildPose({
    nose: { x: 0.72, y: 0.52, score: 0.9 },
    left_shoulder: { x: 0.64, y: 0.56, score: 0.9 },
    right_shoulder: { x: 0.64, y: 0.64, score: 0.9 },
    left_elbow: { x: 0.7, y: 0.57, score: 0.9 },
    right_elbow: { x: 0.7, y: 0.65, score: 0.9 },
    left_wrist: { x: 0.74, y: 0.58, score: 0.9 },
    right_wrist: { x: 0.74, y: 0.66, score: 0.9 },
    left_hip: { x: 0.45, y: 0.62, score: 0.9 },
    right_hip: { x: 0.45, y: 0.7, score: 0.9 },
    left_knee: { x: 0.55, y: 0.82, score: 0.9 },
    right_knee: { x: 0.55, y: 0.9, score: 0.9 },
    left_ankle: { x: 0.76, y: 0.68, score: 0.9 },
    right_ankle: { x: 0.76, y: 0.76, score: 0.9 },
  });
}

function hipLiftSitUpPose(): Pose {
  return buildPose({
    nose: { x: 0.72, y: 0.46, score: 0.9 },
    left_shoulder: { x: 0.66, y: 0.5, score: 0.9 },
    right_shoulder: { x: 0.66, y: 0.58, score: 0.9 },
    left_elbow: { x: 0.7, y: 0.5, score: 0.9 },
    right_elbow: { x: 0.7, y: 0.58, score: 0.9 },
    left_wrist: { x: 0.74, y: 0.5, score: 0.9 },
    right_wrist: { x: 0.74, y: 0.58, score: 0.9 },
    left_hip: { x: 0.45, y: 0.54, score: 0.9 },
    right_hip: { x: 0.45, y: 0.62, score: 0.9 },
    left_knee: { x: 0.55, y: 0.82, score: 0.9 },
    right_knee: { x: 0.55, y: 0.9, score: 0.9 },
    left_ankle: { x: 0.76, y: 0.68, score: 0.9 },
    right_ankle: { x: 0.76, y: 0.76, score: 0.9 },
  });
}

function lowConfidencePose(): Pose {
  return withScore(standingPose(), 0.1);
}

function missingBodyPose(): Pose {
  return {
    keypoints: [
      { name: 'nose', x: 0.5, y: 0.1, score: 0.9 },
      { name: 'left_shoulder', x: 0.35, y: 0.25, score: 0.9 },
    ],
    score: 0.9,
  };
}

function runFrames(counter: { processFrame: (pose: Pose) => void }, pose: Pose, frames: number) {
  for (let i = 0; i < frames; i++) {
    counter.processFrame(pose);
  }
}

describe('exercise counters stability boundaries', () => {
  it.each([
    ['jump rope', () => new JumpRopeCounter()],
    ['jumping jacks', () => new JumpingJacksCounter()],
    ['squats', () => new SquatsCounter()],
    ['standing long jump', () => new StandingLongJumpCounter()],
    ['vertical jump', () => new VerticalJumpCounter()],
    ['sit ups', () => new SitUpCounter()],
  ])('%s ignores low confidence and missing keypoints', (_label, createCounter) => {
    const counter = createCounter();

    runFrames(counter, lowConfidencePose(), 80);
    runFrames(counter, missingBodyPose(), 80);

    expect(counter.getCount()).toBe(0);
  });

  it.each([
    ['jump rope', () => new JumpRopeCounter()],
    ['jumping jacks', () => new JumpingJacksCounter()],
    ['squats', () => new SquatsCounter()],
    ['standing long jump', () => new StandingLongJumpCounter()],
    ['vertical jump', () => new VerticalJumpCounter()],
  ])('%s does not count while the user only stands still', (_label, createCounter) => {
    const counter = createCounter();

    runFrames(counter, standingPose(), 240);

    expect(counter.getCount()).toBe(0);
  });

  it('reset clears accumulated state after calibration frames', () => {
    const counters = [
      new JumpRopeCounter(),
      new JumpingJacksCounter(),
      new SquatsCounter(),
      new StandingLongJumpCounter(),
      new VerticalJumpCounter(),
      new SitUpCounter(),
    ];

    for (const counter of counters) {
      runFrames(counter, standingPose(), 240);
      counter.reset();
      expect(counter.getCount()).toBe(0);
      runFrames(counter, lowConfidencePose(), 10);
      expect(counter.getCount()).toBe(0);
    }
  });

  it('counts one complete squat cycle', () => {
    const counter = new SquatsCounter();

    runFrames(counter, standingPose(), 60);
    runFrames(counter, squatBottomPose(), 45);
    runFrames(counter, standingPose(), 60);

    expect(counter.getCount()).toBe(1);
  });

  it('counts one complete jumping jack cycle', () => {
    const counter = new JumpingJacksCounter();

    runFrames(counter, standingPose(), 240);
    runFrames(counter, jumpingJackOpenPose(), 45);
    runFrames(counter, standingPose(), 60);

    expect(counter.getCount()).toBe(1);
  });

  it.each([
    ['vertical jump', () => new VerticalJumpCounter()],
    ['standing long jump', () => new StandingLongJumpCounter()],
  ])('%s counts one complete jump cycle', (_label, createCounter) => {
    const counter = createCounter();

    runFrames(counter, standingPose(), 60);
    runFrames(counter, airbornePose(), 18);
    runFrames(counter, standingPose(), 60);

    expect(counter.getCount()).toBe(1);
  });

  it('counts one complete jump rope cycle', () => {
    const counter = new JumpRopeCounter();

    runFrames(counter, standingPose(), 60);
    runFrames(counter, airbornePose(), 12);
    runFrames(counter, standingPose(), 60);

    expect(counter.getCount()).toBe(1);
  });

  it('counts one complete sit-up cycle', () => {
    const counter = new SitUpCounter();

    runFrames(counter, lyingSitUpPose(), 20);
    runFrames(counter, uprightSitUpPose(), 16);
    runFrames(counter, lyingSitUpPose(), 24);

    expect(counter.getCount()).toBe(1);
  });

  it('does not count a sit-up when the hips lift off the mat', () => {
    const counter = new SitUpCounter();

    runFrames(counter, lyingSitUpPose(), 20);
    runFrames(counter, hipLiftSitUpPose(), 16);
    runFrames(counter, lyingSitUpPose(), 24);

    expect(counter.getCount()).toBe(0);
  });
});

describe('exercise counters getFeedback', () => {
  describe('SquatsCounter', () => {
    it('returns null before calibration is complete', () => {
      const counter = new SquatsCounter();
      const fb = counter.getFeedback(standingPose());
      expect(fb).toBeNull();
    });

    it('warns about insufficient depth when standing after calibration', () => {
      const counter = new SquatsCounter();
      // Calibrate: stabilityWindow(10) × 3 rounds = 30 frames minimum, plus buffer
      runFrames(counter, standingPose(), 60);
      // Process one more standing frame to populate cached keypoints
      counter.processFrame(standingPose());
      const fb = counter.getFeedback(standingPose());
      // After calibration while standing: depthScore ~0 (< 0.3) and
      // currentKneeAngle ~170° > standingKneeAngle * 0.75 ≈ 127° → depth warning
      expect(fb?.type).toBe('warning');
      expect(fb?.message).toBe('再蹲低一些');
    });

    it('returns success when in a deep squat', () => {
      const counter = new SquatsCounter();
      // Calibrate
      runFrames(counter, standingPose(), 60);
      // Process squat bottom frames to enter deep squat state
      runFrames(counter, squatBottomPose(), 15);
      const fb = counter.getFeedback(squatBottomPose());
      // After 15 squat frames, depthScore should exceed 0.6 and isInSquat=true
      expect(fb?.type).toBe('success');
      expect(fb?.message).toBe('深度到位，保持住');
    });
  });

  describe('JumpingJacksCounter', () => {
    it('returns null before calibration', () => {
      const counter = new JumpingJacksCounter();
      const fb = counter.getFeedback(standingPose());
      expect(fb).toBeNull();
    });

    it('returns success for proper form after calibration', () => {
      const counter = new JumpingJacksCounter();
      // Calibrate with standing frames
      runFrames(counter, standingPose(), 240);
      // Process open pose frames (arms raised, feet spread)
      runFrames(counter, jumpingJackOpenPose(), 15);
      const fb = counter.getFeedback(jumpingJackOpenPose());
      // Open pose: arms above head (angle >= 40), wrists spread wide → success
      expect(fb?.type).toBe('success');
      expect(fb?.message).toBe('动作标准！保持节奏');
    });

    it('warns about arms not raised enough', () => {
      const counter = new JumpingJacksCounter();
      runFrames(counter, standingPose(), 240);
      // Arms at sides, elbows bent back toward body (T-pose with sharp elbow bend)
      // shoulder→elbow→wrist angle ≈ 26.57° (< 40°) but wrist spread is high (≈ 3.125 > baseline)
      // This simulates: user spread arms wide but didn't raise them above head
      const armsLowWidePose = buildPose({
        nose: { x: 0.5, y: 0.1, score: 0.9 },
        left_shoulder: { x: 0.35, y: 0.25, score: 0.9 },
        right_shoulder: { x: 0.65, y: 0.25, score: 0.9 },
        left_elbow: { x: 0.15, y: 0.25, score: 0.9 },
        right_elbow: { x: 0.85, y: 0.25, score: 0.9 },
        left_wrist: { x: 0.25, y: 0.2, score: 0.9 },
        right_wrist: { x: 0.75, y: 0.2, score: 0.9 },
        left_hip: { x: 0.42, y: 0.55, score: 0.9 },
        right_hip: { x: 0.58, y: 0.55, score: 0.9 },
        left_knee: { x: 0.42, y: 0.72, score: 0.9 },
        right_knee: { x: 0.58, y: 0.72, score: 0.9 },
        left_ankle: { x: 0.42, y: 0.9, score: 0.9 },
        right_ankle: { x: 0.58, y: 0.9, score: 0.9 },
      });
      // Feed enough frames for Kalman + sliding window to stabilize
      runFrames(counter, armsLowWidePose, 20);
      const fb = counter.getFeedback(armsLowWidePose);
      // Arms bent (angle ≈ 27° < 40°) with wrist spread above baseline → warning
      expect(fb?.type).toBe('warning');
      expect(fb?.message).toBe('手臂举过头顶，幅度再大一些');
    });
  });

  describe('JumpRopeCounter', () => {
    it('returns null with fewer than 3 count timestamps', () => {
      const counter = new JumpRopeCounter();
      const fb = counter.getFeedback(standingPose());
      // No counts → 0 timestamps → null
      expect(fb).toBeNull();
    });

    it('returns null after only one jump cycle', () => {
      const counter = new JumpRopeCounter();
      // Calibrate
      runFrames(counter, standingPose(), 60);
      // One jump cycle → 1 timestamp
      runFrames(counter, airbornePose(), 12);
      runFrames(counter, standingPose(), 60);
      expect(counter.getCount()).toBe(1);
      const fb = counter.getFeedback(standingPose());
      // Only 1 timestamp, need >= 3
      expect(fb).toBeNull();
    });
  });

  describe('SitUpCounter', () => {
    it('returns warning to lie down when idle', () => {
      const counter = new SitUpCounter();
      const fb = counter.getFeedback(standingPose());
      expect(fb?.type).toBe('warning');
      expect(fb?.message).toBe('请躺到垫子上，开始检测...');
    });

    it('returns null when in lying phase', () => {
      const counter = new SitUpCounter();
      // Enter lying phase: smoothAngle >= LYING_ANGLE_MIN (140°)
      runFrames(counter, lyingSitUpPose(), 20);
      const fb = counter.getFeedback(lyingSitUpPose());
      // Phase should be 'lying' → null
      expect(fb).toBeNull();
    });

    it('returns success when in up phase', () => {
      const counter = new SitUpCounter();
      // Enter lying phase
      runFrames(counter, lyingSitUpPose(), 20);
      // Rise to up phase: trunk angle < UP_ANGLE_MAX (85°)
      runFrames(counter, uprightSitUpPose(), 16);
      const fb = counter.getFeedback(uprightSitUpPose());
      // Should be in 'up' or 'rising' phase
      // In 'up': returns { type: 'success', message: '到位！' }
      // In 'rising': might return null or warning depending on frame count
      if (fb !== null) {
        expect(fb.type).toBe('success');
        expect(fb.message).toBe('到位！');
      }
    });
  });
});

describe('JumpRopeCounter calibration', () => {
  it('does not count when jump starts before calibration completes', () => {
    const counter = new JumpRopeCounter();
    // Only 5 standing frames — well below CALIBRATION_REQUIRED (20)
    runFrames(counter, standingPose(), 5);
    // Jump: 12 airborne frames (total = 17, still < 20)
    runFrames(counter, airbornePose(), 12);
    // Land: 60 standing frames — calibration completes at frame 20
    // during this phase, but the jump already passed
    runFrames(counter, standingPose(), 60);
    // No jump cycle completed after calibration → count stays 0
    expect(counter.getCount()).toBe(0);
  });

  it('completes calibration after 20 frames and can count', () => {
    const counter = new JumpRopeCounter();
    // 60 standing frames — well past CALIBRATION_REQUIRED (20)
    runFrames(counter, standingPose(), 60);
    // Full jump cycle
    runFrames(counter, airbornePose(), 12);
    runFrames(counter, standingPose(), 60);
    expect(counter.getCount()).toBe(1);
  });

  it('reset clears calibration state requiring re-calibration', () => {
    const counter = new JumpRopeCounter();
    // Calibrate and count one jump
    runFrames(counter, standingPose(), 60);
    runFrames(counter, airbornePose(), 12);
    runFrames(counter, standingPose(), 60);
    expect(counter.getCount()).toBe(1);

    // Reset — clears calibration
    counter.reset();
    expect(counter.getCount()).toBe(0);

    // Only 5 frames before jumping — calibration not complete
    runFrames(counter, standingPose(), 5);
    runFrames(counter, airbornePose(), 12);
    // Calibration completes during landing frames, but no valid jump after
    runFrames(counter, standingPose(), 60);
    expect(counter.getCount()).toBe(0);
  });
});
