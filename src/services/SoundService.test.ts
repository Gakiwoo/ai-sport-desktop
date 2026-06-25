import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

interface MockOscillatorNode {
  type: string;
  frequency: {
    setValueAtTime: ReturnType<typeof vi.fn>;
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onended: (() => void) | null;
}

interface MockGainNode {
  gain: {
    setValueAtTime: ReturnType<typeof vi.fn>;
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
}

interface MockAudioContext {
  createOscillator: ReturnType<typeof vi.fn>;
  createGain: ReturnType<typeof vi.fn>;
  destination: Record<string, never>;
  currentTime: number;
  state: string;
  resume: ReturnType<typeof vi.fn>;
}

function createMockOscillator(): MockOscillatorNode {
  return {
    type: '',
    frequency: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null,
  };
}

function createMockGain(): MockGainNode {
  return {
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
}

function createMockAudioContext(state = 'running'): {
  ctx: MockAudioContext;
  oscillators: MockOscillatorNode[];
  gains: MockGainNode[];
} {
  const oscillators: MockOscillatorNode[] = [];
  const gains: MockGainNode[] = [];

  const ctx: MockAudioContext = {
    createOscillator: vi.fn(() => {
      const osc = createMockOscillator();
      oscillators.push(osc);
      return osc;
    }),
    createGain: vi.fn(() => {
      const gain = createMockGain();
      gains.push(gain);
      return gain;
    }),
    destination: {},
    currentTime: 0,
    state,
    resume: vi.fn().mockResolvedValue(undefined),
  };

  return { ctx, oscillators, gains };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SoundService', () => {
  const savedAudioContext = (window as unknown as Record<string, unknown>).AudioContext;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    // Restore original AudioContext
    Object.defineProperty(window, 'AudioContext', {
      value: savedAudioContext,
      configurable: true,
      writable: true,
    });
  });

  it('playCountTick creates oscillator and gain nodes', async () => {
    const { ctx, oscillators, gains } = createMockAudioContext();
    // Use a constructor function so `new AudioContext()` works
    const MockCtor = function () {
      return ctx;
    } as unknown as typeof AudioContext;
    Object.defineProperty(window, 'AudioContext', {
      value: MockCtor,
      configurable: true,
      writable: true,
    });

    const { playCountTick } = await import('./SoundService');
    playCountTick();

    // One oscillator and one gain node created
    expect(ctx.createOscillator).toHaveBeenCalledTimes(1);
    expect(ctx.createGain).toHaveBeenCalledTimes(1);

    const osc = oscillators[0];
    const gain = gains[0];

    // Oscillator type
    expect(osc.type).toBe('sine');

    // Frequency curve
    expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(880, ctx.currentTime);
    expect(osc.frequency.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      1200,
      ctx.currentTime + 0.05,
    );

    // Gain curve
    expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0.15, ctx.currentTime);
    expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      0.001,
      ctx.currentTime + 0.15,
    );

    // Wiring
    expect(osc.connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(ctx.destination);

    // Playback
    expect(osc.start).toHaveBeenCalledWith(ctx.currentTime);
    expect(osc.stop).toHaveBeenCalledWith(ctx.currentTime + 0.15);

    // onended callback disconnects both nodes
    expect(osc.onended).toBeTypeOf('function');
    osc.onended!();
    expect(osc.disconnect).toHaveBeenCalled();
    expect(gain.disconnect).toHaveBeenCalled();
  });

  it('playGoalReached creates three oscillator nodes', async () => {
    const { ctx, oscillators, gains } = createMockAudioContext();
    const MockCtor = function () {
      return ctx;
    } as unknown as typeof AudioContext;
    Object.defineProperty(window, 'AudioContext', {
      value: MockCtor,
      configurable: true,
      writable: true,
    });

    const { playGoalReached } = await import('./SoundService');
    playGoalReached();

    expect(ctx.createOscillator).toHaveBeenCalledTimes(3);
    expect(ctx.createGain).toHaveBeenCalledTimes(3);

    const expectedFreqs = [880, 1100, 1320];

    oscillators.forEach((osc, i) => {
      // Each oscillator started at the correct offset
      expect(osc.start).toHaveBeenCalledWith(ctx.currentTime + i * 0.12);
      expect(osc.stop).toHaveBeenCalledWith(ctx.currentTime + i * 0.12 + 0.3);

      // Frequency set correctly
      expect(osc.frequency.setValueAtTime).toHaveBeenCalledWith(
        expectedFreqs[i],
        ctx.currentTime + i * 0.12,
      );

      // Type
      expect(osc.type).toBe('sine');
    });

    gains.forEach((gain, i) => {
      // Gain envelope
      expect(gain.gain.setValueAtTime).toHaveBeenCalledWith(0.18, ctx.currentTime + i * 0.12);
      expect(gain.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(
        0.001,
        ctx.currentTime + i * 0.12 + 0.3,
      );

      // Wiring
      expect(gain.connect).toHaveBeenCalledWith(ctx.destination);
    });
  });

  it('playCountTick silently fails when AudioContext throws', async () => {
    // Remove AudioContext entirely to trigger the catch block
    Object.defineProperty(window, 'AudioContext', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    (window as unknown as Record<string, unknown>).webkitAudioContext = undefined;

    const { playCountTick } = await import('./SoundService');

    // Should not throw — the catch block swallows errors silently
    expect(() => playCountTick()).not.toThrow();
  });

  it('resumes suspended AudioContext', async () => {
    const { ctx } = createMockAudioContext('suspended');
    const MockCtor = function () {
      return ctx;
    } as unknown as typeof AudioContext;
    Object.defineProperty(window, 'AudioContext', {
      value: MockCtor,
      configurable: true,
      writable: true,
    });

    const { playCountTick } = await import('./SoundService');
    playCountTick();

    expect(ctx.resume).toHaveBeenCalled();
  });
});
