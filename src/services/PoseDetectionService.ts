/**
 * PoseDetectionService — Desktop pose utility layer.
 *
 * This service keeps the Desktop-specific API (name-based keypoint lookup,
 * keypointMap optimization, atan2 angle calculation) while re-exporting
 * shared pose helpers from @ai-sport/core for new code.
 *
 * Migration notes:
 * - Desktop Keypoint type: { x, y, score?, name? }
 * - Core Keypoint type:    { x, y, z, visibility }
 *   These are structurally different, so existing methods keep their own
 *   implementations. New code should prefer importing directly from
 *   '@ai-sport/core' and using the unified Keypoint type.
 *
 * - Old: PoseDetectionService.getKeypoint(pose, name)
 *   New: import { getKeypointByName } from '@ai-sport/core'
 *
 * - Old: PoseDetectionService.calculateAngle(a, b, c)
 *   New: import { calculateAngle } from '@ai-sport/core'
 *        calculateAngle(pose, aIndex, bIndex, cIndex)
 */

import { Pose, Keypoint } from '../types';

// Re-export shared pose helpers for gradual adoption by new code.
// These use the core Keypoint type ({ x, y, z, visibility }).
export {
  midpoint as coreMidpoint,
  distance as coreDistance,
  getBodyHeight as coreGetBodyHeight,
  hasRequiredKeypoints as coreHasRequiredKeypoints,
} from '@ai-sport/core';

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

  /**
   * Calculate the angle (degrees) at point b formed by segments b→a and b→c.
   * Uses the atan2 approach (equivalent to core's dot-product method).
   * Result is always in [0, 180].
   */
  calculateAngle(a: Keypoint, b: Keypoint, c: Keypoint): number {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs((radians * 180.0) / Math.PI);
    if (angle > 180.0) angle = 360 - angle;
    return angle;
  }

  /**
   * Euclidean distance between two keypoints (2D, matching core's algorithm).
   */
  distance(a: Keypoint, b: Keypoint): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Midpoint between two keypoints.
   */
  midpoint(a: Keypoint, b: Keypoint): { x: number; y: number } {
    return {
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    };
  }
}

export default new PoseDetectionService();
