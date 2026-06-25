import { Pose, FormFeedback } from '../../types';
import { ExerciseCounter } from '../ExerciseCounter';
import { getLandingKneeAlignmentFeedback } from './landingFeedback';
import { MultiPointKalman, SlidingWindow, PeakDetector } from '../filters/KalmanFilter1D';

/**
 * 立定跳远计数器 V3
 *
 * 改进点（相对 V2）：
 * 1. 卡尔曼滤波消除关键点抖动
 * 2. 多关键点融合计算身体中心（肩+髋+踝）
 * 3. 峰值检测替代简单位移阈值
 * 4. 自适应基线——用滑动窗口持续更新站立基线，而非固定 EMA
 * 5. 跳跃位移阈值从硬编码 0.08 改为基于校准动态计算
 * 6. 峰值检测使用外部基线（baselineWindow 中值），修复窗口边缘基线偏移
 * 7. 仅在稳定站立时更新基线，跳跃中不更新
 * 8. 保留了姿态反馈
 */
export class StandingLongJumpCounter extends ExerciseCounter {
  private readonly kalman = new MultiPointKalman({
    processNoise: 0.0008,
    measurementNoise: 0.008,
  });

  /** 基线窗口：持续记录站立时的 Y 值（用于计算相对位移） */
  private readonly baselineWindow = new SlidingWindow(90);

  /** 身体中心 Y 值滑动窗口 */
  private readonly yWindow = new SlidingWindow(30);

  /** 峰值检测器 */
  private readonly peakDetector = new PeakDetector({
    neighborRadius: 2,
    minPeakDistance: 20, // 立定跳远频率很低，两次跳跃至少间隔 ~667ms
    minPeakHeight: 0.025, // 立定跳远位移较大，阈值更高
  });

  /** 基线值（baselineWindow 中值） */
  private bodyBaseline = 0;

  /** 校准参数 */
  private calibrated = false;
  private calibrationFrames = 0;
  private readonly CALIBRATION_REQUIRED = 20;

  /** 上一次检测到峰值后的帧数 */
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

    // 多关键点融合
    const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const hipY = (leftHip.y + rightHip.y) / 2;
    const ankleY = (leftAnkle.y + rightAnkle.y) / 2;
    const rawCenterY = shoulderY * 0.2 + hipY * 0.5 + ankleY * 0.3;

    // 卡尔曼滤波
    const smoothCenterY = this.kalman.update('bodyCenterY', rawCenterY);

    // ── 校准阶段 ──
    this.calibrationFrames++;
    this.baselineWindow.push(smoothCenterY);

    if (this.calibrationFrames < this.CALIBRATION_REQUIRED) return;
    if (!this.calibrated) {
      this.bodyBaseline = this.baselineWindow.getMedian();
      this.calibrated = true;
    }

    // ── 滑动窗口填充 ──
    this.yWindow.push(smoothCenterY);
    if (!this.yWindow.isFull) return;

    // 帧计数
    this.currentFrame++;

    // ── 峰值检测：使用外部基线（baselineWindow 中值） ──
    const detected = this.peakDetector.detect(this.yWindow.data, 'min', this.bodyBaseline);
    if (detected) {
      this.count++;
      this.framesSinceLastPeak = 0;
      this.lastCountFrame = this.currentFrame;
    } else {
      this.framesSinceLastPeak++;
    }

    // 动态更新基线：仅在峰值后稳定站立时更新
    if (this.framesSinceLastPeak > 20) {
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
    return getLandingKneeAlignmentFeedback(pose, this.currentFrame, this.lastCountFrame, 25);
  }
}
