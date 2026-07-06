import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mediaPipeLoader = vi.hoisted(() => ({
  loadMediaPipePose: vi.fn(),
}));

vi.mock('../services/MediaPipeLoader', () => mediaPipeLoader);

import CameraView from './CameraView';

describe('CameraView initialization failures', () => {
  const stopTrack = vi.fn();

  beforeEach(() => {
    stopTrack.mockClear();
    mediaPipeLoader.loadMediaPipePose.mockRejectedValue(new Error('MediaPipe Pose 库加载失败'));
    vi.stubGlobal('Pose', undefined);
    vi.stubGlobal('navigator', {
      mediaDevices: {
        enumerateDevices: vi
          .fn()
          .mockResolvedValue([{ kind: 'videoinput', deviceId: 'camera-1', label: 'Test Camera' }]),
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: stopTrack }],
        getVideoTracks: () => [
          {
            label: 'Test Camera',
            getSettings: () => ({ width: 640, height: 480 }),
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
          },
        ],
        }),
      },
    });
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('stops the acquired camera stream when MediaPipe Pose is unavailable', async () => {
    render(<CameraView onPoseDetected={vi.fn()} isActive={true} exerciseType="squats" />);

    await waitFor(() => {
      expect(screen.getByText('摄像头不可用')).toBeTruthy();
    });

    expect(stopTrack).toHaveBeenCalledTimes(1);
  });
});
