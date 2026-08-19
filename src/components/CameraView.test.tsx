import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mediaPipeLoader = vi.hoisted(() => ({
  loadMediaPipePose: vi.fn(),
}));

vi.mock('../services/MediaPipeLoader', () => mediaPipeLoader);

import CameraView from './CameraView';

function makeTrack(overrides: Record<string, unknown> = {}) {
  return {
    label: 'Test Camera',
    getSettings: () => ({ width: 640, height: 480 }),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    stop: vi.fn(),
    ...overrides,
  };
}

function makeStream(track = makeTrack()) {
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  };
}

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
        getUserMedia: vi.fn().mockResolvedValue(makeStream(makeTrack({ stop: stopTrack }))),
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

  it('shows permission guidance and skips getUserMedia when camera permission is denied', async () => {
    const gUM = vi.fn().mockResolvedValue(makeStream());
    vi.stubGlobal('navigator', {
      mediaDevices: {
        enumerateDevices: vi
          .fn()
          .mockResolvedValue([{ kind: 'videoinput', deviceId: 'camera-1', label: 'Test Camera' }]),
        getUserMedia: gUM,
      },
      permissions: {
        query: vi.fn().mockResolvedValue({ state: 'denied' }),
      },
    });

    render(<CameraView onPoseDetected={vi.fn()} isActive={true} exerciseType="squats" />);

    await waitFor(() => {
      expect(screen.getByText('摄像头不可用')).toBeTruthy();
    });
    expect(gUM).not.toHaveBeenCalled();
    expect(screen.getByText(/摄像头权限被拒绝/)).toBeTruthy();
  });

  it('falls back to the system default camera when the selected device fails', async () => {
    const gUM = vi
      .fn()
      .mockRejectedValueOnce(new DOMException('Device not found', 'NotFoundError'))
      .mockResolvedValueOnce(makeStream());

    vi.stubGlobal('navigator', {
      mediaDevices: {
        enumerateDevices: vi
          .fn()
          .mockResolvedValue([{ kind: 'videoinput', deviceId: 'camera-1', label: 'Test Camera' }]),
        getUserMedia: gUM,
      },
    });

    render(<CameraView onPoseDetected={vi.fn()} isActive={true} exerciseType="squats" />);

    // 第一次调用带 deviceId，第二次（降级）不指定设备
    await waitFor(() => {
      expect(gUM).toHaveBeenCalledTimes(2);
    });
    const firstCall = gUM.mock.calls[0][0] as MediaStreamConstraints;
    expect((firstCall.video as MediaTrackConstraints).deviceId).toEqual({ exact: 'camera-1' });
    const secondCall = gUM.mock.calls[1][0] as MediaStreamConstraints;
    expect(secondCall.video).toBe(true);
  });
});

describe('CameraView device selection', () => {
  beforeEach(() => {
    mediaPipeLoader.loadMediaPipePose.mockRejectedValue(new Error('MediaPipe Pose 库加载失败'));
    vi.stubGlobal('Pose', undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders a device selector when multiple cameras are available', async () => {
    const gUM = vi.fn().mockResolvedValue(makeStream());
    vi.stubGlobal('navigator', {
      mediaDevices: {
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: 'videoinput', deviceId: 'camera-1', label: 'Built-in Camera' },
          { kind: 'videoinput', deviceId: 'camera-2', label: 'USB Camera' },
        ]),
        getUserMedia: gUM,
      },
    });

    render(<CameraView onPoseDetected={vi.fn()} isActive={true} exerciseType="squats" />);

    await waitFor(() => {
      expect(screen.getByLabelText('选择摄像头设备')).toBeTruthy();
    });
    expect(screen.getByText('Built-in Camera')).toBeTruthy();
    expect(screen.getByText('USB Camera')).toBeTruthy();

    // 默认使用第一个设备
    const firstCall = gUM.mock.calls[0][0] as MediaStreamConstraints;
    expect((firstCall.video as MediaTrackConstraints).deviceId).toEqual({ exact: 'camera-1' });
  });

  it('reopens the camera with the newly selected device', async () => {
    const gUM = vi.fn().mockResolvedValue(makeStream());
    vi.stubGlobal('navigator', {
      mediaDevices: {
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: 'videoinput', deviceId: 'camera-1', label: 'Built-in Camera' },
          { kind: 'videoinput', deviceId: 'camera-2', label: 'USB Camera' },
        ]),
        getUserMedia: gUM,
      },
    });

    render(<CameraView onPoseDetected={vi.fn()} isActive={true} exerciseType="squats" />);

    await waitFor(() => {
      expect(screen.getByLabelText('选择摄像头设备')).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('选择摄像头设备'), { target: { value: 'camera-2' } });

    await waitFor(() => {
      expect(gUM).toHaveBeenCalledTimes(2);
    });
    const secondCall = gUM.mock.calls[1][0] as MediaStreamConstraints;
    expect((secondCall.video as MediaTrackConstraints).deviceId).toEqual({ exact: 'camera-2' });
  });
});
