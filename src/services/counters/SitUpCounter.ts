/**
 * SitUpCounter — 桌面版仰卧起坐计数器
 *
 * 基于 RN 版 SitUpCounter V3 移植，适配桌面版 PoseDetectionService 接口。
 * 核心算法：肩-髋-膝三点躯干角度状态机 + Kalman 滤波 + 犯规检测
 */

import { Pose, FormFeedback } from '../../types';
import { ExerciseCounter } from '../ExerciseCounter';
import { KalmanFilter1D, SlidingWindow } from '../filters/KalmanFilter1D';

// ── 阶段 ──
type SitUpPhase = 'idle' | 'lying' | 'rising' | 'up' | 'returning' | 'done';

// ── 犯规类型 ──
type FoulType = 'hip_lift' | 'incomplete_up' | 'incomplete_down' | 'too_fast';

export class SitUpCounter extends ExerciseCounter {
  // ── 滤波器 ──
  private trunkAngleFilter = new KalmanFilter1D({ processNoise: 0.008, measurementNoise: 0.06 });
  private shoulderYFilter = new KalmanFilter1D({ processNoise: 0.01, measurementNoise: 0.08 });
  private hipYFilter = new KalmanFilter1D({ processNoise: 0.01, measurementNoise: 0.05 });

  // ── 历史窗口 ──
  private angleHistory = new SlidingWindow(20);
  private hipYHistory = new SlidingWindow(20);

  // ── 状态机 ──
  private phase: SitUpPhase = 'idle';
  private phaseFrameCount = 0;

  // ── 阈值 ──
  /** 仰卧躯干角最小值（度）：人体仰卧时肩-髋-膝三点角度 ≥ 此值视为"躺下"；
   *  参考《仰卧起坐运动生物力学分析》(体育科学, 2019)：仰卧起始位躯干角 150-170° */
  private readonly LYING_ANGLE_MIN = 140;
  /** 坐起躯干角最大值（度）：躯干角 ≤ 此值视为"完全坐起"；
   *  国家学生体质健康标准：仰卧起坐坐起位躯干角 < 90° */
  private readonly UP_ANGLE_MAX = 85;
  /** 确认躺下所需连续帧数（防止单帧噪声误判） */
  private readonly CONFIRM_FRAMES_LYING = 5;
  /** 确认坐起所需连续帧数 */
  private readonly CONFIRM_FRAMES_UP = 4;
  /** 从躺下进入起身的确认帧数（比完整躺下确认更短，减少响应延迟） */
  private readonly CONFIRM_FRAMES_LYING_TO_RISING = 3;
  /** 单次仰卧起坐最短帧数（约 400ms @30fps），防止高频抖动误计 */
  private readonly MIN_CYCLE_FRAMES = 12;
  /** 单次仰卧起坐最长帧数（约 3s @30fps），超时视为动作中断 */
  private readonly MAX_CYCLE_FRAMES = 90;

  // ── 臀部离垫检测 ──
  /** 髋关节 Y 位移阈值（归一化坐标）：超过此值视为臀部离垫犯规；
   *  基于人体比例 — 髋关节到踝关节距离的 ~3% */
  private readonly HIP_LIFT_THRESHOLD = 0.03;
  private baselineHipY = 0;
  private baselineAnkleY = 0;

  // ── 统计 ──
  private cycleStartFrame = 0;
  private totalFrames = 0;
  private foulCount = 0;
  private lastFoul: FoulType | null = null;
  private isInLyingBaseline = false;

  // ── 方向检测 ──
  private prevAngle = 180;
  private angleDirection: 'lying_back' | 'sitting_up' | 'stable' = 'stable';

  // ── 速度追踪 ──
  private recentCycles: number[] = [];
  private sessionStartTime = 0; // performance.now() of first frame, for framerate-adaptive rate

  // ── done 阶段冷却（替代 setTimeout）──
  private static readonly DONE_COOLDOWN_MS = 200;
  private get doneCooldownFrames(): number {
    return Math.max(1, Math.round(SitUpCounter.DONE_COOLDOWN_MS / this.frameIntervalMs));
  }

  reset(): void {
    super.reset();
    this.phase = 'idle';
    this.phaseFrameCount = 0;
    this.cycleStartFrame = 0;
    this.totalFrames = 0;
    this.foulCount = 0;
    this.lastFoul = null;
    this.isInLyingBaseline = false;
    this.prevAngle = 180;
    this.angleDirection = 'stable';
    this.recentCycles = [];
    this.baselineHipY = 0;
    this.baselineAnkleY = 0;
    this.trunkAngleFilter.reset();
    this.shoulderYFilter.reset();
    this.hipYFilter.reset();
    this.angleHistory.reset();
    this.hipYHistory.reset();
    this.sessionStartTime = 0;
  }

  processFrame(pose: Pose): void {
    this.totalFrames++;
    if (this.sessionStartTime === 0) this.sessionStartTime = performance.now();

    // ── 获取关键点 ──
    const leftShoulder = this.getKeypoint(pose, 'left_shoulder');
    const rightShoulder = this.getKeypoint(pose, 'right_shoulder');
    const leftHip = this.getKeypoint(pose, 'left_hip');
    const rightHip = this.getKeypoint(pose, 'right_hip');
    const leftKnee = this.getKeypoint(pose, 'left_knee');
    const rightKnee = this.getKeypoint(pose, 'right_knee');
    const leftAnkle = this.getKeypoint(pose, 'left_ankle');
    const rightAnkle = this.getKeypoint(pose, 'right_ankle');

    if (
      !leftShoulder ||
      !rightShoulder ||
      !leftHip ||
      !rightHip ||
      !leftKnee ||
      !rightKnee ||
      !leftAnkle ||
      !rightAnkle
    )
      return;

    const minScore = 0.3;
    if (
      (leftShoulder.score || 0) < minScore ||
      (rightShoulder.score || 0) < minScore ||
      (leftHip.score || 0) < minScore ||
      (rightHip.score || 0) < minScore ||
      (leftKnee.score || 0) < minScore ||
      (rightKnee.score || 0) < minScore ||
      (leftAnkle.score || 0) < minScore ||
      (rightAnkle.score || 0) < minScore
    )
      return;

    // ── 计算中值 ──
    const hipMidY = (leftHip.y + rightHip.y) / 2;
    const ankleMidY = (leftAnkle.y + rightAnkle.y) / 2;

    // ── 躯干角度：肩-髋-膝 ──
    const leftTrunkAngle = this.calculateAngle(pose, 'left_shoulder', 'left_hip', 'left_knee');
    const rightTrunkAngle = this.calculateAngle(pose, 'right_shoulder', 'right_hip', 'right_knee');

    if (leftTrunkAngle === null || rightTrunkAngle === null) return;

    const rawTrunkAngle = (leftTrunkAngle + rightTrunkAngle) / 2;

    // ── Kalman 滤波 ──
    const smoothAngle = this.trunkAngleFilter.update(rawTrunkAngle);
    const smoothHipY = this.hipYFilter.update(hipMidY);

    // ── 记录历史 ──
    this.angleHistory.push(smoothAngle);
    this.hipYHistory.push(smoothHipY);

    // ── 方向检测 ──
    this.detectDirection(smoothAngle);

    // ── 臀部离垫检测 ──
    this.detectHipLift(smoothHipY, ankleMidY);

    // ── 仰卧基线采集 ──
    if (this.phase === 'idle') {
      if (smoothAngle >= this.LYING_ANGLE_MIN) {
        this.baselineHipY = smoothHipY;
        this.baselineAnkleY = ankleMidY;
        this.isInLyingBaseline = true;
        this.phase = 'lying';
        this.lastState = 'lying';
        this.cycleStartFrame = this.totalFrames;
        this.prevAngle = smoothAngle;
      }
      return;
    }

    // ── 状态机驱动 ──
    this.phaseFrameCount++;

    switch (this.phase) {
      case 'lying':
        this.handleLying(smoothAngle, smoothHipY);
        break;
      case 'rising':
        this.handleRising(smoothAngle);
        break;
      case 'up':
        this.handleUp(smoothAngle);
        break;
      case 'returning':
        this.handleReturning(smoothAngle);
        break;
      case 'done':
        // 帧驱动冷却：替代原 setTimeout(200ms)
        if (this.phaseFrameCount >= this.doneCooldownFrames) {
          this.phase = 'lying';
          this.lastState = 'lying';
          this.phaseFrameCount = 0;
          this.cycleStartFrame = this.totalFrames;
        }
        break;
    }
  }

  private handleLying(angle: number, _hipY: number): void {
    if (angle < this.LYING_ANGLE_MIN - 20) {
      if (this.phaseFrameCount >= this.CONFIRM_FRAMES_LYING_TO_RISING) {
        this.transitionTo('rising');
      }
    } else {
      // 角度回到正常范围，重置等待计数（防误触发核心逻辑）
      // 不重置 phaseFrameCount 本身——它仍用于 returning 阶段
    }
    if (angle >= this.LYING_ANGLE_MIN && this.hipYHistory.length >= 5) {
      this.baselineHipY = this.hipYHistory.getMean();
    }
  }

  private handleRising(angle: number): void {
    if (angle <= this.UP_ANGLE_MAX) {
      if (this.phaseFrameCount >= this.CONFIRM_FRAMES_UP) {
        this.transitionTo('up');
      }
    }
    if (this.angleDirection === 'lying_back' && this.phaseFrameCount > 3) {
      if (angle > this.prevAngle + 15) {
        this.transitionTo('lying');
        this.cycleStartFrame = this.totalFrames;
      }
    }
    this.prevAngle = angle;
  }

  private handleUp(angle: number): void {
    if (angle > this.UP_ANGLE_MAX + 15) {
      this.transitionTo('returning');
    }
    this.prevAngle = angle;
  }

  private handleReturning(angle: number): void {
    if (angle >= this.LYING_ANGLE_MIN) {
      if (this.phaseFrameCount >= this.CONFIRM_FRAMES_LYING) {
        this.recordValidSitUp();
        this.transitionTo('done');
        // done 阶段的冷却由 switch case 'done' 帧驱动处理
      }
    }
    if (angle < this.UP_ANGLE_MAX && this.phaseFrameCount > 5) {
      this.transitionTo('up');
    }
    this.prevAngle = angle;
  }

  private transitionTo(newPhase: SitUpPhase): void {
    this.phase = newPhase;
    this.phaseFrameCount = 0;
    this.lastState = newPhase;
  }

  private recordValidSitUp(): void {
    const cycleFrames = this.totalFrames - this.cycleStartFrame;

    if (this.lastFoul === 'hip_lift') {
      this.foulCount++;
      return;
    }

    if (cycleFrames < this.MIN_CYCLE_FRAMES) {
      this.lastFoul = 'too_fast';
      this.foulCount++;
      return;
    }

    if (cycleFrames > this.MAX_CYCLE_FRAMES) {
      this.lastFoul = 'incomplete_up';
      this.foulCount++;
      return;
    }

    this.count++;
    this.recentCycles.push(cycleFrames);
    if (this.recentCycles.length > 10) this.recentCycles.shift();

    this.lastFoul = null;
    this.cycleStartFrame = this.totalFrames;
  }

  private detectDirection(angle: number): void {
    if (this.angleHistory.length < 3) return;
    // O(1) 访问，避免每帧分配新数组
    const diff = angle - this.angleHistory.getAt(this.angleHistory.length - 3);
    if (diff > 3) {
      this.angleDirection = 'lying_back';
    } else if (diff < -3) {
      this.angleDirection = 'sitting_up';
    } else {
      this.angleDirection = 'stable';
    }
  }

  private detectHipLift(hipY: number, ankleY: number): void {
    if (!this.isInLyingBaseline || this.baselineHipY === 0) return;
    const currentHipAnkleDist = ankleY - hipY;
    const baselineHipAnkleDist = this.baselineAnkleY - this.baselineHipY;
    if (baselineHipAnkleDist > 0) {
      // 坐标系 y 向下增大：臀部上抬（离垫）→ hipY 减小 → currentHipAnkleDist(=ankleY-hipY) 增大
      // 故 liftRatio = (current - baseline)/baseline，上抬时为正值触发犯规阈值
      const liftRatio = (currentHipAnkleDist - baselineHipAnkleDist) / baselineHipAnkleDist;
      if (liftRatio > this.HIP_LIFT_THRESHOLD) {
        this.lastFoul = 'hip_lift';
      }
    }
  }

  getFeedback(_pose?: Pose): FormFeedback | null {
    switch (this.phase) {
      case 'idle':
        return { type: 'warning', message: '请躺到垫子上，开始检测...' };
      case 'lying':
        return null;
      case 'rising':
        if (this.phaseFrameCount > 20) {
          return { type: 'warning', message: '加快起身速度' };
        }
        return null;
      case 'up':
        if (this.lastFoul === 'hip_lift') {
          return { type: 'error', message: '臀部不要离垫！' };
        }
        return { type: 'success', message: '到位！' };
      case 'returning':
        return null;
      case 'done': {
        if (this.lastFoul === 'too_fast') {
          return { type: 'error', message: '动作太快，不计入' };
        }
        if (this.lastFoul === 'hip_lift') {
          return { type: 'error', message: '臀部离垫，本次不计' };
        }
        const elapsedMs = this.sessionStartTime > 0 ? performance.now() - this.sessionStartTime : 0;
        const elapsedMinutes = elapsedMs / 60000;
        const rate =
          elapsedMinutes > 0 && this.count > 0 ? Math.round(this.count / elapsedMinutes) : 0;
        return {
          type: 'success',
          message: rate > 0 ? `${this.count} 次 (${rate}/分钟)` : `${this.count} 次`,
        };
      }
      default:
        return null;
    }
  }
}
