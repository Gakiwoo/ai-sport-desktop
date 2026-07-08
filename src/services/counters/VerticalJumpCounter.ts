import { Pose, FormFeedback } from '../../types';
import { ExerciseCounter } from '../ExerciseCounter';
import { getLandingKneeAlignmentFeedback } from './landingFeedback';
import { MultiPointKalman, SlidingWindow, PeakDetector } from '../filters/KalmanFilter1D';

/**
 * 原地纵跳计数器 V3
 *
 * 改进点（相对 V2）：
 * 1. 添加 90 帧基线窗口，持续维护站立基线（修复连续跳跃基线漂移）
 * 2. 峰值检测使用外部基线（baselineWindow 中值）而非窗口边缘值
 * 3. minHeight 从 0.02 提升到 0.025，过滤噪声误触发
 * 4. 仅在 STANDING 状态动态更新基线，跳跃中不更新
 * 5. 保留了姿态反馈（落地膝盖对准脚尖）
 */
export class VerticalJumpCounter extends ExerciseCounter {
  private readonly kalman = new MultiPointKalman({
    processNoise: 0.0008,
    measurementNoise: 0.008,
  });

  /** 基线窗口：持续记录站立时的 Y 值（~3s，默认 90 帧 @33ms/帧）；
   *  帧间隔变化时通过 super.frameIntervalMs 获取当前值 */
  private readonly baselineWindow = new SlidingWindow(90);

  /** 身体中心 Y 值滑动窗口（约 0.8 秒，默认 25 帧 @33ms/帧）；
   *  帧间隔变化时通过 super.frameIntervalMs 获取当前值 */
  private readonly yWindow = new SlidingWindow(25);

  /** 峰值检测器：检测 Y 值局部最小值（身体到达最高点） */
  private readonly peakDetector = new PeakDetector({
    neighborRadius: 2,
    /** 纵跳频率较低，两次跳跃至少间隔 ~400ms（12帧 @30fps） */
    minPeakDistance: 12,
    /** 提升后的高度阈值：0.025 归一化坐标 ≈ 人体身高的 2.5%，滤除微小抖动 */
    minPeakHeight: 0.025,
  });

  /** 基线值（baselineWindow 中值） */
  private bodyBaseline = 0;

  /** 是否已完成初始校准 */
  private calibrated = false;
  private calibrationFrames = 0;
  /** 校准所需帧数：用户稳定站立约 0.67s 后采集站立基线 */
  private readonly CALIBRATION_REQUIRED = 20;

  /** 上一次检测到峰值后的帧数（用于控制基线更新时机） */
  private framesSinceLastPeak = Infinity;
  /** 基线更新间隔计数器 */
  private baselineUpdateCounter = 0;

  /** 最近一次计数的帧号，用于限制反馈只在落地阶段触发 */
  private lastCountFrame = -Infinity;
  private currentFrame = 0;

  processFrame(pose: Pose): void {
    const leftShoulder = this.getKeypoint(pose, 'left_shoulder');
    const rightShoulder = this.getKeypoint(pose, 'right_shoulder');
    const leftHip = this.getKeypoint(pose, 'left_hip');
    const rightHip = this.getKeypoint(pose, 'right_hip');
    const leftAnkle = this.getKeypoint(pose, 'left_ankle');
    const rightAnkle = this.getKeypoint(pose, 'right_ankle');

    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip || !leftAnkle || !rightAnkle)
      return;
    if (
      (leftShoulder.score || 0) < 0.3 ||
      (rightShoulder.score || 0) < 0.3 ||
      (leftHip.score || 0) < 0.3 ||
      (rightHip.score || 0) < 0.3 ||
      (leftAnkle.score || 0) < 0.3 ||
      (rightAnkle.score || 0) < 0.3
    )
      return;

    // 多关键点融合：肩 0.2 + 髋 0.5 + 踝 0.3
    const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const hipY = (leftHip.y + rightHip.y) / 2;
    const ankleY = (leftAnkle.y + rightAnkle.y) / 2;
    const rawCenterY = shoulderY * 0.2 + hipY * 0.5 + ankleY * 0.3;

    // 卡尔曼滤波
    const smoothCenterY = this.kalman.update('bodyCenterY', rawCenterY);

    // 校准阶段：持续采集基线
    this.calibrationFrames++;
    this.baselineWindow.push(smoothCenterY);

    if (this.calibrationFrames < this.CALIBRATION_REQUIRED) return;
    if (!this.calibrated) {
      this.bodyBaseline = this.baselineWindow.getMedian();
      this.calibrated = true;
    }

    // 滑动窗口填充
    this.yWindow.push(smoothCenterY);
    if (!this.yWindow.isFull) return;

    // 帧计数
    this.currentFrame++;

    // 峰值检测：使用外部基线（baselineWindow 中值）
    const detected = this.peakDetector.detect(this.yWindow.data, 'min', this.bodyBaseline);
    if (detected) {
      this.count++;
      this.framesSinceLastPeak = 0;
      this.lastCountFrame = this.currentFrame;
    } else {
      this.framesSinceLastPeak++;
    }

    // 动态更新基线：仅在峰值后至少 15 帧稳定站立时更新
    if (this.framesSinceLastPeak > 15) {
      this.baselineUpdateCounter++;
      if (this.baselineUpdateCounter >= 10) {
        this.baselineUpdateCounter = 0;
        this.bodyBaseline = this.baselineWindow.getMedian();
      }
    } else {
      this.baselineUpdateCounter = 0;
    }
  }

  reset(): void {
    super.reset();
    this.kalman.reset();
    this.baselineWindow.reset();
    this.yWindow.reset();
    this.peakDetector.reset();
    this.bodyBaseline = 0;
    this.calibrated = false;
    this.calibrationFrames = 0;
    this.framesSinceLastPeak = Infinity;
    this.baselineUpdateCounter = 0;
    this.lastCountFrame = -Infinity;
    this.currentFrame = 0;
  }

  getFeedback(pose: Pose): FormFeedback | null {
    return getLandingKneeAlignmentFeedback(pose, this.currentFrame, this.lastCountFrame, 20);
  }
}
