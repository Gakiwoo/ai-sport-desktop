import { describe, expect, it } from 'vitest';
import { EXERCISE_NAMES, KEYPOINT_NAMES } from './exerciseConfig';
import PoseDetectionService from '../services/PoseDetectionService';
import { Pose } from '../types';

describe('MediaPipe pose keypoint names', () => {
  it('matches the 33-landmark MediaPipe Pose index order', () => {
    expect(KEYPOINT_NAMES).toHaveLength(33);
    expect(KEYPOINT_NAMES[0]).toBe('nose');
    expect(KEYPOINT_NAMES[11]).toBe('left_shoulder');
    expect(KEYPOINT_NAMES[12]).toBe('right_shoulder');
    expect(KEYPOINT_NAMES[13]).toBe('left_elbow');
    expect(KEYPOINT_NAMES[14]).toBe('right_elbow');
    expect(KEYPOINT_NAMES[15]).toBe('left_wrist');
    expect(KEYPOINT_NAMES[16]).toBe('right_wrist');
    expect(KEYPOINT_NAMES[23]).toBe('left_hip');
    expect(KEYPOINT_NAMES[24]).toBe('right_hip');
    expect(KEYPOINT_NAMES[25]).toBe('left_knee');
    expect(KEYPOINT_NAMES[26]).toBe('right_knee');
    expect(KEYPOINT_NAMES[27]).toBe('left_ankle');
    expect(KEYPOINT_NAMES[28]).toBe('right_ankle');
  });

  it('builds a lookup map that resolves counter keypoints to the right landmarks', () => {
    const pose: Pose = {
      keypoints: KEYPOINT_NAMES.map((name, idx) => ({
        x: idx,
        y: idx + 0.5,
        score: 0.9,
        name,
      })),
    };

    PoseDetectionService.buildKeypointMap(pose);

    expect(PoseDetectionService.getKeypoint(pose, 'left_shoulder')?.x).toBe(11);
    expect(PoseDetectionService.getKeypoint(pose, 'right_hip')?.x).toBe(24);
    expect(PoseDetectionService.getKeypoint(pose, 'left_knee')?.x).toBe(25);
    expect(PoseDetectionService.getKeypoint(pose, 'right_ankle')?.x).toBe(28);
  });
});

describe('exercise display names', () => {
  it('uses readable Chinese exercise names', () => {
    expect(EXERCISE_NAMES).toMatchObject({
      jump_rope: '跳绳',
      jumping_jacks: '开合跳',
      squats: '深蹲',
      standing_long_jump: '立定跳远',
      vertical_jump: '原地纵跳',
      sit_ups: '仰卧起坐',
    });
  });
});
