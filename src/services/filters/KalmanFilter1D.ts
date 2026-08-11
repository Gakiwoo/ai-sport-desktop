/**
 * Backward-compatible re-export of @ai-sport/core filters.
 *
 * This file maintains the old Desktop API surface while delegating to the
 * shared package implementation. Counter files can import from here unchanged.
 *
 * Migration: To use the shared API directly, import from '@ai-sport/core' instead.
 */

import {
  KalmanFilter1D as CoreKalmanFilter1D,
  SlidingWindow as CoreSlidingWindow,
  PeakDetector as CorePeakDetector,
  MultiPointKalman as CoreMultiPointKalman,
} from '@ai-sport/core';

/**
 * Backward-compatible KalmanFilter1D wrapper.
 *
 * Desktop historically used different default parameters (Q=0.001, R=0.01)
 * compared to the shared package (Q=0.01, R=0.1). This wrapper preserves the
 * Desktop defaults so existing counter behavior is unchanged.
 *
 * The shared class adds velocity tracking, `.state`, and `.isInitialized` —
 * all available here via inheritance.
 */
export class KalmanFilter1D extends CoreKalmanFilter1D {
  constructor(options?: { processNoise?: number; measurementNoise?: number }) {
    super({
      processNoise: options?.processNoise ?? 0.001,
      measurementNoise: options?.measurementNoise ?? 0.01,
    });
  }

  /** @deprecated Use .update(value) instead — kept for legacy compatibility */
  filter(value: number): number {
    return this.update(value);
  }
}

/**
 * SlidingWindow — API is already compatible, direct re-export.
 * The shared version adds .last() and .resize() on top of the Desktop API.
 */
export { CoreSlidingWindow as SlidingWindow };

/**
 * Backward-compatible PeakDetector wrapper.
 *
 * Old Desktop API: .detect(windowData, direction?, externalBaseline?) → boolean
 * Shared API:      .check(windowData, direction?, externalBaseline?) → { isPeak, peakValue? }
 *
 * Both methods are available; .detect() delegates to .check().
 */
export class PeakDetector extends CorePeakDetector {
  /** @deprecated Use .check(windowData, direction?, externalBaseline?) instead */
  detect(
    windowData: readonly number[],
    direction: 'min' | 'max' = 'min',
    externalBaseline?: number,
  ): boolean {
    return this.check(windowData, direction, externalBaseline).isPeak;
  }
}

/**
 * MultiPointKalman — API is already compatible, direct re-export.
 * The shared version adds .getFilter(key) on top of the Desktop API.
 */
export { CoreMultiPointKalman as MultiPointKalman };
