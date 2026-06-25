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
