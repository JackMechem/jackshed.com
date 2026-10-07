import { getAudioContext } from "@/lib/metronome";
import { noteToFrequency } from "@/lib/noteRange";
import { playSampledNote, prepareSampledNote } from "@/lib/sampledTones";

type Tone = {
  id: string;
  label: string;
  /** Renders one note starting at `startTime` (an `AudioContext.currentTime`-relative timestamp,
      not necessarily "right now" — see `playNotesTogether` below for why), decaying to silence by
      roughly `durationSeconds` later. Everything (oscillators, filters, envelopes) is built fresh
      per call — there's no persistent audio graph to manage between notes. */
  play: (ctx: AudioContext, freq: number, durationSeconds: number, startTime: number) => void;
  /** Optional: resolves once `freq` can be played with no further delay (e.g. a sample-backed
      tone's fetch+decode). Absent for every synthesized tone below, which has nothing to
      preload — building an oscillator graph is synchronous. `playNotesTogether` awaits this for
      every note before playing any of them, which is the only way several notes can genuinely
      start together on a first play rather than each one starting whenever it personally finishes
      loading. */
  prepare?: (ctx: AudioContext, freq: number) => Promise<void>;
};

/** The original tone shape: a single oscillator (a built-in waveform, or a custom one described
    as Fourier `[DC, fundamental, 2nd harmonic, …]` gains via `PeriodicWave`) with a plain
    attack/decay envelope. Used for the simple synth waves below. */
function waveTone(wave: OscillatorType | number[], gain: number, decayFraction = 1) {
  return (ctx: AudioContext, freq: number, durationSeconds: number, startTime: number) => {
    const now = startTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    if (typeof wave === "string") {
      osc.type = wave;
    } else {
      const real = new Float32Array(wave.length);
      const imag = Float32Array.from(wave);
      osc.setPeriodicWave(ctx.createPeriodicWave(real, imag));
    }
    osc.frequency.value = freq;
    osc.connect(g);
    g.connect(ctx.destination);
    const end = now + durationSeconds * decayFraction;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    osc.start(now);
    osc.stop(end);
  };
}

export const TONES: Tone[] = [
  { id: "triangle", label: "Triangle", play: waveTone("triangle", 0.4) },
  { id: "sine", label: "Sine", play: waveTone("sine", 0.4) },
  { id: "square", label: "Square", play: waveTone("square", 0.15) },
  { id: "sawtooth", label: "Sawtooth", play: waveTone("sawtooth", 0.18) },
  { id: "organ", label: "Organ", play: waveTone([0, 1, 0.5, 0.35, 0.2, 0.1], 0.3) },
  {
    id: "pluck",
    label: "Pluck",
    play: waveTone([0, 1, 0.6, 0.35, 0.2, 0.1, 0.05], 0.4, 0.5),
  },
  {
    id: "piano",
    label: "Piano",
    play: (ctx, freq, durationSeconds, startTime) =>
      playSampledNote(ctx, "piano", freq, durationSeconds, startTime),
    prepare: (ctx, freq) => prepareSampledNote(ctx, "piano", freq),
  },
  {
    id: "rhodes",
    label: "Rhodes",
    play: (ctx, freq, durationSeconds, startTime) =>
      playSampledNote(ctx, "rhodes", freq, durationSeconds, startTime),
    prepare: (ctx, freq) => prepareSampledNote(ctx, "rhodes", freq),
  },
];

export const DEFAULT_TONE_ID = TONES[0].id;

/** The Tone options offered by Guess the Interval and Guess the Chord specifically — just the two
    real-sample tones, not the full synthesized-waveform list every other Tone dropdown in this app
    still offers. The two "Ear Training" tools are the ones this was actually asked for; the other
    trainers' own "play out loud" Tone pickers and Practice Timer's chime still use the full
    `TONES` list unchanged. `playNote` itself doesn't care which list a `toneId` came from — it
    still works against the complete set — so this is purely which *options* these two tools show
    and default to. */
export const EAR_TRAINING_TONES: Tone[] = TONES.filter(
  (tone) => tone.id === "piano" || tone.id === "rhodes",
);

export const DEFAULT_EAR_TRAINING_TONE_ID = "piano";

function resolveTone(toneId: string) {
  return TONES.find((t) => t.id === toneId) ?? TONES[0];
}

export function playNote(note: string, durationSeconds: number, toneId: string) {
  const freq = noteToFrequency(note);
  if (freq === null) return;
  const ctx = getAudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  resolveTone(toneId).play(ctx, freq, durationSeconds, ctx.currentTime);
}

/** Plays several notes so they actually start together — a chord's block voicing, an interval's
    harmonic playback — rather than each one just being *called* around the same moment. For the
    synthesized tones that distinction never mattered (building an oscillator graph is
    synchronous, so back-to-back `playNote` calls start within microseconds of each other either
    way), but a sample-backed tone (`lib/sampledTones.ts`) has a real async fetch+decode step the
    first time a given note's sample is needed. Scheduling every note for the same future
    `AudioContext` time isn't enough on its own to fix that — a sample that's still mid-fetch when
    that moment arrives simply doesn't exist yet to play, so it would still start late no matter
    what `when` was requested. The only way several notes can genuinely start together on a first
    play is to *wait for every one of them to finish loading* before starting any of them — exactly
    what this does, via each tone's optional `prepare` step, before computing one shared start time
    and playing every note at once. (Reported directly: "one note plays slightly before the
    others, but replay is fine" — replay just has every sample already cached, so every note was
    already effectively "prepared" and the skew disappeared on its own; this makes that true on the
    first play too, not just by luck on the second.) Tones without a `prepare` step (every
    synthesized one) have nothing to wait for, so this is effectively synchronous for them, same as
    before. */
export async function playNotesTogether(notes: string[], durationSeconds: number, toneId: string) {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  const tone = resolveTone(toneId);
  const freqs = notes
    .map((note) => noteToFrequency(note))
    .filter((freq): freq is number => freq !== null);
  if (tone.prepare) {
    await Promise.all(freqs.map((freq) => tone.prepare!(ctx, freq)));
  }
  const startTime = ctx.currentTime;
  for (const freq of freqs) {
    tone.play(ctx, freq, durationSeconds, startTime);
  }
}
