import { Pose, FormFeedback } from '../../types';
import { ExerciseCounter } from '../ExerciseCounter';
import { MultiPointKalman, SlidingWindow } from '../filters/KalmanFilter1D';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 跳绳计数器 V3.5 — 精准状态机算法 + P1 优化
//
// 核心改进（基于开源调研 + 学术论文）：
//   1. 四状态机：STANDING → ASCENDING → AIRBORNE → LANDING
//   2. 踝关节离地验证（自适应身体比例阈值）
//   3. 最小/最大滞空帧数约束
//   4. 迟滞防抖
//   5. 动态基线（滑动窗口中值，适应深度变化）
// P1 优化：
//   6. 手腕旋转检测 — 区分跳绳与原地蹦跳
//   7. 跳绳节奏检测（速度计算 + 实时反馈）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 跳跃状态机四个阶段
 *
 * Y 轴方向：MediaPipe 归一化坐标中，Y 向下为正。
 * 跳起 = Y 减小，落地 = Y 增大。
 */
enum JumpState {
  STANDING = 'STANDING',
  ASCENDING = 'ASCENDING',
  AIRBORNE = 'AIRBORNE',
  LANDING = 'LANDING',
}

/** 一帧中提取的关键运动特征 */
interface FrameFeatures {
  velocity: number;
  ankleLift: number;
  bodyLift: number;
  bodyHeight: number;
  wristAmplitude: number;
}

export class JumpRopeCounter extends ExerciseCounter {
  // ── 滤波器 ──
  private readonly kalman = new MultiPointKalman({
    processNoise: 0.0005,
    measurementNoise: 0.006,
  });

  // ── 动态基线 ──
  private readonly bodyBaselineWindow = new SlidingWindow(90);
  private readonly ankleBaselineWindow = new SlidingWindow(90);
  private bodyBaseline = 0;
  private ankleBaseline = 0;

  // ── 自适应阈值 ──
  private bodyHeight = 0;
  private takeoffThreshold = 0;
  private landThreshold = 0;

  // ── 状态机 ──
  private state: JumpState = JumpState.STANDING;
  private airborneFrames = 0;
  private landingFrames = 0;
  private framesSinceLastCount = 0;

  // ── 校准 ──
  private calibrated = false;
  private calibrationFrames = 0;
  private readonly CALIBRATION_REQUIRED = 20;

  // ── 速度追踪 ──
  private prevBodyY: number | null = null;
  private prevVelocity = 0;

  // ── 手腕旋转检测 — 区分跳绳与原地蹦跳 ──
  private readonly leftWristWindow = new SlidingWindow(15);
  private readonly rightWristWindow = new SlidingWindow(15);
  private readonly WRIST_ACTIVE_THRESHOLD = 0.02;
  private readonly WRIST_INACTIVE_LIFT_MULTIPLIER = 1.8;

  // ── 跳绳节奏检测 ──
  private countTimestamps: number[] = [];
  private readonly MAX_RECENT_COUNTS = 8;

  // ── 调试 ──
  private debugFrameCount = 0;
  private static readonly DEBUG = import.meta.env.DEV;

  // ━━ 阈值常量 ━━

  private readonly TAKEOFF_BODY_RATIO = 0.06;
  private readonly MIN_AIRBORNE_FRAMES = 3;
  private readonly MAX_AIRBORNE_FRAMES = 25;
  private readonly MIN_LANDING_FRAMES = 2;
  private readonly MIN_COUNT_INTERVAL = 6;
  private baselineFrameCounter = 0;

  processFrame(pose: Pose): void {
    this.debugFrameCount++;
    this.framesSinceLastCount++;

    // ── 1. 提取关键骨骼点 ──
    const leftShoulder = this.getKeypoint(pose, 'left_shoulder');
    const rightShoulder = this.getKeypoint(pose, 'right_shoulder');
    const leftHip = this.getKeypoint(pose, 'left_hip');
    const rightHip = this.getKeypoint(pose, 'right_hip');
    const leftAnkle = this.getKeypoint(pose, 'left_ankle');
    const rightAnkle = this.getKeypoint(pose, 'right_ankle');
    const leftWrist = this.getKeypoint(pose, 'left_wrist');
    const rightWrist = this.getKeypoint(pose, 'right_wrist');

    if (
      !leftShoulder ||
      !rightShoulder ||
      !leftHip ||
      !rightHip ||
      !leftAnkle ||
      !rightAnkle ||
      !leftWrist ||
      !rightWrist
    )
      return;
    if (
      (leftShoulder.score ?? 0) < 0.3 ||
      (rightShoulder.score ?? 0) < 0.3 ||
      (leftHip.score ?? 0) < 0.3 ||
      (rightHip.score ?? 0) < 0.3 ||
      (leftAnkle.score ?? 0) < 0.3 ||
      (rightAnkle.score ?? 0) < 0.3 ||
      (leftWrist.score ?? 0) < 0.3 ||
      (rightWrist.score ?? 0) < 0.3
    )
      return;

    // ── 2. 计算原始指标 ──
    const rawShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
    const rawHipY = (leftHip.y + rightHip.y) / 2;
    const rawAnkleY = (leftAnkle.y + rightAnkle.y) / 2;
    const rawLeftWristY = leftWrist.y;
    const rawRightWristY = rightWrist.y;

    const rawBodyCenterY = (rawShoulderY + rawHipY) / 2;
    const rawBodyHeight = Math.abs(rawAnkleY - rawBodyCenterY);

    // ── 3. 卡尔曼滤波 ──
    const smoothBodyY = this.kalman.update('bodyCenterY', rawBodyCenterY);
    const smoothAnkleY = this.kalman.update('ankleCenterY', rawAnkleY);
    const smoothBodyHeight = this.kalman.update('bodyHeight', rawBodyHeight);
    const smoothLeftWristY = this.kalman.update('leftWristY', rawLeftWristY);
    const smoothRightWristY = this.kalman.update('rightWristY', rawRightWristY);

    // ── 4. 垂直速度 ──
    let velocity = 0;
    if (this.prevBodyY !== null) {
      velocity = smoothBodyY - this.prevBodyY;
    }
    this.prevBodyY = smoothBodyY;

    // ── 5. 手腕旋转检测 ──
    this.leftWristWindow.push(smoothLeftWristY);
    this.rightWristWindow.push(smoothRightWristY);
    const leftWristAmp =
      this.leftWristWindow.length > 0
        ? this.leftWristWindow.getMax() - this.leftWristWindow.getMin()
        : 0;
    const rightWristAmp =
      this.rightWristWindow.length > 0
        ? this.rightWristWindow.getMax() - this.rightWristWindow.getMin()
        : 0;
    const wristAmplitude = Math.max(leftWristAmp, rightWristAmp);

    // ── 6. 校准阶段 ──
    this.calibrationFrames++;
    this.bodyBaselineWindow.push(smoothBodyY);
    this.ankleBaselineWindow.push(smoothAnkleY);

    if (this.calibrationFrames < this.CALIBRATION_REQUIRED) return;

    if (!this.calibrated) {
      this.calibrated = true;
      this.bodyBaseline = this.bodyBaselineWindow.getMedian();
      this.ankleBaseline = this.ankleBaselineWindow.getMedian();
      this.bodyHeight = smoothBodyHeight;
      this.takeoffThreshold = this.bodyHeight * this.TAKEOFF_BODY_RATIO;
      this.landThreshold = this.takeoffThreshold * 0.5;

      if (JumpRopeCounter.DEBUG) {
        console.log(
          `[JumpRope] 校准完成 — ` +
            `身高比例: ${this.bodyHeight.toFixed(4)}, ` +
            `身体基线: ${this.bodyBaseline.toFixed(4)}, ` +
            `离地阈值: ${this.takeoffThreshold.toFixed(4)}`,
        );
      }
    }

    // ── 7. 动态更新基线 ──
    if (this.state === JumpState.STANDING && this.framesSinceLastCount > this.MIN_COUNT_INTERVAL) {
      this.baselineFrameCounter++;
      if (this.baselineFrameCounter >= 10) {
        this.baselineFrameCounter = 0;
        this.bodyBaseline = this.bodyBaselineWindow.getMedian();
        this.ankleBaseline = this.ankleBaselineWindow.getMedian();
        this.bodyHeight = this.bodyHeight * 0.9 + smoothBodyHeight * 0.1;
        this.takeoffThreshold = this.bodyHeight * this.TAKEOFF_BODY_RATIO;
        this.landThreshold = this.takeoffThreshold * 0.5;
      }
    } else {
      this.baselineFrameCounter = 0;
    }
    // ── 8. 构建帧特征 ──
    const ankleLift = this.ankleBaseline - smoothAnkleY;
    const bodyLift = this.bodyBaseline - smoothBodyY;

    const features: FrameFeatures = {
      velocity,
      ankleLift: Math.max(0, ankleLift),
      bodyLift: Math.max(0, bodyLift),
      bodyHeight: this.bodyHeight,
      wristAmplitude,
    };

    // ── 9. 状态机驱动 ──
    this.runStateMachine(features);
  }

  private runStateMachine(f: FrameFeatures): void {
    switch (this.state) {
      case JumpState.STANDING:
        this.handleStanding(f);
        break;
      case JumpState.ASCENDING:
        this.handleAscending(f);
        break;
      case JumpState.AIRBORNE:
        this.handleAirborne(f);
        break;
      case JumpState.LANDING:
        this.handleLanding(f);
        break;
    }
    this.prevVelocity = f.velocity;
  }
  /**
   * STANDING → ASCENDING
   *
   * 手腕旋转辅助验证：手腕振幅 < WRIST_ACTIVE_THRESHOLD（无甩绳动作）时
   * 抬高离地阈值，防止原地蹦跳误计为跳绳。
   */
  private handleStanding(f: FrameFeatures): void {
    const wristActive = f.wristAmplitude >= this.WRIST_ACTIVE_THRESHOLD;
    const effectiveThreshold = wristActive
      ? this.takeoffThreshold
      : this.takeoffThreshold * this.WRIST_INACTIVE_LIFT_MULTIPLIER;

    if (f.ankleLift >= effectiveThreshold && f.velocity < -0.0005) {
      this.transitionTo(JumpState.ASCENDING);
      this.airborneFrames = 0;
      this.landingFrames = 0;
      this.debugLog(`STANDING → ASCENDING (手腕=${wristActive ? '活跃' : '不活跃'})`, f);
    }
  }

  private handleAscending(f: FrameFeatures): void {
    this.airborneFrames++;
    if (f.velocity > 0.0005 && this.prevVelocity <= 0) {
      this.transitionTo(JumpState.AIRBORNE);
      this.debugLog('ASCENDING → AIRBORNE', f);
    }
    if (this.airborneFrames > this.MAX_AIRBORNE_FRAMES) {
      this.transitionTo(JumpState.STANDING);
      this.debugLog('ASCENDING → STANDING (超时)', f);
    }
  }

  private handleAirborne(f: FrameFeatures): void {
    this.airborneFrames++;
    if (this.airborneFrames >= this.MAX_AIRBORNE_FRAMES) {
      this.transitionTo(JumpState.STANDING);
      this.debugLog('AIRBORNE → STANDING (滞空超时)', f);
      return;
    }
    if (f.ankleLift < this.landThreshold) {
      if (this.airborneFrames < this.MIN_AIRBORNE_FRAMES) {
        this.transitionTo(JumpState.STANDING);
        this.debugLog('AIRBORNE → STANDING (滞空太短)', f);
        return;
      }
      this.transitionTo(JumpState.LANDING);
      this.landingFrames = 0;
      this.debugLog('AIRBORNE → LANDING', f);
    }
  }

  private handleLanding(f: FrameFeatures): void {
    this.landingFrames++;
    this.airborneFrames++;

    if (f.ankleLift >= this.takeoffThreshold) {
      this.transitionTo(JumpState.AIRBORNE);
      this.debugLog('LANDING → AIRBORNE (二跳)', f);
      return;
    }
    if (this.landingFrames < this.MIN_LANDING_FRAMES) return;

    if (this.framesSinceLastCount >= this.MIN_COUNT_INTERVAL) {
      this.count++;
      this.framesSinceLastCount = 0;
      this.countTimestamps.push(performance.now());
      if (this.countTimestamps.length > this.MAX_RECENT_COUNTS) {
        this.countTimestamps.shift();
      }
      this.debugLog(`LANDING → STANDING ✅ 计数=${this.count}`, f);
    } else {
      this.debugLog('LANDING → STANDING (间隔太短，不计)', f);
    }
    this.transitionTo(JumpState.STANDING);
  }
  /**
   * 跳绳节奏检测反馈
   *
   * 根据最近几次计数的时间间隔估算速度（次/分钟）：
   * - 太快（> 200/min）：提醒放慢
   * - 太慢（< 40/min）：提醒加快
   * - 稳定（120-180/min）：正向鼓励
   */
  getFeedback(_pose: Pose): FormFeedback | null {
    if (this.countTimestamps.length < 3) return null;

    const intervals: number[] = [];
    for (let i = 1; i < this.countTimestamps.length; i++) {
      intervals.push(this.countTimestamps[i] - this.countTimestamps[i - 1]);
    }
    const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    if (avgInterval <= 0) return null;

    const bpm = Math.round(60000 / avgInterval);

    if (bpm > 200) {
      return { type: 'warning', message: '节奏太快，放慢一些' };
    }
    if (bpm < 40 && this.count > 3) {
      return { type: 'warning', message: '节奏太慢，加快速度' };
    }
    if (bpm >= 120 && bpm <= 180 && this.count >= 5) {
      return { type: 'success', message: '节奏稳定，保持！' };
    }
    return null;
  }

  private transitionTo(newState: JumpState): void {
    this.state = newState;
  }

  private debugLog(msg: string, f: FrameFeatures): void {
    if (!JumpRopeCounter.DEBUG) return;
    if (this.debugFrameCount % 30 === 0 || msg.includes('计数') || msg.includes('\u2705')) {
      console.log(
        `[JumpRope] [${this.debugFrameCount}] ${msg} | ` +
          `v=${f.velocity.toFixed(4)} lift=${f.ankleLift.toFixed(4)} ` +
          `wristAmp=${f.wristAmplitude.toFixed(4)} ` +
          `air=${this.airborneFrames} state=${this.state}`,
      );
    }
  }

  reset(): void {
    super.reset();
    this.kalman.reset();
    this.bodyBaselineWindow.reset();
    this.ankleBaselineWindow.reset();
    this.leftWristWindow.reset();
    this.rightWristWindow.reset();
    this.bodyBaseline = 0;
    this.ankleBaseline = 0;
    this.bodyHeight = 0;
    this.takeoffThreshold = 0;
    this.landThreshold = 0;
    this.state = JumpState.STANDING;
    this.airborneFrames = 0;
    this.landingFrames = 0;
    this.framesSinceLastCount = 0;
    this.calibrated = false;
    this.calibrationFrames = 0;
    this.prevBodyY = null;
    this.prevVelocity = 0;
    this.countTimestamps = [];
    this.debugFrameCount = 0;
    this.baselineFrameCounter = 0;
  }
}
