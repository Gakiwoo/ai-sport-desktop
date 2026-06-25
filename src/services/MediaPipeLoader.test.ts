import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadMediaPipePose } from './MediaPipeLoader';

describe('loadMediaPipePose', () => {
  const OriginalPose = window.Pose;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('Pose', undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.Pose = OriginalPose;
    document.head
      .querySelectorAll('script[data-mediapipe-pose-loader="true"]')
      .forEach((script) => {
        script.remove();
      });
  });

  it('returns the existing global Pose constructor without injecting another script', async () => {
    const Pose = vi.fn() as unknown as typeof window.Pose;
    window.Pose = Pose;

    await expect(loadMediaPipePose()).resolves.toBe(Pose);

    expect(
      document.head.querySelectorAll('script[data-mediapipe-pose-loader="true"]'),
    ).toHaveLength(0);
  });

  it('falls back to the next CDN when the first script fails', async () => {
    const loadPromise = loadMediaPipePose([
      'https://cdn-one.invalid/pose.js',
      'https://cdn-two.invalid/pose.js',
    ]);

    const firstScript = document.head.querySelector<HTMLScriptElement>(
      'script[data-mediapipe-pose-loader="true"]',
    );
    expect(firstScript?.src).toBe('https://cdn-one.invalid/pose.js');
    firstScript?.dispatchEvent(new Event('error'));
    await Promise.resolve();

    const secondScript = document.head.querySelectorAll<HTMLScriptElement>(
      'script[data-mediapipe-pose-loader="true"]',
    )[1];
    expect(secondScript?.src).toBe('https://cdn-two.invalid/pose.js');

    const Pose = vi.fn() as unknown as typeof window.Pose;
    window.Pose = Pose;
    secondScript?.dispatchEvent(new Event('load'));

    await expect(loadPromise).resolves.toBe(Pose);
  });
});
