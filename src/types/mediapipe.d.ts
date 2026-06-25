// MediaPipe CDN 加载的全局类型声明

interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

interface PoseResults {
  poseLandmarks: PoseLandmark[];
  poseWorldLandmarks: PoseLandmark[];
  segmentationMask?: unknown;
}

interface PoseConstructorOptions {
  locateFile: (file: string) => string;
}

interface MediaPipePose {
  setOptions(options: {
    modelComplexity?: number;
    smoothLandmarks?: boolean;
    enableSegmentation?: boolean;
    smoothSegmentation?: boolean;
    minDetectionConfidence?: number;
    minTrackingConfidence?: number;
  }): void;
  onResults(callback: (results: PoseResults) => void): void;
  send(inputs: { image: HTMLVideoElement }): Promise<void>;
  close?(): void;
}

interface Window {
  Pose: new (opts: PoseConstructorOptions) => MediaPipePose;
}
