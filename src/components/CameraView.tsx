import { useEffect, useRef, useCallback, useState, memo } from 'react';
import { Pose, ExerciseType, Keypoint } from '../types';
import { KEYPOINT_NAMES } from '../constants/exerciseConfig';
import PoseDetectionService from '../services/PoseDetectionService';
import { loadMediaPipePose } from '../services/MediaPipeLoader';
import CameraOverlay from './CameraOverlay';
import { drawSkeletonOnCanvas, type Landmark } from './SkeletonRenderer';
import ErrorReporter from '../services/ErrorReporter';
import { performanceMonitor } from '../services/PerformanceMonitor';

/** 连续 pose.send() 失败超过此阈值则判定 AI 模型断线 */
const POSE_ERROR_THRESHOLD = 10;

/** 单帧推理超时（ms）：实际推理 25-40ms，500ms 已有 >10x 余量，够快恢复 */
const POSE_SEND_TIMEOUT_MS = 500;

/** 目标分辨率（理想值，最终由摄像头能力决定） */
const TARGET_WIDTH = 640;
const TARGET_HEIGHT = 480;

/** 根据 DOMException.name / 原始错误信息返回用户可读的错误指引 */
function describeCameraError(name: string, rawMessage: string, deviceCount: number): string {
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return '摄像头权限被拒绝。请在系统设置 → 隐私与安全 → 摄像头 中允许此应用访问，然后重试';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return '未检测到摄像头设备，请确认摄像头已正确连接后重试';
    case 'NotReadableError':
    case 'TrackStartError':
      return '摄像头被其他应用占用或驱动异常，请关闭其他使用摄像头的程序后重试';
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return '摄像头不支持请求的参数，已尝试最宽松模式；若仍失败请更换摄像头';
    case 'AbortError':
      return '摄像头播放被中断，请重试';
    case 'SecurityError':
      return '当前环境不支持摄像头访问（需要 HTTPS 或 localhost 安全上下文）';
    default:
      break;
  }
  if (
    rawMessage.includes('Permission') ||
    rawMessage.includes('NotAllowed') ||
    rawMessage.includes('denied')
  ) {
    return '摄像头权限被拒绝。请在系统设置 → 隐私与安全 → 摄像头 中允许此应用访问，然后重试';
  }
  if (rawMessage.includes('NotFound') || rawMessage.includes('DevicesNotFound')) {
    return '未检测到摄像头设备，请确认摄像头已正确连接后重试';
  }
  if (rawMessage.includes('NotReadable') || rawMessage.includes('TrackStartError')) {
    return '摄像头被其他应用占用或驱动异常，请关闭其他使用摄像头的程序后重试';
  }
  if (rawMessage.includes('Overconstrained') || rawMessage.includes('ConstraintNotSatisfied')) {
    return '摄像头不支持请求的参数，已尝试最宽松模式；若仍失败请更换摄像头';
  }
  if (rawMessage.includes('TypeError') && rawMessage.includes('getUserMedia')) {
    return '当前环境不支持摄像头访问（需要 HTTPS 或 localhost 安全上下文）';
  }
  return `摄像头初始化失败: ${rawMessage}${deviceCount > 0 ? `（当前检测到 ${deviceCount} 个摄像头设备）` : ''}`;
}

/**
 * 为 pose.send() 增加超时保护。
 * - 推理正常完成 → Promise.race 立即 resolve，finally 中清理定时器。
 * - 推理挂死（WASM 崩溃 / CDN 断流）→ 超时后 reject，由调用方计入断线计数。
 * 无论胜负都在 finally 清理定时器，避免每帧泄漏 setTimeout。
 */
function withPoseSendTimeout<T>(sendPromise: Promise<T>, onTimeout: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onTimeout();
      reject(new Error('pose.send() timed out'));
    }, POSE_SEND_TIMEOUT_MS);
  });
  return Promise.race([sendPromise, timeout]).finally(() => clearTimeout(timer));
}

interface CameraViewProps {
  onPoseDetected: (pose: Pose) => void;
  isActive: boolean;
  exerciseType?: ExerciseType;
}

export type CameraState = 'idle' | 'loading' | 'ready' | 'error';

function CameraView({ onPoseDetected, isActive, exerciseType }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const poseRef = useRef<MediaPipePose | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const processingRef = useRef(false);
  const perfRef = useRef({ lastTime: 0, frameCount: 0, fps: 0 });
  const mountedRef = useRef(true);
  /** 连续 pose.send() 失败计数（超过阈值说明 CDN/WASM 断线） */
  const poseErrorCountRef = useRef(0);
  /** 已上报"AI 模型断线"的标记，避免 rAF 热循环中重复上报监控 */
  const aiErrorReportedRef = useRef(false);
  /** CDN 初始化超时定时器 ID（卸载时清理，防止孤儿回调） */
  const cdnTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 用 ref 存 cameraState，避免闭包捕获旧值
  const cameraStateRef = useRef<CameraState>('idle');
  /** 防止 initCameraAndPose 被重复调用 */
  const initStartedRef = useRef(false);
  /** 摄像头 track ended 事件处理器引用（卸载时 removeEventListener） */
  const trackEndedHandlerRef = useRef<(() => void) | null>(null);
  // 用 ref 存回调，避免回调变化导致摄像头重建
  const onPoseDetectedRef = useRef(onPoseDetected);
  const exerciseTypeRef = useRef(exerciseType);
  /** 当前选中的摄像头 deviceId（ref 供 initCameraAndPose 读取，避免闭包捕获旧 state） */
  const selectedDeviceIdRef = useRef('');
  /** 是否已持有 MediaPipe 模型（设备切换时无需重新下载模型） */
  const modelReadyRef = useRef(false);
  /** 设备枚举是否完成（init 前需等待，避免拿到空设备列表） */
  const devicesEnumeratedRef = useRef(false);
  /** 设备枚举完成时的 resolve（供 init 等待） */
  const devicesWaitResolveRef = useRef<(() => void) | null>(null);
  /** 设备列表 ref（供错误诊断读取，避免闭包） */
  const availableDevicesRef = useRef<MediaDeviceInfo[]>([]);

  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  /** 加载步骤描述（用于 UI 进度提示） */
  const [loadingStep, setLoadingStep] = useState('');
  /** 枚举到的摄像头设备列表（用于设备选择器与诊断） */
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);
  /** 用户选中的摄像头 deviceId（'' 表示系统默认） */
  const [selectedDeviceId, setSelectedDeviceId] = useState('');

  // 回调 ref 始终保持最新值
  useEffect(() => {
    onPoseDetectedRef.current = onPoseDetected;
  }, [onPoseDetected]);
  useEffect(() => {
    exerciseTypeRef.current = exerciseType;
  }, [exerciseType]);

  // 同步 state 到 ref
  useEffect(() => {
    cameraStateRef.current = cameraState;
  }, [cameraState]);
  useEffect(() => {
    selectedDeviceIdRef.current = selectedDeviceId;
  }, [selectedDeviceId]);
  useEffect(() => {
    availableDevicesRef.current = availableDevices;
  }, [availableDevices]);

  // 枚举摄像头设备 + 监听热插拔（devicechange）
  useEffect(() => {
    let cancelled = false;
    async function refreshDevices() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const videoDevices = devices.filter((d) => d.kind === 'videoinput');
        setAvailableDevices(videoDevices);
        // 保持用户已选设备；否则自动选中第一个。
        // 同步写入 ref：init 在枚举完成后立即读取 deviceId，等 React state 更新会丢竞态
        let nextDeviceId = selectedDeviceIdRef.current;
        if (!nextDeviceId || !videoDevices.some((d) => d.deviceId === nextDeviceId)) {
          nextDeviceId = videoDevices[0]?.deviceId ?? '';
        }
        selectedDeviceIdRef.current = nextDeviceId;
        setSelectedDeviceId(nextDeviceId);
      } catch (e) {
        ErrorReporter.captureWarning('枚举摄像头设备失败', {
          source: 'CameraView',
          error: String(e),
        });
      } finally {
        // 无论成功失败都标记完成，避免 init 永久等待
        if (!cancelled) {
          devicesEnumeratedRef.current = true;
          devicesWaitResolveRef.current?.();
          devicesWaitResolveRef.current = null;
        }
      }
    }
    refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.('devicechange', refreshDevices);
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    processingRef.current = false;
    poseErrorCountRef.current = 0;
    // 清理 track ended 事件监听器，防止内存泄漏
    if (streamRef.current && trackEndedHandlerRef.current) {
      const track = streamRef.current.getVideoTracks()[0];
      // 防御性调用：个别非标准 track 实现可能缺失 removeEventListener
      track?.removeEventListener?.('ended', trackEndedHandlerRef.current);
      trackEndedHandlerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  /**
   * 打开摄像头流：权限预检 → 优先指定设备 → 多级降级 → 分辨率调优。
   * 返回已就绪的 MediaStream；任何失败都会抛出带 DOMException cause 的错误。
   */
  const openCameraStream = useCallback(async (deviceId: string): Promise<MediaStream> => {
    // 1. 权限预检：浏览器支持时提前检测，denied 直接给指引（不必等 getUserMedia 失败）
    try {
      const perm = await navigator.permissions?.query({ name: 'camera' as PermissionName });
      if (perm && perm.state === 'denied') {
        throw new Error(
          '摄像头权限被拒绝。请在系统设置 → 隐私与安全 → 摄像头 中允许此应用访问，然后重试',
          {
            cause: new DOMException('Permission denied', 'NotAllowedError'),
          },
        );
      }
    } catch (permErr) {
      // permissions.query 可能不受支持（部分 WebView），忽略并继续
      if (permErr instanceof Error && permErr.message.includes('权限被拒绝')) {
        throw permErr;
      }
    }

    // 2. 获取流：优先指定设备；失败则退回系统默认（最宽松约束）
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: false,
      });
    } catch (firstErr) {
      ErrorReporter.captureWarning('getUserMedia 指定设备失败，尝试系统默认摄像头', {
        source: 'CameraView',
        deviceId,
        error: String(firstErr),
      });
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    }

    // 3. 分辨率调优：按设备能力范围设置 ideal（老摄像头/4K 摄像头都能打开）
    try {
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities?.() ?? {};
      const wCaps = caps.width as ULongRange | undefined;
      const hCaps = caps.height as ULongRange | undefined;
      const maxW = typeof wCaps?.max === 'number' ? wCaps.max : TARGET_WIDTH;
      const maxH = typeof hCaps?.max === 'number' ? hCaps.max : TARGET_HEIGHT;
      await track.applyConstraints?.({
        width: { ideal: Math.min(TARGET_WIDTH, maxW) },
        height: { ideal: Math.min(TARGET_HEIGHT, maxH) },
      });
    } catch (tuneErr) {
      // 个别设备不支持 applyConstraints，忽略（沿用默认分辨率）
      ErrorReporter.captureWarning('摄像头分辨率调优失败，使用默认分辨率', {
        source: 'CameraView',
        error: String(tuneErr),
      });
    }

    return stream;
  }, []);

  /** 绑定摄像头物理断连监听，并把流挂到 video 元素 */
  const bindTrack = useCallback(
    (stream: MediaStream): MediaStreamTrack => {
      const track = stream.getVideoTracks()[0];
      trackEndedHandlerRef.current = () => {
        if (!mountedRef.current) return;
        ErrorReporter.captureWarning('摄像头连接已断开', { source: 'CameraView' });
        cameraStateRef.current = 'error';
        setCameraState('error');
        setErrorMsg('摄像头连接已断开，请重新连接后刷新页面');
        stopCamera();
      };
      track.addEventListener('ended', trackEndedHandlerRef.current);
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      return track;
    },
    [stopCamera],
  );

  const drawSkeleton = useCallback((landmarks: Landmark[]) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (canvas.width !== vw || canvas.height !== vh) {
      canvas.width = vw;
      canvas.height = vh;
    }
    if (!ctxRef.current) ctxRef.current = canvas.getContext('2d');
    const ctx = ctxRef.current;
    if (!ctx) return;

    drawSkeletonOnCanvas(ctx, canvas, landmarks, exerciseTypeRef.current);
  }, []);

  /** 加载 MediaPipe Pose：库 → 模型文件（多级 CDN）→ 初始化推理回调。设备切换时复用，避免重复下载 */
  const loadPoseModel = useCallback(async (): Promise<MediaPipePose | null> => {
    setLoadingStep('正在加载 AI 引擎...');

    const MPPose = await loadMediaPipePose();
    if (!MPPose) {
      throw new Error('MediaPipe Pose 库未加载，请检查网络连接后刷新页面重试');
    }

    if (!mountedRef.current) return null;

    setLoadingStep('正在下载模型文件...');
    /** MediaPipe 模型文件加载顺序：本地缓存 → gakiwoo.com(自建) → jsdelivr → unpkg → npmmirror */
    const CDN_FALLBACKS = [
      '/mediapipe',
      'https://gakiwoo.com/static/mediapipe/pose',
      'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/files',
      'https://unpkg.com/@mediapipe/pose@0.5.1675469404/files',
      'https://registry.npmmirror.com/@mediapipe/pose@0.5.1675469404/files',
    ];

    let pose: MediaPipePose | null = null;
    let poseReady = false;

    for (let cdnIdx = 0; cdnIdx < CDN_FALLBACKS.length && !poseReady; cdnIdx++) {
      const cdnBase = CDN_FALLBACKS[cdnIdx];
      ErrorReporter.captureInfo(`MediaPipe 尝试 CDN[${cdnIdx}]`, {
        source: 'CameraView',
        cdnBase,
      });

      let candidate: MediaPipePose | null = null;
      try {
        const mpPoseClass = window.Pose;
        if (!mpPoseClass) throw new Error('MediaPipe Pose 库未加载，请检查网络连接后刷新页面重试');

        if (!mountedRef.current) return null;

        candidate = new mpPoseClass({
          locateFile: (file: string) => `${cdnBase}/${file}`,
        });

        candidate.setOptions({
          modelComplexity: 0,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        // 用超时控制首次初始化（30s），Promise.race 保证 send() 挂死时也能推进到下一个 CDN
        const timeoutPromise = new Promise<never>((_, reject) => {
          cdnTimeoutRef.current = setTimeout(() => {
            ErrorReporter.captureWarning(`CDN[${cdnIdx}] 初始化超时`, {
              source: 'CameraView',
              cdnBase,
            });
            candidate?.close?.();
            reject(new Error(`CDN[${cdnIdx}] initialization timed out`));
          }, 30_000);
        });

        // 首次 send 触发 WASM + 模型文件下载；成功返回则模型就绪
        if (videoRef.current && videoRef.current.readyState >= 2) {
          await Promise.race([candidate!.send({ image: videoRef.current }), timeoutPromise]);
        }

        if (cdnTimeoutRef.current) {
          clearTimeout(cdnTimeoutRef.current);
          cdnTimeoutRef.current = null;
        }
        if (!mountedRef.current) {
          candidate?.close?.();
          return null;
        }
        pose = candidate!;
        poseReady = true;
      } catch (err) {
        if (cdnTimeoutRef.current) {
          clearTimeout(cdnTimeoutRef.current);
          cdnTimeoutRef.current = null;
        }
        candidate?.close?.();
        ErrorReporter.captureWarning(`CDN[${cdnIdx}] 初始化失败`, {
          source: 'CameraView',
          cdnBase,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (!pose || !poseReady) {
      throw new Error('AI 模型加载失败，请检查网络连接后重试');
    }

    // 预分配关键点对象池，避免每帧 new 33 个对象造成 GC 压力
    setLoadingStep('正在初始化模型...');
    const keypointPool: Keypoint[] = KEYPOINT_NAMES.map((name) => ({
      x: 0,
      y: 0,
      score: 0,
      name,
    }));
    const posePool: Pose = { keypoints: keypointPool, score: 0 };
    // 一次性构建 keypointMap，后续帧不再调用（O(1) Map 查找）
    PoseDetectionService.buildKeypointMap(posePool);

    pose.onResults((results: PoseResults) => {
      if (!results.poseLandmarks) return;

      // FPS 计数
      const now = performance.now();
      perfRef.current.frameCount++;
      if (now - perfRef.current.lastTime >= 1000) {
        perfRef.current.fps = perfRef.current.frameCount;
        perfRef.current.frameCount = 0;
        perfRef.current.lastTime = now;
      }

      drawSkeleton(results.poseLandmarks);

      // 复用对象池：原地更新坐标，不创建新对象
      let scoreSum = 0;
      for (let i = 0; i < results.poseLandmarks.length; i++) {
        const lm = results.poseLandmarks[i];
        keypointPool[i].x = lm.x;
        keypointPool[i].y = lm.y;
        keypointPool[i].score = lm.visibility;
        scoreSum += lm.visibility;
      }
      posePool.score = scoreSum / results.poseLandmarks.length;

      // 通过 ref 调用，始终拿到最新的回调
      onPoseDetectedRef.current(posePool);
    });

    return pose;
  }, [drawSkeleton]);

  // 核心修复：startCamera 不依赖任何 props/回调，只初始化一次
  const initCameraAndPose = useCallback(async () => {
    setCameraState('loading');
    setErrorMsg('');
    setLoadingStep('正在访问摄像头...');

    try {
      // 0. 等待设备枚举完成（避免竞态：用户秒点"开始训练"时列表可能还没返回）
      if (!devicesEnumeratedRef.current) {
        await new Promise<void>((resolve) => {
          devicesWaitResolveRef.current = resolve;
        });
      }
      // 1. 获取摄像头流：权限预检 + 优先用户选中的设备 + 多级降级 + 分辨率调优
      const stream = await openCameraStream(selectedDeviceIdRef.current);
      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      // 摄像头物理断连监听 + 绑定流到 video（复用，供设备切换时调用）
      const track = bindTrack(stream);
      ErrorReporter.captureInfo('摄像头已连接', {
        source: 'CameraView',
        trackLabel: track.label,
        resolution: `${track.getSettings().width}x${track.getSettings().height}`,
      });

      try {
        await videoRef.current?.play();
      } catch (playErr) {
        if (playErr instanceof DOMException) {
          if (playErr.name === 'NotAllowedError') {
            throw new Error('摄像头权限被拒绝，请在系统设置中允许摄像头访问', { cause: playErr });
          }
          if (playErr.name === 'AbortError') {
            throw new Error('摄像头播放被中断，请重试', { cause: playErr });
          }
        }
        throw playErr;
      }
      if (!mountedRef.current) return;

      // 2. 加载 MediaPipe Pose（进入训练页后才触发 CDN 加载；设备切换时复用）
      const pose = await loadPoseModel();
      if (!mountedRef.current) {
        pose?.close?.();
        return;
      }

      poseRef.current = pose;
      modelReadyRef.current = true;
      if (mountedRef.current) {
        cameraStateRef.current = 'ready'; // 立即更新 ref，不等 React batch
        setCameraState('ready');
        setLoadingStep('');
      }
    } catch (err) {
      ErrorReporter.captureError(err, { source: 'CameraView', step: 'initCameraAndPose' });
      if (!mountedRef.current) return;
      const errorMsg = err instanceof Error ? err.message : String(err);
      const errorName =
        err instanceof DOMException
          ? err.name
          : err instanceof Error && err.cause instanceof DOMException
            ? err.cause.name
            : '';

      let userMsg: string;
      if (errorMsg.includes('模型加载失败') || errorMsg.includes('模型未加载')) {
        userMsg = 'AI 模型加载失败，请检查网络连接后重试（CDN 被屏蔽或网络不稳定）';
      } else if (errorMsg.includes('MediaPipe') || errorMsg.includes('Pose')) {
        userMsg = 'AI 模型加载失败，请检查网络连接后重试';
      } else if (errorMsg.includes('权限被拒绝')) {
        userMsg = errorMsg;
      } else {
        userMsg = describeCameraError(errorName, errorMsg, availableDevicesRef.current.length);
      }

      stopCamera();
      setErrorMsg(userMsg);
      setCameraState('error');
      setLoadingStep('');
    }
  }, [stopCamera, openCameraStream, bindTrack, loadPoseModel]);

  /** 设备切换：重开摄像头流，模型已就绪时无需重新下载 */
  const handleDeviceChange = useCallback(
    (deviceId: string) => {
      setSelectedDeviceId(deviceId);
      selectedDeviceIdRef.current = deviceId;
      if (!initStartedRef.current) return; // 尚未初始化，枚举逻辑已自动选中，无需处理
      setCameraState('loading');
      setErrorMsg('');
      setLoadingStep('正在切换摄像头...');
      stopCamera();
      openCameraStream(deviceId)
        .then((stream) => {
          if (!mountedRef.current) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          bindTrack(stream);
          return videoRef.current?.play();
        })
        .then(() => {
          if (!mountedRef.current) return;
          if (poseRef.current) {
            cameraStateRef.current = 'ready';
            setCameraState('ready');
            setLoadingStep('');
          } else {
            // 模型未就绪（异常路径）：复用已打开的流，仅加载模型
            return loadPoseModel().then((pose) => {
              if (!mountedRef.current) {
                pose?.close?.();
                return;
              }
              if (!pose) return;
              poseRef.current = pose;
              modelReadyRef.current = true;
              cameraStateRef.current = 'ready';
              setCameraState('ready');
              setLoadingStep('');
            });
          }
        })
        .catch((err: unknown) => {
          ErrorReporter.captureError(err, { source: 'CameraView', step: 'deviceChange' });
          if (!mountedRef.current) return;
          const errorMsg = err instanceof Error ? err.message : String(err);
          const errorName =
            err instanceof DOMException
              ? err.name
              : err instanceof Error && err.cause instanceof DOMException
                ? err.cause.name
                : '';
          stopCamera();
          setErrorMsg(describeCameraError(errorName, errorMsg, availableDevicesRef.current.length));
          setCameraState('error');
          setLoadingStep('');
        });
    },
    [loadPoseModel, openCameraStream, bindTrack, stopCamera],
  );

  /** 错误后重试：重置初始化标记并重新走完整流程 */
  const handleRetry = useCallback(() => {
    stopCamera();
    initStartedRef.current = false;
    modelReadyRef.current = false;
    setCameraState('idle');
    setErrorMsg('');
    setLoadingStep('');
    initStartedRef.current = true;
    initCameraAndPose().catch(() => {
      // 错误已在 initCameraAndPose 内处理
    });
  }, [initCameraAndPose, stopCamera]);

  // 核心 Bug 修复：rAF 循环始终运行（摄像头活着就运行），通过 cameraStateRef 控制是否发推理请求
  const startLoop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);

    const loop = async () => {
      if (!mountedRef.current) return;

      // 用 ref 读取最新 cameraState，避免闭包捕获旧值
      if (
        !processingRef.current &&
        videoRef.current &&
        poseRef.current &&
        videoRef.current.readyState >= 2 &&
        cameraStateRef.current === 'ready' // 只有模型就绪才发送
      ) {
        // 自适应跳帧：慢设备隔帧处理，减少 WASM 推理压力
        if (!performanceMonitor.shouldProcessFrame()) {
          rafRef.current = requestAnimationFrame(loop);
          return;
        }

        processingRef.current = true;
        const frameStart = performance.now();
        try {
          await withPoseSendTimeout(poseRef.current.send({ image: videoRef.current }), () =>
            ErrorReporter.captureWarning('pose.send 单帧推理超时', {
              source: 'CameraView',
              timeoutMs: POSE_SEND_TIMEOUT_MS,
            }),
          );
          // 记录推理耗时，用于设备性能分级
          const elapsed = performance.now() - frameStart;
          performanceMonitor.recordFrame(elapsed);
          // 推理成功：重置连续错误计数
          poseErrorCountRef.current = 0;
          aiErrorReportedRef.current = false; // 推理恢复，允许下次断线再次上报
        } catch (e) {
          poseErrorCountRef.current++;
          ErrorReporter.captureWarning(
            `pose.send error (${poseErrorCountRef.current}/${POSE_ERROR_THRESHOLD})`,
            {
              source: 'CameraView',
              error: e instanceof Error ? e.message : String(e),
              consecutiveErrors: poseErrorCountRef.current,
            },
          );
          // 连续失败超过阈值 → AI 模型断线，显示错误提示并一次性上报
          if (poseErrorCountRef.current >= POSE_ERROR_THRESHOLD) {
            if (!aiErrorReportedRef.current) {
              aiErrorReportedRef.current = true;
              ErrorReporter.captureError(new Error('AI 模型推理连续失败，切换到错误状态'), {
                source: 'CameraView',
                consecutiveErrors: poseErrorCountRef.current,
              });
            }
            cameraStateRef.current = 'error';
            setCameraState('error');
            setErrorMsg('AI 模型运行中断，请检查网络连接后重试');
          }
        } finally {
          processingRef.current = false;
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
  }, []); // 空依赖 — 不再依赖 cameraState

  // 延迟初始化：仅当用户首次点击"开始训练"时触发摄像头和模型加载（隐私保护 + 节省带宽）
  useEffect(() => {
    if (isActive && !initStartedRef.current) {
      initStartedRef.current = true;
      initCameraAndPose().catch(() => {
        // 错误已在 initCameraAndPose 内处理
      });
    }
  }, [isActive, initCameraAndPose]);

  // 卸载清理
  useEffect(() => {
    return () => {
      initStartedRef.current = false; // 重置以便重新挂载后可再次初始化
      stopCamera();
      if (cdnTimeoutRef.current) {
        clearTimeout(cdnTimeoutRef.current);
        cdnTimeoutRef.current = null;
      }
      poseRef.current?.close?.();
      poseRef.current = null;
    };
  }, [stopCamera]);

  // isActive 变化时只控制推理循环的启停（仅在模型就绪后才启动，避免加载期间空转浪费 CPU）
  useEffect(() => {
    if (isActive && cameraStateRef.current === 'ready') {
      startLoop();
    } else if (!isActive) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
      processingRef.current = false;
      // 暂停视频解码，降低 GPU/CPU 占用（推理循环已停，视频流无需持续播放）
      videoRef.current?.pause();
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [isActive, startLoop]);

  // 补充：预加载完成后，如果 isActive 已经为 true，立即启动推理
  useEffect(() => {
    if (cameraState === 'ready' && isActive) {
      startLoop();
    }
  }, [cameraState, isActive, startLoop]);

  // 单一 JSX 树：video/canvas 始终在固定位置，避免 React 因元素位置变化而销毁 video DOM 导致断流
  return (
    <div className="camera-wrapper">
      <video
        ref={videoRef}
        className="camera-video"
        playsInline
        muted
        style={{ transform: 'scaleX(-1)' }}
      />
      <canvas ref={canvasRef} className="camera-canvas" style={{ transform: 'scaleX(-1)' }} />

      {/* 多摄像头设备选择器（仅当存在多个设备时显示，热插拔自动刷新） */}
      {availableDevices.length > 1 && (
        <div className="camera-device-selector">
          <label htmlFor="camera-device-select">摄像头</label>
          <select
            id="camera-device-select"
            value={selectedDeviceId}
            onChange={(e) => handleDeviceChange(e.target.value)}
            aria-label="选择摄像头设备"
          >
            {availableDevices.map((device, idx) => (
              <option key={device.deviceId} value={device.deviceId}>
                {device.label || `摄像头 ${idx + 1}`}
              </option>
            ))}
          </select>
        </div>
      )}

      <CameraOverlay
        cameraState={cameraState}
        isActive={isActive}
        loadingStep={loadingStep}
        errorMsg={errorMsg}
        onRetry={handleRetry}
      />
    </div>
  );
}

export default memo(CameraView);
