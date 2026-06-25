/**
 * 音效服务 — 使用 Web Audio API 生成轻柔提示音
 * 无需外部音频文件，纯浏览器端合成
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    )();
  }
  // 修复：如果 AudioContext 处于 suspended 状态（常见于未交互前创建），主动 resume
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {
      /* 静默 */
    });
  }
  return audioCtx;
}

/** 计数变化时的轻柔"叮"声 */
export function playCountTick(): void {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 音高
    osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.05); // 快速上扬

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15); // 快速淡出

    osc.connect(gain);
    gain.connect(ctx.destination);

    // 播放结束后显式断开节点，释放 AudioContext 资源
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    // 静默失败，不影响训练
  }
}

/** 达成目标时的"叮-叮-叮"三连音 */
export function playGoalReached(): void {
  try {
    const ctx = getAudioContext();
    const notes = [880, 1100, 1320]; // A5, C#6, E6 — 上行大三和弦

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.12);

      gain.gain.setValueAtTime(0.18, ctx.currentTime + i * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.12 + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      // 播放结束后显式断开节点
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };

      osc.start(ctx.currentTime + i * 0.12);
      osc.stop(ctx.currentTime + i * 0.12 + 0.3);
    });
  } catch {
    // 静默失败
  }
}
