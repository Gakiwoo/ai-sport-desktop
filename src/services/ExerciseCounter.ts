import { Pose, FormFeedback } from '../types';
import PoseDetectionService from './PoseDetectionService';

export abstract class ExerciseCounter {
  protected count = 0;
  protected lastState: string = 'neutral';

  abstract processFrame(pose: Pose): void;

  // 子类可选择实现姿态反馈（内聚到每个运动）
  getFeedback(_pose: Pose): FormFeedback | null {
    return null;
  }

  getCount(): number {
    return this.count;
  }

  /**
   * 获取当前动作阶段。Desktop 计数器目前未在 processFrame 中上报阶段，
   * 默认返回基类初值；golden runner 在 Desktop 侧对 phase 断言做兼容跳过。
   * 与 Mobile 基类接口对齐，便于跨端 golden 框架复用。
   */
  getPhase(): string {
    return this.lastState;
  }

  /**
   * 设置实际帧间隔（ms）。Desktop 计数器基于帧计数驱动，不依赖真实帧间隔，
   * 此处仅保留接口以对齐 Mobile golden runner；子类可重写以影响速率计算。
   */
  setFrameInterval(_ms: number): void {}

  reset(): void {
    this.count = 0;
    this.lastState = 'neutral';
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
