import { getAudioContext } from '@/lib/audioContext';

/**
 * The native sibling of `apps/web/lib/practiceTimerEngine.ts`'s own `playTransitionChime` — the
 * same two-note "C5 then G5" triangle-wave chime, built the same way `metronomeClickEngine.ts`
 * already synthesizes clicks (a plain oscillator + gain envelope through `react-native-audio-api`'s
 * `AudioContext`, not a pre-rendered sample). This didn't exist at all before — the engine's own
 * `soundEnabled` option only ever drove `Vibration.vibrate`, a real, reported bug ("the sound is
 * not working for the timer"): there was never any actual audible chime on native, just haptic
 * feedback standing in for it, left over from before `react-native-audio-api` replaced `expo-audio`
 * for the Metronome and made real oscillator synthesis available at all on this platform.
 */
const C5 = 523.25;
const G5 = 783.99;

function playTone(freq: number, durationSeconds: number, startTime: number) {
  const ctx = getAudioContext();
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  osc.connect(g);
  g.connect(ctx.destination);
  const end = startTime + durationSeconds;
  g.gain.setValueAtTime(0.0001, startTime);
  g.gain.exponentialRampToValueAtTime(0.4, startTime + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.start(startTime);
  osc.stop(end);
}

export function playTransitionChime() {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  const now = ctx.currentTime;
  playTone(C5, 0.3, now);
  playTone(G5, 0.4, now + 0.15);
}
