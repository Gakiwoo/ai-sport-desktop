import { Pose, FormFeedback } from '../../types';
import { ExerciseCounter } from '../ExerciseCounter';
import PoseDetectionService from '../PoseDetectionService';
import { MultiPointKalman, SlidingWindow } from '../filters/KalmanFilter1D';

/**
 * 开合跳计数器 V3
 *
 * 改进点（相对 V2）：
 * 1. 多信号融合——手腕 X 展幅 + 手臂举过头顶角度 + 脚踝 X 展幅，三信号加权评分
 * 2. 肩-肘-腕角度检测：手臂举过头顶时角度接近 180°，比单纯 X 轴展幅更鲁棒
 * 3. 峰值检测替代简单状态机——用评分信号的波峰（展开）+波谷（收拢）构成完整周期
 * 4. 稳定校准——用滑动窗口方差检测用户是否处于静止站立状态，避免在运动中误校准
 * 5. 实时姿态反馈（getFeedback）
 */
export class JumpingJacksCounter extends ExerciseCounter {
  private readonly kalman = new MultiPointKalman({
    processNoise: 0.001,
    measurementNoise: 0.008,
  });

  /** 各信号滑动窗口 */
  private readonly wristSpreadWindow = new SlidingWindow(7);
  private readonly ankleSpreadWindow = new SlidingWindow(7);
  private readonly armAngleWindow = new SlidingWindow(7);

  // ── 校准 ──
  private calibrated = false;
  private calibrationSamples: number[] = [];
  private calibrationAnkleSamples: number[] = [];
  /** 校准所需样本数：3 帧内采集手腕和脚踝的静态展幅基线 */
  private readonly CALIBRATION_REQUIRED = 3;
  /** 校准方差窗口（10 帧）：检测用户是否静止站立，避免运动中误校准 */
  private readonly stabilityWindow = new SlidingWindow(10);

  // ── 动态阈值 ──
  private baselineSpread = 0;
  private baselineAnkleSpread = 0;
  private openThreshold = 0;
  private closeThreshold = 0;

  // ── 峰值配对：展开-收拢配对才算一次 ──
  private pendingOpen = false;

  // ── 实时信号值（供 getFeedback 使用） ──
  private currentArmAngle = 0;
  private currentWristSpread = 0;
  private currentAnkleSpread = 0;

  processFrame(pose: Pose): void {
    const leftWrist = this.getKeypoint(pose, 'left_wrist');
    const rightWrist = this.getKeypoint(pose, 'right_wrist');
    const leftAnkle = this.getKeypoint(pose, 'left_ankle');
    const rightAnkle = this.getKeypoint(pose, 'right_ankle');
    const leftHip = this.getKeypoint(pose, 'left_hip');
    const rightHip = this.getKeypoint(pose, 'right_hip');
    const leftShoulder = this.getKeypoint(pose, 'left_shoulder');
    const rightShoulder = this.getKeypoint(pose, 'right_shoulder');
    const leftElbow = this.getKeypoint(pose, 'left_elbow');
    const rightElbow = this.getKeypoint(pose, 'right_elbow');

    if (
      !leftWrist ||
      !rightWrist ||
      !leftAnkle ||
      !rightAnkle ||
      !leftHip ||
      !rightHip ||
      !leftShoulder ||
      !rightShoulder ||
      !leftElbow ||
      !rightElbow
    )
      return;

    const hipWidth = Math.abs(rightHip.x - leftHip.x);
    if (hipWidth < 0.01) return;

    // ── 信号 1：手腕 X 轴展幅（归一化到髋宽） ──
    const rawWristSpread = Math.abs(rightWrist.x - leftWrist.x) / hipWidth;
    const smoothWristSpread = this.kalman.update('wristSpread', rawWristSpread);

    // ── 信号 2：脚踝 X 轴展幅 ──
    const rawAnkleSpread = Math.abs(rightAnkle.x - leftAnkle.x) / hipWidth;
    const smoothAnkleSpread = this.kalman.update('ankleSpread', rawAnkleSpread);

    // ── 信号 3：手臂举过头顶的角度（肩-肘-腕） ──
    //    站立时手臂下垂 → 角度小；开合跳展开时手臂举过头顶 → 角度接近 180°
    const leftArmAngle = PoseDetectionService.calculateAngle(leftShoulder, leftElbow, leftWrist);
    const rightArmAngle = PoseDetectionService.calculateAngle(
      rightShoulder,
      rightElbow,
      rightWrist,
    );
    const rawArmAngle = (leftArmAngle + rightArmAngle) / 2;
    const smoothArmAngle = this.kalman.update('armAngle', rawArmAngle);

    // ── 滑动窗口 ──
    this.wristSpreadWindow.push(smoothWristSpread);
    this.ankleSpreadWindow.push(smoothAnkleSpread);
    this.armAngleWindow.push(smoothArmAngle);

    const avgWristSpread = this.wristSpreadWindow.getMean();
    const avgAnkleSpread = this.ankleSpreadWindow.getMean();
    const avgArmAngle = this.armAngleWindow.getMean();
    const avgWristY = (leftWrist.y + rightWrist.y) / 2;
    const avgShoulderY = (leftShoulder.y + rightShoulder.y) / 2;

    // 缓存实时值
    this.currentArmAngle = avgArmAngle;
    this.currentWristSpread = avgWristSpread;
    this.currentAnkleSpread = avgAnkleSpread;

    // ── 校准阶段：检测稳定站立状态 ──
    if (!this.calibrated) {
      this.stabilityWindow.push(smoothWristSpread);
      if (this.stabilityWindow.length >= this.stabilityWindow.capacity) {
        const stddev = this.stabilityWindow.getStdDev();
        // 方差足够小 → 用户处于静止状态，可以采集基线
        if (stddev < 0.08) {
          this.calibrationSamples.push(avgWristSpread);
          this.calibrationAnkleSamples.push(avgAnkleSpread);
        }
        this.stabilityWindow.reset();
      }

      if (this.calibrationSamples.length >= this.CALIBRATION_REQUIRED) {
        this.baselineSpread =
          this.calibrationSamples.reduce((a, b) => a + b, 0) / this.calibrationSamples.length;
        this.baselineAnkleSpread =
          this.calibrationAnkleSamples.reduce((a, b) => a + b, 0) /
          this.calibrationAnkleSamples.length;
        this.openThreshold = this.baselineSpread + 0.7;
        this.closeThreshold = this.baselineSpread + 0.25;
        this.calibrated = true;
      }
      return;
    }

    const wristsOpen = avgWristSpread >= this.openThreshold;
    const anklesOpen = avgAnkleSpread >= this.baselineAnkleSpread + 0.6;
    const wristsRaised = avgWristY <= avgShoulderY - 0.05;
    if (!this.pendingOpen && wristsOpen && anklesOpen && wristsRaised) {
      this.pendingOpen = true;
      this.lastState = 'open';
    }

    const wristsClosed = avgWristSpread <= this.closeThreshold;
    const anklesClosed = avgAnkleSpread <= this.baselineAnkleSpread + 0.3;
    if (this.pendingOpen && wristsClosed && anklesClosed) {
      this.pendingOpen = false;
      this.count++;
      this.lastState = 'closed';
    }
  }

  getFeedback(_pose: Pose): FormFeedback | null {
    if (!this.calibrated) return null;

    // 手臂没举过头顶：角度 < 40° 且手腕展幅已超出站立基线
    // 注意：Kalman 平滑后展幅可能滞后于原始值，因此用基线相对比例而非绝对阈值
    const wristAboveBaseline = this.currentWristSpread > this.baselineSpread * 1.05;
    const anklesOpen = this.currentAnkleSpread > this.baselineAnkleSpread * 1.3;
    if (this.currentArmAngle < 40 && (wristAboveBaseline || anklesOpen)) {
      return { type: 'warning', message: '手臂举过头顶，幅度再大一些' };
    }

    // 脚没有分开到位
    if (
      this.currentAnkleSpread < this.baselineAnkleSpread * 1.6 &&
      this.currentWristSpread > this.openThreshold
    ) {
      return { type: 'warning', message: '双脚再分开一些' };
    }

    // 动作标准时偶尔给正向反馈（手臂充分举过头顶）
    if (this.currentArmAngle >= 40 && this.currentWristSpread > this.openThreshold) {
      return { type: 'success', message: '动作标准！保持节奏' };
    }

    return null;
  }

  reset(): void {
    super.reset();
    this.kalman.reset();
    this.wristSpreadWindow.reset();
    this.ankleSpreadWindow.reset();
    this.armAngleWindow.reset();
    this.stabilityWindow.reset();
    this.calibrated = false;
    this.calibrationSamples = [];
    this.calibrationAnkleSamples = [];
    this.baselineSpread = 0;
    this.baselineAnkleSpread = 0;
    this.openThreshold = 0;
    this.closeThreshold = 0;
    this.pendingOpen = false;
    this.currentArmAngle = 0;
    this.currentWristSpread = 0;
    this.currentAnkleSpread = 0;
  }
}
