import { getAudioContext } from "@/lib/metronome";
import { roomImpulse } from "@/lib/uprightBass";
import type { DrumKit, DrumVoice } from "@/lib/drums";

// The drum kit for Bass Genius, served by sheddex itself (`public/samples/drums/`, converted to mono
// mp3s; mic pairs mixed; see LICENSE.txt there):
//   - sticks: Virtuosity Drums (Versilian Studios & Karoryfer Samples, CC0) — a contemporary jazz
//     kit: ride (3 layers × 4 round robins), ride bell, hi-hat foot, snare (10 layers, close + overhead),
//     kick (2 layers, kick mic + overhead), crash.
// Each hit picks the velocity layer nearest its velocity and rotates through the round robins.

type Layer = { velocity: number; files: string[] };
const range = (n: number, from = 1) => Array.from({ length: n }, (_, i) => i + from);

function layers(kit: DrumKit, voice: DrumVoice): Layer[] {
  const p = (f: string) => `/samples/drums/${kit}/${f}.mp3`;
  switch (voice) {
      case "ride":
        return [1, 2, 3].map((l, i) => ({ velocity: [0.2, 0.5, 0.8][i], files: range(4).map((r) => p(`ride_${l}_${r}`)) }));
      case "bell":
        return [1, 2, 3].map((l, i) => ({ velocity: [0.2, 0.5, 0.8][i], files: range(3).map((r) => p(`bell_${l}_${r}`)) }));
      case "pedal":
        return [1, 2, 3].map((l, i) => ({ velocity: [0.25, 0.55, 0.85][i], files: range(4).map((r) => p(`pedal_${l}_${r}`)) }));
      case "kick":
        return [1, 2].map((l, i) => ({ velocity: [0.15, 0.6][i], files: range(4).map((r) => p(`kick_${l}_${r}`)) }));
      case "snare":
      case "tap":
        return [2, 3, 4, 5, 6, 7, 8, 9, 10, 12].map((l, i) => ({ velocity: 0.08 + i * 0.09, files: [p(`snare_${l}`)] }));
      case "crash":
        return [{ velocity: 0.5, files: range(4).map((r) => p(`crash_${r}`)) }];
      case "hhClosed":
        return [1, 2, 3, 4].map((l, i) => ({ velocity: [0.2, 0.42, 0.65, 0.88][i], files: range(4).map((r) => p(`hhc_${l}_${r}`)) }));
      case "hhOpen":
        return [1, 2, 3, 4].map((l, i) => ({ velocity: [0.2, 0.42, 0.65, 0.88][i], files: range(3).map((r) => p(`hho_${l}_${r}`)) }));
      case "crossStick":
        return [3, 6, 9, 12, 15].map((l, i) => ({ velocity: 0.15 + i * 0.18, files: [p(`xstick_${l}`)] }));
      case "rimshot":
        return [3, 6, 9, 12].map((l, i) => ({ velocity: 0.2 + i * 0.22, files: [p(`rim_${l}`)] }));
      case "tomHigh":
        return [3, 6, 9, 12, 15].map((l, i) => ({ velocity: 0.15 + i * 0.18, files: [p(`htom_${l}`)] }));
      case "tomLow":
        return [3, 6, 9, 12, 15].map((l, i) => ({ velocity: 0.15 + i * 0.18, files: [p(`ltom_${l}`)] }));
      case "cowbell":
        return [1, 2, 3].map((l, i) => ({ velocity: [0.3, 0.6, 0.85][i], files: range(3).map((r) => p(`cowbell_${l}_${r}`)) }));
      case "block":
        return [2, 4, 6].map((l, i) => ({ velocity: [0.3, 0.6, 0.85][i], files: range(3).map((r) => p(`block_${l}_${r}`)) }));
      default:
        return [];
    }
  return [];
}

/** What Bass Genius's drummer plays (its download stays small). */
const SWING_VOICES: DrumVoice[] = ["ride", "bell", "pedal", "kick", "snare", "crash"];
/** The whole kit (Drum Generator). */
export const ALL_VOICES: DrumVoice[] = [...SWING_VOICES, "hhClosed", "hhOpen", "crossStick", "rimshot", "tomHigh", "tomLow", "cowbell", "block"];
const files = (kit: DrumKit, voices: DrumVoice[] = SWING_VOICES) => [...new Set(voices.flatMap((voice) => layers(kit, voice).flatMap((l) => l.files)))];

/** Level trims (the raw recordings sit at quite different levels). */
const TRIM: Record<DrumKit, Partial<Record<DrumVoice, number>>> = {
  sticks: { ride: 2.6, bell: 1.6, pedal: 2.4, kick: 1.6, snare: 1.4, crash: 1.1, hhClosed: 2.0, hhOpen: 1.6, crossStick: 0.9, rimshot: 0.22, tomHigh: 0.36, tomLow: 0.34, cowbell: 0.75, block: 0.8 },
};

const buffers = new Map<string, AudioBuffer>();
/** Seconds of lead-in before each sample's attack (the hi-hat pedal's travel before its "chick" is
    ~50 ms) — playback starts there, so every hit's transient lands right on its beat. */
const onsets = new Map<string, number>();

function onsetOf(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]));
  const threshold = peak * 0.25;
  for (let i = 0; i < data.length; i++)
    if (Math.abs(data[i]) > threshold) return Math.max(0, i / buffer.sampleRate - 0.002); // 2 ms before it
  return 0;
}
const loading = new Map<string, Promise<void>>();
const lastPick = new Map<string, number>();

export function drumsReady(kit: DrumKit, voices?: DrumVoice[]): boolean {
  return files(kit, voices).every((f) => buffers.has(f));
}

/** Downloads and decodes a kit's samples (just Bass Genius's voices unless `voices` says more). */
export function loadDrums(kit: DrumKit, onProgress?: (fraction: number) => void, voices?: DrumVoice[]): Promise<void> {
  const key = `${kit}:${(voices ?? SWING_VOICES).join(",")}`;
  const existing = loading.get(key);
  if (existing) return existing;
  const ctx = getAudioContext();
  const list = files(kit, voices);
  let done = 0;
  const job = Promise.all(
    list.map(async (url) => {
      if (!buffers.has(url)) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Couldn't download ${url}`);
        const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
        onsets.set(url, onsetOf(buffer));
        buffers.set(url, buffer);
      }
      done++;
      onProgress?.(done / list.length);
    }),
  ).then(() => undefined);
  job.catch(() => loading.delete(key));
  loading.set(key, job);
  return job;
}

type Chain = { input: GainNode; master: GainNode; wet: GainNode };
let chain: Chain | null = null;
function getChain(): Chain {
  if (chain) return chain;
  const ctx = getAudioContext();
  const input = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 2.5;
  comp.attack.value = 0.005;
  comp.release.value = 0.15;
  const master = ctx.createGain();
  const wet = ctx.createGain();
  const reverb = ctx.createConvolver();
  reverb.buffer = roomImpulse(ctx);
  input.connect(comp);
  comp.connect(master);
  comp.connect(reverb);
  reverb.connect(wet);
  wet.connect(master);
  master.connect(ctx.destination);
  wet.gain.value = 0.2;
  master.gain.value = 0.7;
  chain = { input, master, wet };
  return chain;
}

export function setDrumsVolume(volume: number) {
  getChain().master.gain.setTargetAtTime(volume * 1.1, getAudioContext().currentTime, 0.05);
}
/** Room sound around the drums, 0–1 (0.5 = the usual touch). */
export function setDrumsRoom(amount: number) {
  getChain().wet.gain.setTargetAtTime(amount * 0.4, getAudioContext().currentTime, 0.05);
}

let openHat: { gain: GainNode; start: number } | null = null;

/** Plays one hit at `time`. `seconds` (a sweep's length) fades the sample out by then. `tone` picks
    the velocity layer instead of `velocity` (so two hits can share a recording at different levels).
    `gain` scales the level only (a mixer fader — the recording chosen stays the same). */
export function playDrum(kit: DrumKit, voice: DrumVoice, time: number, velocity: number, seconds?: number, tone?: number, gain = 1) {
  const ctx = getAudioContext();
  const ls = layers(kit, voice);
  if (!ls.length) return;
  const pickBy = tone ?? velocity;
  const layer = ls.reduce((best, l) => (Math.abs(l.velocity - pickBy) < Math.abs(best.velocity - pickBy) ? l : best));
  // Round robin, never the same recording twice running.
  const key = `${kit}:${voice}:${layer.velocity}`;
  let pick = Math.floor(Math.random() * layer.files.length);
  if (layer.files.length > 1 && pick === lastPick.get(key)) pick = (pick + 1) % layer.files.length;
  lastPick.set(key, pick);
  const file = layer.files[pick];
  const buffer = buffers.get(file);
  if (!buffer) return;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain();
  // The layer sets the tone; velocity still shades the level within it.
  const level = gain * (TRIM[kit][voice] ?? 1) * Math.pow(Math.max(0.05, velocity) / layer.velocity, 0.7);
  const start = Math.max(time, ctx.currentTime);
  g.gain.setValueAtTime(level, start);
  src.connect(g);
  g.connect(getChain().input);
  src.start(start, onsets.get(file) ?? 0);
  // A real hi-hat: closing it (a closed stroke or the pedal) cuts off the open ring.
  if (voice === "hhOpen") openHat = { gain: g, start };
  else if ((voice === "hhClosed" || voice === "pedal") && openHat && openHat.start < start) {
    openHat.gain.gain.setTargetAtTime(0, start, 0.015);
    openHat = null;
  }
  if (seconds !== undefined) {
    const end = start + seconds;
    g.gain.setValueAtTime(level, Math.max(start, end - 0.25));
    g.gain.linearRampToValueAtTime(0, end + 0.05);
    src.stop(end + 0.1);
  }
}
