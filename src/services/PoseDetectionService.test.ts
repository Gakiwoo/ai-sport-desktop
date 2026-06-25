import { describe, it, expect } from 'vitest';
import PoseDetectionService from './PoseDetectionService';
import { Pose, Keypoint } from '../types';

// ── 辅助：快速构建关键点 ──
function kp(name: string, x: number, y: number, score = 0.9): Keypoint {
  return { name, x, y, score };
}

// ── 辅助：快速构建 Pose ──
function makePose(keypoints: Keypoint[]): Pose {
  return { keypoints, score: 0.9 };
}

// ────────────────────────────────────────────
// buildKeypointMap
// ────────────────────────────────────────────
describe('PoseDetectionService.buildKeypointMap', () => {
  it('构建 keypointMap 后可通过名称 O(1) 查找', () => {
    const pose = makePose([
      kp('left_shoulder', 0.3, 0.2),
      kp('right_shoulder', 0.7, 0.2),
      kp('left_hip', 0.35, 0.5),
    ]);
    expect(pose.keypointMap).toBeUndefined();

    PoseDetectionService.buildKeypointMap(pose);

    expect(pose.keypointMap).toBeDefined();
    expect(pose.keypointMap!.get('left_shoulder')?.x).toBeCloseTo(0.3);
    expect(pose.keypointMap!.get('right_shoulder')?.x).toBeCloseTo(0.7);
    expect(pose.keypointMap!.get('left_hip')?.y).toBeCloseTo(0.5);
    expect(pose.keypointMap!.get('nonexistent')).toBeUndefined();
  });

  it('重复调用不会覆盖已构建的 Map', () => {
    const pose = makePose([kp('nose', 0.5, 0.1)]);
    PoseDetectionService.buildKeypointMap(pose);
    const firstMap = pose.keypointMap;

    // 修改关键点列表后再次调用
    pose.keypoints.push(kp('left_eye', 0.45, 0.08));
    PoseDetectionService.buildKeypointMap(pose);

    // Map 应保持不变（不重建）
    expect(pose.keypointMap).toBe(firstMap);
    expect(pose.keypointMap!.get('left_eye')).toBeUndefined();
  });

  it('跳过无 name 的关键点', () => {
    const pose = makePose([
      { x: 0.5, y: 0.5, score: 0.9 }, // 无 name
      kp('nose', 0.5, 0.1),
    ]);
    PoseDetectionService.buildKeypointMap(pose);
    expect(pose.keypointMap!.size).toBe(1);
    expect(pose.keypointMap!.get('nose')).toBeDefined();
  });
});

// ────────────────────────────────────────────
// getKeypoint
// ────────────────────────────────────────────
describe('PoseDetectionService.getKeypoint', () => {
  it('优先使用 keypointMap（O(1) 查找）', () => {
    const pose = makePose([kp('left_hip', 0.3, 0.5), kp('right_hip', 0.7, 0.5)]);
    PoseDetectionService.buildKeypointMap(pose);

    const left = PoseDetectionService.getKeypoint(pose, 'left_hip');
    expect(left?.x).toBeCloseTo(0.3);

    const missing = PoseDetectionService.getKeypoint(pose, 'nose');
    expect(missing).toBeUndefined();
  });

  it('无 keypointMap 时回退到 Array.find（O(n) 兜底）', () => {
    const pose = makePose([kp('nose', 0.5, 0.1), kp('left_shoulder', 0.3, 0.2)]);
    // 不调用 buildKeypointMap
    expect(pose.keypointMap).toBeUndefined();

    const nose = PoseDetectionService.getKeypoint(pose, 'nose');
    expect(nose?.y).toBeCloseTo(0.1);

    const missing = PoseDetectionService.getKeypoint(pose, 'right_ankle');
    expect(missing).toBeUndefined();
  });
});

// ────────────────────────────────────────────
// calculateAngle
// ────────────────────────────────────────────
describe('PoseDetectionService.calculateAngle', () => {
  it('三点共线（水平）返回 ~180°', () => {
    const a = kp('a', 0, 0);
    const b = kp('b', 1, 0); // 中间点
    const c = kp('c', 2, 0);
    const angle = PoseDetectionService.calculateAngle(a, b, c);
    expect(angle).toBeCloseTo(180, 0);
  });

  it('直角返回 ~90°', () => {
    const a = kp('a', 0, 0);
    const b = kp('b', 1, 0);
    const c = kp('c', 1, 1);
    const angle = PoseDetectionService.calculateAngle(a, b, c);
    expect(angle).toBeCloseTo(90, 0);
  });

  it('三点重合返回 ~0°', () => {
    const a = kp('a', 0, 0);
    const b = kp('b', 1, 0);
    const c = kp('c', 2, 0.001); // 接近共线
    const angle = PoseDetectionService.calculateAngle(a, b, c);
    expect(angle).toBeCloseTo(180, 0);
  });

  it('锐角（~45°）', () => {
    // b 在顶点，BA 指向左方，BC 指向右上 45° → 夹角 = 45°
    const a = kp('a', 0, 0);
    const b = kp('b', 0, 1);
    const c = kp('c', 1, 0);
    const angle = PoseDetectionService.calculateAngle(a, b, c);
    expect(angle).toBeCloseTo(45, 0);
  });

  it('对称性：交换 a 和 c 结果相同', () => {
    const a = kp('a', 0.1, 0.3);
    const b = kp('b', 0.5, 0.5);
    const c = kp('c', 0.8, 0.2);
    const angle1 = PoseDetectionService.calculateAngle(a, b, c);
    const angle2 = PoseDetectionService.calculateAngle(c, b, a);
    expect(angle1).toBeCloseTo(angle2, 5);
  });

  it('结果始终在 [0, 180] 范围内', () => {
    // 多组随机关键点
    for (let i = 0; i < 50; i++) {
      const a = kp('a', Math.random(), Math.random());
      const b = kp('b', Math.random(), Math.random());
      const c = kp('c', Math.random(), Math.random());
      const angle = PoseDetectionService.calculateAngle(a, b, c);
      expect(angle).toBeGreaterThanOrEqual(0);
      expect(angle).toBeLessThanOrEqual(180);
    }
  });
});
