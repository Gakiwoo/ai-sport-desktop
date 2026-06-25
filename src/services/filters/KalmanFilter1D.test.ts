import { describe, it, expect } from 'vitest';
import { KalmanFilter1D, MultiPointKalman, SlidingWindow, PeakDetector } from './KalmanFilter1D';

// ────────────────────────────────────────────
// KalmanFilter1D
// ────────────────────────────────────────────
describe('KalmanFilter1D', () => {
  it('首次 update 返回初始观测值', () => {
    const kf = new KalmanFilter1D();
    expect(kf.update(42)).toBe(42);
  });

  it('连续 update 平滑趋近真实值', () => {
    const kf = new KalmanFilter1D({ processNoise: 0.001, measurementNoise: 0.1 });
    kf.update(10);
    kf.update(12);
    const est = kf.update(11);
    // 滤波值应在 10~12 之间
    expect(est).toBeGreaterThan(10);
    expect(est).toBeLessThan(12);
  });

  it('高测量噪声下更信任历史值（更平滑）', () => {
    const kfSmooth = new KalmanFilter1D({ processNoise: 0.001, measurementNoise: 10 });
    kfSmooth.update(100);
    kfSmooth.update(200);
    const smoothEst = kfSmooth.update(200);

    const kfFast = new KalmanFilter1D({ processNoise: 0.001, measurementNoise: 0.01 });
    kfFast.update(100);
    const fastEst = kfFast.update(200);

    // 高噪声滤波器应更保守（离初始值更近）
    expect(smoothEst).toBeLessThan(fastEst);
  });

  it('reset 清除状态', () => {
    const kf = new KalmanFilter1D();
    kf.update(50);
    kf.reset();
    // reset 后第一次 update 应返回新观测值
    expect(kf.update(99)).toBe(99);
  });

  it('对常数信号快速收敛', () => {
    const kf = new KalmanFilter1D({ processNoise: 0.001, measurementNoise: 0.5 });
    let lastEst = 0;
    for (let i = 0; i < 50; i++) {
      lastEst = kf.update(5.0);
    }
    expect(Math.abs(lastEst - 5.0)).toBeLessThan(0.01);
  });

  it('对含噪声信号有效平滑', () => {
    const kf = new KalmanFilter1D({ processNoise: 0.01, measurementNoise: 1 });
    const rawValues: number[] = [];
    const filteredValues: number[] = [];

    for (let i = 0; i < 100; i++) {
      const raw = 50 + (Math.random() - 0.5) * 10; // 50 ± 5 噪声
      rawValues.push(raw);
      filteredValues.push(kf.update(raw));
    }

    // 计算方差：滤波后应比原始信号方差更小
    const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const variance = (arr: number[]) => {
      const m = mean(arr);
      return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
    };

    expect(variance(filteredValues)).toBeLessThan(variance(rawValues));
  });
});

// ────────────────────────────────────────────
// MultiPointKalman
// ────────────────────────────────────────────
describe('MultiPointKalman', () => {
  it('不同 key 独立滤波', () => {
    const mpk = new MultiPointKalman({ processNoise: 0.001, measurementNoise: 0.1 });
    const hipEst = mpk.update('hip.y', 100);
    const kneeEst = mpk.update('knee.y', 200);
    // 各自独立，首次 update 返回观测值
    expect(hipEst).toBeCloseTo(100, 0);
    expect(kneeEst).toBeCloseTo(200, 0);
  });

  it('reset 清除所有滤波器', () => {
    const mpk = new MultiPointKalman();
    mpk.update('a', 10);
    mpk.update('b', 20);
    mpk.reset();
    // reset 后 update 应返回新观测值（滤波器已重建）
    expect(mpk.update('a', 99)).toBe(99);
    expect(mpk.update('b', 88)).toBe(88);
  });

  it('同一 key 连续 update 平滑', () => {
    const mpk = new MultiPointKalman({ processNoise: 0.001, measurementNoise: 1 });
    mpk.update('x', 10);
    const est = mpk.update('x', 20);
    expect(est).toBeGreaterThan(10);
    expect(est).toBeLessThan(20);
  });
});

// ────────────────────────────────────────────
// SlidingWindow
// ────────────────────────────────────────────
describe('SlidingWindow', () => {
  it('空窗口返回 0', () => {
    const sw = new SlidingWindow(5);
    expect(sw.getMean()).toBe(0);
    expect(sw.getMedian()).toBe(0);
    expect(sw.getStdDev()).toBe(0);
    expect(sw.length).toBe(0);
    expect(sw.isFull).toBe(false);
  });

  it('push 不超过窗口容量', () => {
    const sw = new SlidingWindow(3);
    sw.push(1);
    sw.push(2);
    sw.push(3);
    sw.push(4); // 溢出，1 被移除
    expect(sw.length).toBe(3);
    expect(sw.isFull).toBe(true);
    expect(sw.getMean()).toBeCloseTo(3); // (2+3+4)/3
  });

  it('getMean 计算正确', () => {
    const sw = new SlidingWindow(5);
    [10, 20, 30].forEach((v) => sw.push(v));
    expect(sw.getMean()).toBeCloseTo(20);
  });

  it('getMedian 奇数个值', () => {
    const sw = new SlidingWindow(5);
    [3, 1, 2].forEach((v) => sw.push(v));
    expect(sw.getMedian()).toBe(2);
  });

  it('getMedian 偶数个值', () => {
    const sw = new SlidingWindow(5);
    [1, 2, 3, 4].forEach((v) => sw.push(v));
    expect(sw.getMedian()).toBe(2.5); // (2+3)/2
  });

  it('getStdDev 正确', () => {
    const sw = new SlidingWindow(10);
    [2, 4, 4, 4, 5, 5, 7, 9].forEach((v) => sw.push(v));
    // 均值 = 5, 方差 = 4, 标准差 = 2
    expect(sw.getStdDev()).toBeCloseTo(2, 1);
  });

  it('getStdDev 单值返回 0', () => {
    const sw = new SlidingWindow(5);
    sw.push(42);
    expect(sw.getStdDev()).toBe(0);
  });

  it('getMin / getMax 正确', () => {
    const sw = new SlidingWindow(10);
    [5, 3, 8, 1, 9, 2].forEach((v) => sw.push(v));
    expect(sw.getMin()).toBe(1);
    expect(sw.getMax()).toBe(9);
  });

  it('reset 清空窗口', () => {
    const sw = new SlidingWindow(5);
    [1, 2, 3].forEach((v) => sw.push(v));
    sw.reset();
    expect(sw.length).toBe(0);
    expect(sw.isFull).toBe(false);
    expect(sw.getMean()).toBe(0);
  });

  it('capacity 属性返回构造值', () => {
    const sw = new SlidingWindow(42);
    expect(sw.capacity).toBe(42);
  });

  it('data 返回只读引用', () => {
    const sw = new SlidingWindow(5);
    sw.push(1);
    sw.push(2);
    const data = sw.data;
    expect(data.length).toBe(2);
    expect(data[0]).toBe(1);
    expect(data[1]).toBe(2);
  });
});

// ────────────────────────────────────────────
// PeakDetector
// ────────────────────────────────────────────
describe('PeakDetector', () => {
  /** 辅助：构造一个有明确波谷的窗口数据 */
  function makeValleyWindow(baseline: number, depth: number, windowSize = 25): number[] {
    const data: number[] = [];
    const mid = Math.floor(windowSize / 2);
    for (let i = 0; i < windowSize; i++) {
      // 抛物线：mid 处最低
      const dist = Math.abs(i - mid);
      data.push(baseline + depth * (dist / mid) ** 2 - depth);
    }
    return data;
  }

  /** 辅助：构造平坦数据 */
  function makeFlatWindow(value: number, windowSize = 25): number[] {
    return new Array(windowSize).fill(value);
  }

  it('检测到明显的波谷', () => {
    const pd = new PeakDetector({
      neighborRadius: 2,
      minPeakDistance: 5,
      minPeakHeight: 0.02,
    });
    const data = makeValleyWindow(0.5, 0.1); // baseline=0.5, depth=0.1
    // 填充帧直到超过 minPeakDistance
    for (let i = 0; i < 10; i++) pd.detect(makeFlatWindow(0.5), 'min', 0.5);
    // 现在检测波谷
    const detected = pd.detect(data, 'min', 0.5);
    expect(detected).toBe(true);
  });

  it('平坦数据不触发峰值', () => {
    const pd = new PeakDetector({ neighborRadius: 2, minPeakDistance: 5, minPeakHeight: 0.02 });
    const flat = makeFlatWindow(0.5);
    let detected = false;
    for (let i = 0; i < 30; i++) {
      if (pd.detect(flat, 'min', 0.5)) detected = true;
    }
    expect(detected).toBe(false);
  });

  it('微小抖动不触发峰值（minPeakHeight 过滤）', () => {
    const pd = new PeakDetector({ neighborRadius: 2, minPeakDistance: 5, minPeakHeight: 0.05 });
    const shallow = makeValleyWindow(0.5, 0.01); // depth=0.01 < minPeakHeight=0.05
    for (let i = 0; i < 10; i++) pd.detect(makeFlatWindow(0.5), 'min', 0.5);
    const detected = pd.detect(shallow, 'min', 0.5);
    expect(detected).toBe(false);
  });

  it('minPeakDistance 防抖：短时间内不重复触发', () => {
    const pd = new PeakDetector({ neighborRadius: 2, minPeakDistance: 10, minPeakHeight: 0.02 });
    const valley = makeValleyWindow(0.5, 0.1);

    // 填充到足够帧数
    for (let i = 0; i < 15; i++) pd.detect(makeFlatWindow(0.5), 'min', 0.5);

    // 第一次检测
    const first = pd.detect(valley, 'min', 0.5);
    expect(first).toBe(true);

    // 紧接着再检测，应被防抖阻止
    const second = pd.detect(valley, 'min', 0.5);
    expect(second).toBe(false);
  });

  it('检测波峰（direction=max）', () => {
    const pd = new PeakDetector({ neighborRadius: 2, minPeakDistance: 5, minPeakHeight: 0.02 });
    // 构造波峰数据
    const peak: number[] = [];
    const mid = 12;
    for (let i = 0; i < 25; i++) {
      const dist = Math.abs(i - mid);
      peak.push(0.5 - 0.1 * (dist / mid) ** 2 + 0.1);
    }
    for (let i = 0; i < 10; i++) pd.detect(makeFlatWindow(0.5), 'max', 0.5);
    const detected = pd.detect(peak, 'max', 0.5);
    expect(detected).toBe(true);
  });

  it('reset 清除帧计数', () => {
    const pd = new PeakDetector({ neighborRadius: 2, minPeakDistance: 5, minPeakHeight: 0.02 });
    const valley = makeValleyWindow(0.5, 0.1);

    for (let i = 0; i < 10; i++) pd.detect(makeFlatWindow(0.5), 'min', 0.5);
    pd.detect(valley, 'min', 0.5); // 触发峰值

    pd.reset();

    // reset 后应可以立即再触发
    for (let i = 0; i < 10; i++) pd.detect(makeFlatWindow(0.5), 'min', 0.5);
    const detected = pd.detect(valley, 'min', 0.5);
    expect(detected).toBe(true);
  });

  it('窗口太短不触发', () => {
    const pd = new PeakDetector({ neighborRadius: 3, minPeakDistance: 5, minPeakHeight: 0.01 });
    // 只有 5 个数据点，mid=2 < neighborRadius=3
    const short = [0.5, 0.48, 0.45, 0.48, 0.5];
    const detected = pd.detect(short, 'min', 0.5);
    expect(detected).toBe(false);
  });

  it('使用外部基线计算峰值高度', () => {
    const pd = new PeakDetector({ neighborRadius: 2, minPeakDistance: 5, minPeakHeight: 0.03 });
    // 波谷值 = 0.47, 外部基线 = 0.5, 高度 = 0.03 >= minPeakHeight
    const valley = makeValleyWindow(0.5, 0.03);
    for (let i = 0; i < 10; i++) pd.detect(makeFlatWindow(0.5), 'min', 0.5);
    const detected = pd.detect(valley, 'min', 0.5);
    expect(detected).toBe(true);
  });
});
