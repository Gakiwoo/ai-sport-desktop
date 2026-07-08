/**
 * 设备性能检测与自适应帧率控制
 *
 * 通过实测 WASM 推理耗时判断设备性能档位，动态调整帧处理策略：
 * - high（快）：每帧处理，~25-35ms 推理
 * - balanced（中等）：每帧处理，~35-60ms 推理
 * - constrained（慢）：隔帧处理，>60ms 推理
 *
 * 与 Mobile 端 adaptivePoseRuntime 思路一致，但 Desktop 通过 rAF 驱动。
 */
export type DevicePerformanceTier = 'high' | 'balanced' | 'constrained';

interface FrameSample {
  elapsedMs: number;
  timestamp: number;
}

class PerformanceMonitor {
  private samples: FrameSample[] = [];
  private readonly maxSamples = 30;
  private tier: DevicePerformanceTier = 'balanced';
  private skipFrames = 0; // 当前跳帧数（0=每帧处理，1=隔一帧处理）
  private frameCounter = 0;

  /**
   * 记录一帧的推理耗时
   */
  recordFrame(elapsedMs: number): void {
    this.samples.push({ elapsedMs, timestamp: Date.now() });
    if (this.samples.length > this.maxSamples) {
      this.samples.shift();
    }
    this.recalibrate();
  }

  /**
   * 返回当前帧是否应当被处理（跳帧策略）
   */
  shouldProcessFrame(): boolean {
    this.frameCounter++;
    if (this.frameCounter <= this.skipFrames) {
      return false;
    }
    this.frameCounter = 0;
    return true;
  }

  /**
   * 当前设备性能档位
   */
  getTier(): DevicePerformanceTier {
    return this.tier;
  }

  /**
   * 平均推理耗时（ms），用于统计与调试
   */
  getAverageElapsed(): number {
    if (this.samples.length === 0) return 0;
    const sum = this.samples.reduce((s, v) => s + v.elapsedMs, 0);
    return Math.round(sum / this.samples.length);
  }

  /**
   * 最新一帧的推理耗时（ms），用于实时监控
   */
  getLastElapsed(): number {
    return this.samples.length > 0 ? this.samples[this.samples.length - 1].elapsedMs : 0;
  }

  /**
   * 重置所有统计数据
   */
  reset(): void {
    this.samples = [];
    this.tier = 'balanced';
    this.skipFrames = 0;
    this.frameCounter = 0;
  }

  /**
   * 根据最近帧的推理耗时重新评估设备档位
   */
  private recalibrate(): void {
    if (this.samples.length < 5) return; // 需要足够样本

    const avg = this.getAverageElapsed();

    let newTier: DevicePerformanceTier;
    let newSkipFrames: number;

    if (avg <= 40) {
      newTier = 'high';
      newSkipFrames = 0; // 每帧都处理
    } else if (avg <= 70) {
      newTier = 'balanced';
      newSkipFrames = 1; // 每 2 帧处理 1 帧 ≈ 12-15 fps 有效处理率
    } else {
      newTier = 'constrained';
      newSkipFrames = 2; // 每 3 帧处理 1 帧 ≈ 8-10 fps 有效处理率
    }

    // 档位变化时输出日志
    if (newTier !== this.tier) {
      console.warn(
        `[PerfMonitor] 设备档位变更: ${this.tier} → ${newTier} (avg=${avg}ms, skip=${newSkipFrames})`,
      );
    }

    this.tier = newTier;
    this.skipFrames = newSkipFrames;
  }
}

/** 全局单例 */
export const performanceMonitor = new PerformanceMonitor();
