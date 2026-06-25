import { Pose, FormFeedback } from '../../types';
import PoseDetectionService from '../PoseDetectionService';

/**
 * 落地阶段膝盖对齐反馈（VerticalJump / StandingLongJump 共用）
 *
 * 检测膝盖 X 坐标是否明显偏离髋部正下方，偏移超过髋宽 50% 时给出警告。
 *
 * @param pose         当前帧姿态
 * @param currentFrame 当前帧编号
 * @param lastCountFrame 上一次计数时的帧编号
 * @param frameWindow  计数后多少帧内提供反馈
 */
export function getLandingKneeAlignmentFeedback(
  pose: Pose,
  currentFrame: number,
  lastCountFrame: number,
  frameWindow: number,
): FormFeedback | null {
  if (currentFrame - lastCountFrame > frameWindow) return null;

  const leftKnee = PoseDetectionService.getKeypoint(pose, 'left_knee');
  const rightKnee = PoseDetectionService.getKeypoint(pose, 'right_knee');
  const leftHip = PoseDetectionService.getKeypoint(pose, 'left_hip');
  const rightHip = PoseDetectionService.getKeypoint(pose, 'right_hip');

  if (!leftKnee || !rightKnee || !leftHip || !rightHip) return null;

  const avgKneeX = (leftKnee.x + rightKnee.x) / 2;
  const avgHipX = (leftHip.x + rightHip.x) / 2;
  const hipWidth = Math.abs(rightHip.x - leftHip.x);
  const xOffset = Math.abs(avgKneeX - avgHipX);

  if (hipWidth > 0.01 && xOffset > hipWidth * 0.5) {
    return { type: 'warning', message: '落地时膝盖对准脚尖' };
  }
  return null;
}
