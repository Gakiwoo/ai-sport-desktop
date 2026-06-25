import { Pose, Keypoint } from '../types';

class PoseDetectionService {
  /**
   * 构建 keypointMap（在 onResults 入口调用一次，后续全部 O(1) 查找）
   */
  buildKeypointMap(pose: Pose): void {
    if (pose.keypointMap) return; // 已构建则跳过
    pose.keypointMap = new Map();
    for (const kp of pose.keypoints) {
      if (kp.name) pose.keypointMap.set(kp.name, kp);
    }
  }

  getKeypoint(pose: Pose, name: string): Keypoint | undefined {
    // 优先使用预构建 Map（O(1)），兜底用 Array.find（O(n)）
    if (pose.keypointMap) return pose.keypointMap.get(name);
    return pose.keypoints.find((kp) => kp.name === name);
  }

  calculateAngle(a: Keypoint, b: Keypoint, c: Keypoint): number {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180.0) angle = 360 - angle;
    return angle;
  }
}

export default new PoseDetectionService();
