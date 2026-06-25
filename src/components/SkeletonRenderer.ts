/**
 * 骨骼渲染器 — 负责 Canvas 上的人体骨骼可视化 + HUD 指示器
 * 将绘图逻辑从 CameraView.tsx 中抽离，降低组件复杂度
 */

import type { ExerciseType } from '../types';
import PoseDetectionService from '../services/PoseDetectionService';

// ── 骨骼连接定义 ──
const POSE_CONNECTIONS: [number, number][] = [
  [11, 12],
  [11, 13], [13, 15],
  [12, 14], [14, 16],
  [11, 23], [12, 24],
  [23, 24],
  [23, 25], [25, 27],
  [24, 26], [26, 28],
  [27, 29], [28, 30],
  [29, 31], [30, 32],
];

const ARM_CONNECTIONS = new Set(['11-13', '13-15', '12-14', '14-16']);
const LEG_CONNECTIONS = new Set(['23-25', '25-27', '24-26', '26-28']);
const TORSO_CONNECTIONS = new Set(['11-12', '11-23', '12-24', '23-24']);

export interface Landmark {
  x: number;
  y: number;
  visibility: number;
}

export interface HUDConfig {
  label: string;
  gradientColors: [string, string, string];
}

/**
 * 计算运动可视化参数（运动比率和 HUD 配置）
 */
export function computeMotionVisuals(
  landmarks: Landmark[],
  exerciseType?: ExerciseType,
): { motionRatio: number; hud: HUDConfig } {
  let motionRatio = 0;
  let hud: HUDConfig = {
    label: '',
    gradientColors: ['rgba(0,200,128,0.6)', 'rgba(0,255,200,0.8)', 'rgba(0,200,128,0.6)'],
  };

  if (exerciseType === 'jumping_jacks') {
    hud.label = '展幅';
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftWrist = landmarks[15];
    const rightWrist = landmarks[16];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];

    if (leftHip && rightHip && leftWrist && rightWrist) {
      const hipWidth = Math.abs(rightHip.x - leftHip.x);
      if (hipWidth > 0.01) {
        const wristSpread = Math.abs(rightWrist.x - leftWrist.x) / hipWidth;
        motionRatio = Math.min(Math.max((wristSpread - 1.0) / 1.5, 0), 1);
        if (leftAnkle && rightAnkle) {
          const ankleSpread = Math.abs(rightAnkle.x - leftAnkle.x) / hipWidth;
          const ankleRatio = Math.min(Math.max((ankleSpread - 0.8) / 1.2, 0), 1);
          motionRatio = motionRatio * 0.6 + ankleRatio * 0.4;
        }
      }
    }
    hud.gradientColors = [
      `rgba(0, 200, 128, ${0.4 + motionRatio * 0.6})`,
      `rgba(0, 255, 200, ${0.6 + motionRatio * 0.4})`,
      `rgba(0, 200, 128, ${0.4 + motionRatio * 0.6})`,
    ];
  } else if (exerciseType === 'squats') {
    hud.label = '深度';
    const leftHip = landmarks[23];
    const rightHip = landmarks[24];
    const leftKnee = landmarks[25];
    const rightKnee = landmarks[26];
    const leftAnkle = landmarks[27];
    const rightAnkle = landmarks[28];

    if (leftHip && rightHip && leftKnee && rightKnee && leftAnkle && rightAnkle) {
      const leftAngle = PoseDetectionService.calculateAngle(leftHip, leftKnee, leftAnkle);
      const rightAngle = PoseDetectionService.calculateAngle(rightHip, rightKnee, rightAnkle);
      const avgAngle = (leftAngle + rightAngle) / 2;
      motionRatio = Math.min(Math.max((170 - avgAngle) / 100, 0), 1);
    }

    const r = Math.round(motionRatio * 255);
    const g = Math.round((1 - motionRatio * 0.6) * 200);
    const b = Math.round((1 - motionRatio) * 128);
    hud.gradientColors = [
      `rgba(${Math.round(r * 0.5)}, ${g}, ${b}, 0.6)`,
      `rgba(${r}, ${Math.round(g * 0.8)}, ${Math.round(b * 0.5)}, 0.9)`,
      `rgba(${Math.round(r * 0.5)}, ${g}, ${b}, 0.6)`,
    ];
  }

  return { motionRatio, hud };
}

/**
 * 在 Canvas 上绘制人体骨骼、关键点和 HUD 指示器
 */
export function drawSkeletonOnCanvas(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  landmarks: Landmark[],
  exerciseType?: ExerciseType,
): void {
  const { motionRatio, hud } = computeMotionVisuals(landmarks, exerciseType);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // ── 绘制连接线 ──
  drawConnections(ctx, canvas, landmarks, exerciseType, motionRatio);

  // ── 绘制关键点 ──
  drawKeypoints(ctx, canvas, landmarks, exerciseType, motionRatio);

  // ── 绘制 HUD 指示器 ──
  if (hud.label) {
    drawHUD(ctx, canvas, hud, motionRatio, exerciseType);
  }
}

/** 绘制骨骼连接线 */
function drawConnections(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  landmarks: Landmark[],
  exerciseType: ExerciseType | undefined,
  motionRatio: number,
): void {
  for (const [a, b] of POSE_CONNECTIONS) {
    const lmA = landmarks[a];
    const lmB = landmarks[b];
    if (!lmA || !lmB) continue;
    if (lmA.visibility < 0.3 || lmB.visibility < 0.3) continue;

    const key = `${a}-${b}`;
    const isArm = ARM_CONNECTIONS.has(key);
    const isLeg = LEG_CONNECTIONS.has(key);
    const isTorso = TORSO_CONNECTIONS.has(key);

    ctx.beginPath();
    ctx.moveTo(lmA.x * canvas.width, lmA.y * canvas.height);
    ctx.lineTo(lmB.x * canvas.width, lmB.y * canvas.height);

    if (exerciseType === 'squats') {
      if (isLeg) {
        const r = Math.round(motionRatio * 255);
        const g = Math.round((1 - motionRatio * 0.6) * 200);
        const b = Math.round((1 - motionRatio) * 128);
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.5 + motionRatio * 0.5})`;
        ctx.lineWidth = 2 + motionRatio * 3;
      } else if (isTorso) {
        const g = Math.round(200 - motionRatio * 40);
        ctx.strokeStyle = `rgba(${Math.round(motionRatio * 80)}, ${g}, ${Math.round(128 - motionRatio * 40)}, 0.7)`;
        ctx.lineWidth = 2.5;
      } else {
        ctx.strokeStyle = 'rgba(0, 200, 128, 0.5)';
        ctx.lineWidth = 2;
      }
    } else {
      if (isArm) {
        const bodyG = Math.round(200 + motionRatio * 55);
        const bodyB = Math.round(128 + motionRatio * 127);
        ctx.strokeStyle = `rgba(0, ${bodyG}, ${bodyB}, ${0.6 + motionRatio * 0.4})`;
        ctx.lineWidth = 2 + motionRatio * 2;
      } else if (isLeg) {
        const legG = Math.round(180 + motionRatio * 75);
        const legB = Math.round(128 + motionRatio * 100);
        ctx.strokeStyle = `rgba(0, ${legG}, ${legB}, 0.7)`;
        ctx.lineWidth = 2 + motionRatio * 1;
      } else {
        ctx.strokeStyle = 'rgba(0, 200, 128, 0.6)';
        ctx.lineWidth = 2;
      }
    }
    ctx.stroke();
  }
}

/** 绘制关键点（关节） */
function drawKeypoints(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  landmarks: Landmark[],
  exerciseType: ExerciseType | undefined,
  motionRatio: number,
): void {
  landmarks.forEach((lm, idx) => {
    if (lm.visibility < 0.3) return;
    ctx.beginPath();

    const isWrist = idx === 15 || idx === 16;
    const isAnkle = idx === 27 || idx === 28;
    const isKnee = idx === 25 || idx === 26;
    const isHip = idx === 23 || idx === 24;

    let radius = 4;
    if (exerciseType === 'squats') {
      if (isKnee) radius = 5 + motionRatio * 4;
      else if (isHip) radius = 5 + motionRatio * 2;
      else if (isAnkle) radius = 4 + motionRatio * 2;
    } else {
      if (isWrist || isAnkle) radius = 4 + motionRatio * 3;
    }

    ctx.arc(lm.x * canvas.width, lm.y * canvas.height, radius, 0, 2 * Math.PI);

    if (exerciseType === 'squats') {
      if (isKnee) {
        const r = Math.round(200 + motionRatio * 55);
        const g = Math.round(255 - motionRatio * 100);
        ctx.fillStyle = `rgba(${r}, ${g}, 0, ${0.7 + motionRatio * 0.3})`;
      } else if (isHip) {
        const r = Math.round(motionRatio * 200);
        const g = Math.round(200 - motionRatio * 60);
        ctx.fillStyle = `rgba(${r}, ${g}, ${Math.round(128 - motionRatio * 60)}, 0.8)`;
      } else {
        ctx.fillStyle = 'rgba(255, 255, 0, 0.9)';
      }
    } else if (isWrist) {
      const a = 0.7 + motionRatio * 0.3;
      ctx.fillStyle = `rgba(255, ${Math.round(200 + motionRatio * 55)}, 0, ${a})`;
    } else if (isAnkle) {
      const a = 0.6 + motionRatio * 0.4;
      ctx.fillStyle = `rgba(0, ${Math.round(200 + motionRatio * 55)}, ${Math.round(200 + motionRatio * 55)}, ${a})`;
    } else {
      ctx.fillStyle = 'rgba(255, 255, 0, 0.9)';
    }
    ctx.fill();
  });
}

/** 绘制左下角 HUD 运动指示器 */
function drawHUD(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  hud: HUDConfig,
  motionRatio: number,
  exerciseType?: ExerciseType,
): void {
  const hudX = 16;
  const hudY = canvas.height - 60;
  const hudW = 120;
  const hudH = 8;

  // 半透明背景
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(hudX - 6, hudY - 20, hudW + 12, 36, 6);
  } else {
    ctx.rect(hudX - 6, hudY - 20, hudW + 12, 36);
  }
  ctx.fill();

  // 底条
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.fillRect(hudX, hudY, hudW, hudH);

  // 进度填充
  if (exerciseType === 'jumping_jacks') {
    const fillW = (hudW / 2) * motionRatio;
    const gradient = ctx.createLinearGradient(hudX + hudW / 2 - fillW, 0, hudX + hudW / 2 + fillW, 0);
    gradient.addColorStop(0, hud.gradientColors[0]);
    gradient.addColorStop(0.5, hud.gradientColors[1]);
    gradient.addColorStop(1, hud.gradientColors[2]);
    ctx.fillStyle = gradient;
    ctx.fillRect(hudX + hudW / 2 - fillW, hudY, fillW * 2, hudH);
  } else {
    const fillW = hudW * motionRatio;
    const gradient = ctx.createLinearGradient(hudX, 0, hudX + fillW, 0);
    gradient.addColorStop(0, hud.gradientColors[0]);
    gradient.addColorStop(1, hud.gradientColors[2]);
    ctx.fillStyle = gradient;
    ctx.fillRect(hudX, hudY, fillW, hudH);
  }

  // 标签
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.fillText(hud.label, hudX, hudY - 6);
}
