import { getAudioContext } from '@/lib/audioContext';

/**
 * The native sibling of `apps/web/lib/toneGenerator.ts` — same oscillator + gain envelope, built
 * on `react-native-audio-api`'s `AudioContext` (already proven for the Metronome and Practice
 * Timer) instead of the browser's own. Plays a reference tone: with `duration` it fades out on its
 * own (a plucked reference); without it, it sustains until `stop()` is called.
 */
export type ToneHandle = { stop: () => void };

const ATTACK = 0.03;
const RELEASE = 0.12;

export function startTone(
  freq: number,
  wave: 'sine' | 'triangle' | 'sawtooth' | 'square',
  volume = 0.35,
  duration?: number,
  onEnd?: () => void,
): ToneHandle {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.value = freq;
  osc.connect(gain);
  gain.connect(ctx.destination);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + ATTACK);
  osc.start(now);

  let stopped = false;
  osc.onEnded = () => onEnd?.();

  if (duration !== undefined) {
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.stop(now + duration + 0.02);
  }

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      const t = ctx.currentTime;
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + RELEASE);
      try {
        osc.stop(t + RELEASE + 0.02);
      } catch {
        // already stopped
      }
    },
  };
}
