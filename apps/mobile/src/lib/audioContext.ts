import { AudioContext } from 'react-native-audio-api';

/**
 * The native sibling of `apps/web/lib/metronome.ts`'s own `getAudioContext()` — a lazy module-level
 * singleton, same reasoning (one shared context for the whole app, not a fresh one per tool).
 * `react-native-audio-api` (Software Mansion) implements the real Web Audio API spec natively —
 * `AudioContext`/`OscillatorNode`/`GainNode`/`AudioParam.setValueAtTime`/`node.start(when)` all
 * exist with the same signatures a real browser's `AudioContext` has, scheduled against the
 * context's own sample-accurate `currentTime`, not a JS-thread `setTimeout`. This replaced
 * `expo-audio`'s `AudioPlayer` (which only exposes `play()` — fires whenever the JS call happens
 * to execute, with no way to schedule a future sample-accurate start time) once that turned out to
 * be the actual root cause of audible metronome jitter reported on a real device — see
 * `metronomeClickEngine.ts`'s own doc comment for the full story.
 */
let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  ctx ??= new AudioContext();
  return ctx;
}
