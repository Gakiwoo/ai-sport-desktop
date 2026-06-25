import { Pose, FormFeedback, Keypoint } from '../../types';
import { ExerciseCounter } from '../ExerciseCounter';
import { KalmanFilter1D, SlidingWindow } from '../filters/KalmanFilter1D';

/**
 * 深蹲计数器 V3
 *
 * 改进点（相对 V2）：
 * 1. 多信号融合——膝盖角度(50%) + 髋关节角度(30%) + 身体重心Y位移(20%)
 * 2. 髋关节角度作为辅助确认：深蹲时髋角度明显增大，比膝盖角度更鲁棒
 * 3. 重心Y位移检测：深蹲时身体重心明显下降，提供第三维确认
 * 4. 稳定校准——用滑动窗口方差检测用户是否静止站立
 * 5. 峰值检测替代简单状态机——用深度评分的波谷（蹲下）+波峰（站起）配对计数
 * 6. 修复 getFeedback 逻辑：真正检测膝盖是否前伸、背部是否挺直、蹲深是否足够
 */
export class SquatsCounter extends ExerciseCounter {
  // ── 卡尔曼滤波器 ──
  private readonly leftKneeFilter = new KalmanFilter1D({ processNoise: 0.3, measurementNoise: 4 });
  private readonly rightKneeFilter = new KalmanFilter1D({ processNoise: 0.3, measurementNoise: 4 });
  private readonly leftHipAngleFilter = new KalmanFilter1D({
    processNoise: 0.3,
    measurementNoise: 4,
  });
  private readonly rightHipAngleFilter = new KalmanFilter1D({
    processNoise: 0.3,
    measurementNoise: 4,
  });
  private readonly centerHeightFilter = new KalmanFilter1D({
    processNoise: 0.0005,
    measurementNoise: 0.005,
  });

  // ── 滑动窗口 ──
  private readonly kneeAngleWindow = new SlidingWindow(7);
  private readonly hipAngleWindow = new SlidingWindow(7);
  private readonly stabilityWindow = new SlidingWindow(10);

  // ── 校准 ──
  private calibrated = false;
  private calibrationSamples: number[] = [];
  private calibrationHipSamples: number[] = [];
  private calibrationCenterYSamples: number[] = [];
  private readonly CALIBRATION_REQUIRED = 3;

  // ── 动态阈值 ──
  private standingKneeAngle: number | null = null;
  private standingHipAngle: number | null = null;
  private standingCenterY: number | null = null;
  private downScoreThreshold = 0.55;

  // ── 峰值配对 ──
  private pendingDown = false;

  // ── 实时信号值（供 getFeedback / Canvas 可视化） ──
  private currentKneeAngle = 0;
  private currentDepthScore = 0;
  private _isInSquat = false;

  // ── 缓存关键点（processFrame 已查询，getFeedback 复用避免重复遍历） ──
  private cachedShoulders: { left: Keypoint | null; right: Keypoint | null } = {
    left: null,
    right: null,
  };
  private cachedHips: { left: Keypoint | null; right: Keypoint | null } = {
    left: null,
    right: null,
  };
  private cachedKnees: { left: Keypoint | null; right: Keypoint | null } = {
    left: null,
    right: null,
  };
  private cachedAnkles: { left: Keypoint | null; right: Keypoint | null } = {
    left: null,
    right: null,
  };

  processFrame(pose: Pose): void {
    // ── 膝盖角度：髋-膝-踝 ──
    const rawLeftKneeAngle = this.calculateAngle(pose, 'left_hip', 'left_knee', 'left_ankle');
    const rawRightKneeAngle = this.calculateAngle(pose, 'right_hip', 'right_knee', 'right_ankle');
    if (rawLeftKneeAngle === null || rawRightKneeAngle === null) return;

    // ── 髋关节角度：肩-髋-膝 ──
    const rawLeftHipAngle = this.calculateAngle(pose, 'left_shoulder', 'left_hip', 'left_knee');
    const rawRightHipAngle = this.calculateAngle(pose, 'right_shoulder', 'right_hip', 'right_knee');
    if (rawLeftHipAngle === null || rawRightHipAngle === null) return;

    // ── 身体重心 Y（多关键点融合） ──
    const leftShoulder = this.getKeypoint(pose, 'left_shoulder');
    const rightShoulder = this.getKeypoint(pose, 'right_shoulder');
    const leftHip = this.getKeypoint(pose, 'left_hip');
    const rightHip = this.getKeypoint(pose, 'right_hip');
    const leftAnkle = this.getKeypoint(pose, 'left_ankle');
    const rightAnkle = this.getKeypoint(pose, 'right_ankle');
    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip || !leftAnkle || !rightAnkle)
      return;

    // 缓存关键点供 getFeedback 复用
    this.cachedShoulders = { left: leftShoulder, right: rightShoulder };
    this.cachedHips = { left: leftHip, right: rightHip };
    this.cachedKnees = {
      left: this.getKeypoint(pose, 'left_knee') ?? null,
      right: this.getKeypoint(pose, 'right_knee') ?? null,
    };
    this.cachedAnkles = { left: leftAnkle, right: rightAnkle };

    const rawCenterY =
      ((leftShoulder.y + rightShoulder.y) / 2) * 0.2 +
      ((leftHip.y + rightHip.y) / 2) * 0.5 +
      ((leftAnkle.y + rightAnkle.y) / 2) * 0.3;

    // ── 卡尔曼滤波 ──
    const smoothLeftKnee = this.leftKneeFilter.update(rawLeftKneeAngle);
    const smoothRightKnee = this.rightKneeFilter.update(rawRightKneeAngle);
    const avgKneeAngle = (smoothLeftKnee + smoothRightKnee) / 2;

    const smoothLeftHip = this.leftHipAngleFilter.update(rawLeftHipAngle);
    const smoothRightHip = this.rightHipAngleFilter.update(rawRightHipAngle);
    const avgHipAngle = (smoothLeftHip + smoothRightHip) / 2;

    const smoothCenterY = this.centerHeightFilter.update(rawCenterY);

    // 缓存实时值
    this.currentKneeAngle = avgKneeAngle;

    // ── 滑动窗口 ──
    this.kneeAngleWindow.push(avgKneeAngle);
    this.hipAngleWindow.push(avgHipAngle);

    const avgKneeAngleSmooth = this.kneeAngleWindow.getMean();
    const avgHipAngleSmooth = this.hipAngleWindow.getMean();

    // ── 校准阶段 ──
    if (!this.calibrated) {
      this.stabilityWindow.push(avgKneeAngle);
      if (this.stabilityWindow.length >= this.stabilityWindow.capacity) {
        const stddev = this.stabilityWindow.getStdDev();
        if (stddev < 3) {
          // 膝盖角度方差 < 3° → 静止站立
          this.calibrationSamples.push(avgKneeAngleSmooth);
          this.calibrationHipSamples.push(avgHipAngleSmooth);
          this.calibrationCenterYSamples.push(smoothCenterY);
        }
        this.stabilityWindow.reset();
      }

      if (this.calibrationSamples.length >= this.CALIBRATION_REQUIRED) {
        const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
        this.standingKneeAngle = avg(this.calibrationSamples);
        this.standingHipAngle = avg(this.calibrationHipSamples);
        this.standingCenterY = avg(this.calibrationCenterYSamples);
        // 动态阈值
        this.downScoreThreshold = 0.55;
        this.calibrated = true;
      }
      return;
    }

    // ── 深度评分（depth score）：0 = 站立, 1 = 深蹲到底 ──
    // 膝盖角度评分：站立 ~170° → 0, 蹲下 ~70° → 1
    const kneeRange = (this.standingKneeAngle ?? 170) - 60;
    const kneeScore = Math.min(
      Math.max(((this.standingKneeAngle ?? 170) - avgKneeAngleSmooth) / Math.max(kneeRange, 30), 0),
      1,
    );

    // 髋角度评分：站立 ~90° → 0, 蹲下 ~50° → 1（髋角度在深蹲时减小）
    const hipRange = (this.standingHipAngle ?? 90) - 40;
    const hipScore = Math.min(
      Math.max(((this.standingHipAngle ?? 90) - avgHipAngleSmooth) / Math.max(hipRange, 20), 0),
      1,
    );

    // 重心Y位移评分：站立 → 0, 蹲下（Y增大/重心下降） → 1
    let yScore = 0;
    if (this.standingCenterY !== null) {
      const yShift = smoothCenterY - this.standingCenterY;
      yScore = Math.min(Math.max(yShift / 0.08, 0), 1); // 0.08 归一化位移对应一次完整深蹲
    }

    // 多信号融合
    const depthScore = kneeScore * 0.5 + hipScore * 0.3 + yScore * 0.2;
    this.currentDepthScore = depthScore;
    this._isInSquat = depthScore > this.downScoreThreshold;

    if (!this.pendingDown && depthScore >= this.downScoreThreshold) {
      this.pendingDown = true;
      this.lastState = 'down';
    }

    if (this.pendingDown && depthScore <= this.downScoreThreshold * 0.45) {
      this.pendingDown = false;
      this.count++;
      this.lastState = 'up';
      return;
    }
  }

  getFeedback(_pose: Pose): FormFeedback | null {
    if (!this.calibrated) return null;

    const leftShoulder = this.cachedShoulders.left;
    const rightShoulder = this.cachedShoulders.right;
    const leftHip = this.cachedHips.left;
    const rightHip = this.cachedHips.right;
    const leftKnee = this.cachedKnees.left;
    const rightKnee = this.cachedKnees.right;
    const leftAnkle = this.cachedAnkles.left;
    const rightAnkle = this.cachedAnkles.right;

    if (
      !leftShoulder ||
      !rightShoulder ||
      !leftHip ||
      !rightHip ||
      !leftKnee ||
      !rightKnee ||
      !leftAnkle ||
      !rightAnkle
    ) {
      return null;
    }

    // ── 背部是否挺直：肩-髋中点连线与竖直方向的偏角 ──
    const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
    const hipMidX = (leftHip.x + rightHip.x) / 2;
    const torsoOffset = Math.abs(shoulderMidX - hipMidX);
    const hipWidth = Math.abs(rightHip.x - leftHip.x);

    if (hipWidth > 0.01 && torsoOffset > hipWidth * 0.6) {
      return { type: 'error', message: '背部挺直，身体不要过度前倾' };
    }

    // ── 膝盖是否过度前伸（用 Y 差异估算深度） ──
    const kneeAnkleYDiff = (leftKnee.y + rightKnee.y) / 2 - (leftAnkle.y + rightAnkle.y) / 2;

    if (this._isInSquat && kneeAnkleYDiff > 0.05) {
      // 膝盖比脚尖低很多 → 膝盖可能过度前伸
      return { type: 'warning', message: '膝盖不要过度前伸' };
    }

    // ── 蹲深是否足够 ──
    if (
      this.currentDepthScore < 0.3 &&
      this.currentKneeAngle > (this.standingKneeAngle ?? 170) * 0.75
    ) {
      return { type: 'warning', message: '再蹲低一些' };
    }

    // ── 正向反馈：标准深蹲 ──
    if (this._isInSquat && this.currentDepthScore > 0.6) {
      return { type: 'success', message: '深度到位，保持住' };
    }

    return null;
  }

  reset(): void {
    super.reset();
    this.leftKneeFilter.reset();
    this.rightKneeFilter.reset();
    this.leftHipAngleFilter.reset();
    this.rightHipAngleFilter.reset();
    this.centerHeightFilter.reset();
    this.kneeAngleWindow.reset();
    this.hipAngleWindow.reset();
    this.stabilityWindow.reset();
    this.calibrated = false;
    this.calibrationSamples = [];
    this.calibrationHipSamples = [];
    this.calibrationCenterYSamples = [];
    this.standingKneeAngle = null;
    this.standingHipAngle = null;
    this.standingCenterY = null;
    this.pendingDown = false;
    this.currentKneeAngle = 0;
    this.currentDepthScore = 0;
    this._isInSquat = false;
    this.cachedShoulders = { left: null, right: null };
    this.cachedHips = { left: null, right: null };
    this.cachedKnees = { left: null, right: null };
    this.cachedAnkles = { left: null, right: null };
  }
}
