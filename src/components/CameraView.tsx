import { useEffect, useRef, useCallback, useState, memo } from 'react';
import { Pose, ExerciseType, Keypoint } from '../types';
import { KEYPOINT_NAMES } from '../constants/exerciseConfig';
import PoseDetectionService from '../services/PoseDetectionService';
import { loadMediaPipePose } from '../services/MediaPipeLoader';
import CameraOverlay from './CameraOverlay';
import { drawSkeletonOnCanvas, type Landmark } from './SkeletonRenderer';

/** 连续 pose.send() 失败超过此阈值则判定 AI 模型断线 */
const POSE_ERROR_THRESHOLD = 10;

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

  const [cameraState, setCameraState] = useState<CameraState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  /** 加载步骤描述（用于 UI 进度提示） */
  const [loadingStep, setLoadingStep] = useState('');

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
      track?.removeEventListener('ended', trackEndedHandlerRef.current);
      trackEndedHandlerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

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

  // 核心修复：startCamera 不依赖任何 props/回调，只初始化一次
  const initCameraAndPose = useCallback(async () => {
    setCameraState('loading');
    setErrorMsg('');
    setLoadingStep('正在访问摄像头...');

    try {
      // 1. 枚举可用设备，帮助诊断
      let selectedDeviceId: string | undefined;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === 'videoinput');
        console.warn(`[AI Sport] 可用摄像头数量: ${videoDevices.length}`);
        videoDevices.forEach((d, i) => {
          console.warn(
            `[AI Sport] 摄像头[${i}]: ${d.label || '未命名'} (id=${d.deviceId.slice(0, 8)}...)`,
          );
        });
        if (videoDevices.length > 0) {
          selectedDeviceId = videoDevices[0].deviceId;
        }
      } catch (e) {
        console.warn('[AI Sport] 枚举设备失败:', e);
      }

      // 2. 请求摄像头权限和流
      let stream: MediaStream;

      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId
          ? { width: { ideal: 640 }, height: { ideal: 480 }, deviceId: { exact: selectedDeviceId } }
          : { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      };

      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (firstErr) {
        // fallback: 不指定 deviceId，让系统自动选择
        console.warn('[AI Sport] 首次 getUserMedia 失败，尝试 fallback:', firstErr);
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 480 } },
            audio: false,
          });
        } catch (secondErr) {
          // 最后 fallback: 最宽松的约束
          console.warn('[AI Sport] 第二次 getUserMedia 失败，尝试最宽松约束:', secondErr);
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
      }

      if (!mountedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const track = stream.getVideoTracks()[0];
      console.warn(
        `[AI Sport] 摄像头已连接: ${track.label}, 分辨率: ${track.getSettings().width}x${track.getSettings().height}`,
      );

      // 摄像头物理断连监听（保存引用以便 stopCamera 时 removeEventListener）
      trackEndedHandlerRef.current = () => {
        if (!mountedRef.current) return;
        console.warn('[AI Sport] 摄像头连接已断开');
        cameraStateRef.current = 'error';
        setCameraState('error');
        setErrorMsg('摄像头连接已断开，请重新连接后刷新页面');
        stopCamera();
      };
      track.addEventListener('ended', trackEndedHandlerRef.current);

      streamRef.current = stream;
      if (!videoRef.current) return;
      videoRef.current.srcObject = stream;
      try {
        await videoRef.current.play();
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

      // 3. 按需加载 MediaPipe Pose（进入训练页后才触发 CDN 加载）
      console.warn('[AI Sport] 正在初始化 MediaPipe Pose...');
      setLoadingStep('正在加载 AI 引擎...');

      const MPPose = await loadMediaPipePose();
      if (!MPPose) {
        throw new Error('MediaPipe Pose 库未加载，请检查网络连接后刷新页面重试');
      }

      if (!mountedRef.current) return;

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
        console.warn(`[AI Sport] 尝试 CDN[${cdnIdx}]: ${cdnBase}`);

        let candidate: MediaPipePose | null = null;
        try {
          const mpPoseClass = window.Pose;
          if (!mpPoseClass)
            throw new Error('MediaPipe Pose 库未加载，请检查网络连接后刷新页面重试');

          if (!mountedRef.current) return;

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
              console.warn(`[AI Sport] CDN[${cdnIdx}] 初始化超时，尝试下一个 CDN`);
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
            return;
          }
          pose = candidate!;
          poseReady = true;
          console.warn(`[AI Sport] MediaPipe Pose 初始化成功，使用 CDN[${cdnIdx}]`);
        } catch (err) {
          if (cdnTimeoutRef.current) {
            clearTimeout(cdnTimeoutRef.current);
            cdnTimeoutRef.current = null;
          }
          candidate?.close?.();
          console.warn(`[AI Sport] CDN[${cdnIdx}] 初始化失败:`, err);
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

      poseRef.current = pose;
      if (mountedRef.current) {
        cameraStateRef.current = 'ready'; // 立即更新 ref，不等 React batch
        setCameraState('ready');
        setLoadingStep('');
        console.warn('[AI Sport] 摄像头和 AI 模型初始化完成');
      }
    } catch (err) {
      console.error('[AI Sport] 初始化失败:', err);
      if (!mountedRef.current) return;
      const errorMsg = err instanceof Error ? err.message : String(err);
      let userMsg: string;

      if (errorMsg.includes('模型加载失败') || errorMsg.includes('模型未加载')) {
        userMsg = 'AI 模型加载失败，请检查网络连接后重试（CDN 被屏蔽或网络不稳定）';
      } else if (
        errorMsg.includes('Permission') ||
        errorMsg.includes('NotAllowed') ||
        errorMsg.includes('denied')
      ) {
        userMsg = `摄像头权限被拒绝。请在 Windows 设置 → 隐私 → 摄像头 中允许此应用访问`;
      } else if (errorMsg.includes('NotFound') || errorMsg.includes('DevicesNotFound')) {
        userMsg = '未检测到摄像头设备，请确认摄像头已连接';
      } else if (errorMsg.includes('NotReadable') || errorMsg.includes('TrackStartError')) {
        userMsg = '摄像头被其他应用占用，请关闭其他使用摄像头的程序后重试';
      } else if (
        errorMsg.includes('Overconstrained') ||
        errorMsg.includes('ConstraintNotSatisfied')
      ) {
        userMsg = '摄像头不支持请求的分辨率，尝试使用其他摄像头';
      } else if (errorMsg.includes('TypeError') && errorMsg.includes('getUserMedia')) {
        userMsg = '当前环境不支持摄像头访问（需要 HTTPS 或 localhost）';
      } else if (errorMsg.includes('MediaPipe') || errorMsg.includes('Pose')) {
        userMsg = 'AI 模型加载失败，请检查网络连接后重试';
      } else {
        userMsg = `摄像头初始化失败: ${errorMsg}`;
      }

      stopCamera();
      setErrorMsg(userMsg);
      setCameraState('error');
      setLoadingStep('');
    }
  }, [drawSkeleton, stopCamera]);

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
        processingRef.current = true;
        try {
          await poseRef.current.send({ image: videoRef.current });
          // 推理成功：重置连续错误计数
          poseErrorCountRef.current = 0;
        } catch (e) {
          poseErrorCountRef.current++;
          console.warn(
            `[AI Sport] pose.send error (${poseErrorCountRef.current}/${POSE_ERROR_THRESHOLD}):`,
            e,
          );
          // 连续失败超过阈值 → AI 模型断线，显示错误提示
          if (poseErrorCountRef.current >= POSE_ERROR_THRESHOLD) {
            console.error('[AI Sport] AI 模型推理连续失败，切换到错误状态');
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

      <CameraOverlay
        cameraState={cameraState}
        isActive={isActive}
        loadingStep={loadingStep}
        errorMsg={errorMsg}
      />
    </div>
  );
}

export default memo(CameraView);
