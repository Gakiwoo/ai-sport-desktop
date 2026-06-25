/**
 * 1D 卡尔曼滤波器
 *
 * 对 MediaPipe 输出的关键点单个坐标轴进行平滑去噪。
 * 论文验证：跳绳计数正确率从不加滤波的 67.5% 提升至 95%
 */
export class KalmanFilter1D {
  /** 过程噪声 Q —— 模型自身不确定性 */
  private q: number;
  /** 观测噪声 R —— MediaPipe 输出抖动程度 */
  private r: number;
  /** 状态估计值 */
  private x = 0;
  /** 估计误差协方差 */
  private p = 1;
  /** 是否已初始化 */
  private initialized = false;

  constructor(options?: { processNoise?: number; measurementNoise?: number }) {
    this.q = options?.processNoise ?? 0.001;
    this.r = options?.measurementNoise ?? 0.01;
  }

  /**
   * 输入新的观测值，返回滤波后的估计值
   */
  update(measurement: number): number {
    if (!this.initialized) {
      this.x = measurement;
      this.p = 1;
      this.initialized = true;
      return this.x;
    }

    // 预测步骤
    const pPred = this.p + this.q;

    // 更新步骤
    const k = pPred / (pPred + this.r); // 卡尔曼增益
    this.x = this.x + k * (measurement - this.x);
    this.p = (1 - k) * pPred;

    return this.x;
  }

  /** 重置滤波器状态 */
  reset(): void {
    this.x = 0;
    this.p = 1;
    this.initialized = false;
  }
}

/**
 * 多点卡尔曼滤波器
 *
 * 对一个关键点的 (x, y) 坐标同时滤波，
 * 或对多个关键点的同一轴做独立滤波。
 */
export class MultiPointKalman {
  private filters: Map<string, KalmanFilter1D> = new Map();
  private readonly options?: { processNoise?: number; measurementNoise?: number };

  constructor(options?: { processNoise?: number; measurementNoise?: number }) {
    this.options = options;
  }

  /**
   * 对指定 key 的值做卡尔曼滤波
   * @param key  例如 "left_hip.y" 或 "bodyCenter"
   * @param value 原始观测值
   */
  update(key: string, value: number): number {
    let filter = this.filters.get(key);
    if (!filter) {
      filter = new KalmanFilter1D(this.options);
      this.filters.set(key, filter);
    }
    return filter.update(value);
  }

  /** 重置所有滤波器 */
  reset(): void {
    this.filters.clear();
  }
}

/**
 * 滑动窗口统计（环形缓冲区实现）
 *
 * push() 为 O(1)（对比 Array.shift() 的 O(n)），
 * getMean() 为 O(1)（维护运行和），
 * 其余统计方法 O(n)——仅在需要时调用。
 */
export class SlidingWindow {
  private buf: Float64Array;
  private head = 0; // 最旧元素的索引
  private count = 0; // 当前元素数量
  private sum = 0; // 运行和，O(1) getMean
  private readonly maxSize: number;

  constructor(size: number) {
    this.maxSize = size;
    this.buf = new Float64Array(size);
  }

  /** 推入新值，O(1) */
  push(value: number): void {
    if (this.count < this.maxSize) {
      // 窗口未满：追加到 (head + count) % maxSize
      this.buf[(this.head + this.count) % this.maxSize] = value;
      this.sum += value;
      this.count++;
    } else {
      // 窗口已满：覆盖最旧元素，推进 head
      this.sum -= this.buf[this.head];
      this.buf[this.head] = value;
      this.sum += value;
      this.head = (this.head + 1) % this.maxSize;
    }
  }

  /** 获取窗口内均值，O(1) */
  getMean(): number {
    if (this.count === 0) return 0;
    return this.sum / this.count;
  }

  /** 获取窗口内中值（更抗离群值） */
  getMedian(): number {
    if (this.count === 0) return 0;
    const sorted = this.getValues().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /** 获取窗口内标准差 */
  getStdDev(): number {
    if (this.count < 2) return 0;
    const mean = this.getMean();
    let varianceSum = 0;
    for (let i = 0; i < this.count; i++) {
      const v = this.buf[(this.head + i) % this.maxSize];
      varianceSum += (v - mean) ** 2;
    }
    return Math.sqrt(varianceSum / this.count);
  }

  /** 获取窗口内最小值 */
  getMin(): number {
    if (this.count === 0) return Infinity;
    let min = this.buf[this.head];
    for (let i = 1; i < this.count; i++) {
      const v = this.buf[(this.head + i) % this.maxSize];
      if (v < min) min = v;
    }
    return min;
  }

  /** 获取窗口内最大值 */
  getMax(): number {
    if (this.count === 0) return -Infinity;
    let max = this.buf[this.head];
    for (let i = 1; i < this.count; i++) {
      const v = this.buf[(this.head + i) % this.maxSize];
      if (v > max) max = v;
    }
    return max;
  }

  /** 当前窗口长度 */
  get length(): number {
    return this.count;
  }

  /** 最大窗口大小 */
  get capacity(): number {
    return this.maxSize;
  }

  /** 是否窗口已满 */
  get isFull(): boolean {
    return this.count >= this.maxSize;
  }

  /** 获取原始缓冲数据（按逻辑顺序：最旧→最新） */
  get data(): readonly number[] {
    return this.getValues();
  }

  /** O(1) 按逻辑索引访问单个元素（0 = 最旧, count-1 = 最新），不分配数组 */
  getAt(logicalIndex: number): number {
    if (logicalIndex < 0 || logicalIndex >= this.count) return 0;
    return this.buf[(this.head + logicalIndex) % this.maxSize];
  }

  /** 清空窗口 */
  reset(): void {
    this.head = 0;
    this.count = 0;
    this.sum = 0;
  }

  /** 内部辅助：按逻辑顺序提取所有值 */
  private getValues(): number[] {
    const result = new Array(this.count);
    for (let i = 0; i < this.count; i++) {
      result[i] = this.buf[(this.head + i) % this.maxSize];
    }
    return result;
  }
}

/**
 * 峰值检测器
 *
 * 在滑动窗口中检测局部极值（波峰/波谷），
 * 用于跳跃类运动的计数——每次检测到一次完整的「起跳-落地」周期即计一次。
 */
export class PeakDetector {
  /** 局部极值检测的邻域半径（左右各 N 帧） */
  private readonly neighborRadius: number;
  /** 最小峰值间距（帧数），防抖 */
  private readonly minPeakDistance: number;
  /** 最小峰值高度（相对基线的偏移量） */
  private readonly minPeakHeight: number;

  private lastPeakFrame = -Infinity;
  private frameCount = 0;

  constructor(
    options: {
      neighborRadius?: number;
      minPeakDistance?: number;
      minPeakHeight?: number;
    } = {},
  ) {
    this.neighborRadius = options.neighborRadius ?? 2;
    this.minPeakDistance = options.minPeakDistance ?? 8;
    this.minPeakHeight = options.minPeakHeight ?? 0.02;
  }

  /**
   * 在窗口数据中检测峰值
   * @param windowData 滑动窗口数据（已滤波）
   * @param direction 'min' 检测波谷（跳跃最高点=Y最小），'max' 检测波峰
   * @param externalBaseline 可选的外部基线值（如 baselineWindow 中值），优先于窗口边缘
   * @returns 是否检测到新的峰值
   */
  detect(
    windowData: readonly number[],
    direction: 'min' | 'max' = 'min',
    externalBaseline?: number,
  ): boolean {
    this.frameCount++;

    const len = windowData.length;
    const mid = Math.floor(len / 2);
    if (mid < this.neighborRadius || mid >= len - this.neighborRadius) return false;

    const midVal = windowData[mid];

    // 检查是否为局部极值
    let isExtreme = true;
    for (let i = mid - this.neighborRadius; i <= mid + this.neighborRadius; i++) {
      if (i === mid) continue;
      if (direction === 'min' && windowData[i] <= midVal) isExtreme = false;
      if (direction === 'max' && windowData[i] >= midVal) isExtreme = false;
    }

    if (!isExtreme) return false;

    // 峰值高度检查：优先使用外部基线，否则回退到窗口边缘值
    const baseline =
      externalBaseline !== undefined
        ? externalBaseline
        : direction === 'min'
          ? Math.max(windowData[0], windowData[len - 1])
          : Math.min(windowData[0], windowData[len - 1]);
    const height = Math.abs(midVal - baseline);
    if (height < this.minPeakHeight) return false;

    // 最小间距检查（防抖）
    if (this.frameCount - this.lastPeakFrame < this.minPeakDistance) return false;

    this.lastPeakFrame = this.frameCount;
    return true;
  }

  /** 重置状态 */
  reset(): void {
    this.lastPeakFrame = -Infinity;
    this.frameCount = 0;
  }
}
