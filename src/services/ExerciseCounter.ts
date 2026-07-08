import { Pose, FormFeedback } from '../types';
import PoseDetectionService from './PoseDetectionService';

export abstract class ExerciseCounter {
  protected count = 0;
  protected lastState: string = 'neutral';

  /**
   * 当前实际帧间隔（ms）。
   *
   * Desktop 端通过 CameraView rAF + PerformanceMonitor 动态调整，
   * 默认值 33ms 对应 ~30fps。子类可使用此值将「固定帧数」阈值
   * 转换为真实时间阈值，消除对固定 30fps 的假设。
   *
   * @example
   *   // 替代: DONE_COOLDOWN_FRAMES = 6 // ~200ms @30fps
   *   const cooldownFrames = Math.round(200 / this.frameIntervalMs);
   */
  protected frameIntervalMs = 33;

  abstract processFrame(pose: Pose): void;

  // 子类可选择实现姿态反馈（内聚到每个运动）
  getFeedback(_pose: Pose): FormFeedback | null {
    return null;
  }

  getCount(): number {
    return this.count;
  }

  /**
   * 获取当前动作阶段。与 Mobile 基类接口对齐，便于跨端 golden 框架复用。
   */
  getPhase(): string {
    return this.lastState;
  }

  /**
   * 获取当前帧间隔（ms），供外部监控使用。
   * 替代直接读取 protected frameIntervalMs，避免脆性耦合。
   */
  getFrameInterval(): number {
    return this.frameIntervalMs;
  }

  /**
   * 设置实际帧间隔（ms）。CameraView/rAF 回路在运行时通过此方法
   * 将测量到的帧间隔传递给计数器，子类可据此动态调整帧计数阈值。
   *
   * 入参 ≤0 时重置为默认值 33ms（~30fps）。
   */
  setFrameInterval(ms: number): void {
    this.frameIntervalMs = ms > 0 ? ms : 33;
  }

  reset(): void {
    this.count = 0;
    this.lastState = 'neutral';
    this.frameIntervalMs = 33;
  }

  protected getKeypoint(pose: Pose, name: string) {
    return PoseDetectionService.getKeypoint(pose, name);
  }

  protected calculateAngle(pose: Pose, a: string, b: string, c: string): number | null {
    const kpA = this.getKeypoint(pose, a);
    const kpB = this.getKeypoint(pose, b);
    const kpC = this.getKeypoint(pose, c);

    if (!kpA || !kpB || !kpC) return null;
    if ((kpA.score || 0) < 0.3 || (kpB.score || 0) < 0.3 || (kpC.score || 0) < 0.3) return null;

    return PoseDetectionService.calculateAngle(kpA, kpB, kpC);
  }
}
