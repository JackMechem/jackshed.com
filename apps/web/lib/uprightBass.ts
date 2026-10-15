import { getAudioContext } from "./metronome";

// The upright bass Bass Genius plays: Karoryfer's "Meatbass" pizzicato (a 1958 Otto Rubner
// double bass played by D. Smolken, CC0 — see /credits), served from `public/samples/upright-bass`.
// Sampled every minor third from A0 to C4, with four velocity layers and four round-robin takes
// of each, so a note is never pitch-shifted more than a semitone and repeated notes don't sound
// like the same recording twice. 224 small mono mp3s (~5 MB); all of them are fetched and decoded
// once per tab before the first note plays.

const BASE = "/samples/upright-bass";
const KEYS: { name: string; midi: number }[] = [
  { name: "a0", midi: 21 },
  { name: "c1", midi: 24 },
  { name: "eb1", midi: 27 },
  { name: "gb1", midi: 30 },
  { name: "a1", midi: 33 },
  { name: "c2", midi: 36 },
  { name: "eb2", midi: 39 },
  { name: "gb2", midi: 42 },
  { name: "a2", midi: 45 },
  { name: "c3", midi: 48 },
  { name: "eb3", midi: 51 },
  { name: "gb3", midi: 54 },
  { name: "a3", midi: 57 },
  { name: "c4", midi: 60 },
];
const LAYERS = 4;
const TAKES = 4;
const TOTAL = KEYS.length * LAYERS * TAKES;

type Sample = { buffer: AudioBuffer; /** seconds of silence/codec padding before the pluck */ offset: number };
/** samples[key][layer][take] */
let samples: Sample[][][] | null = null;
let loading: Promise<void> | null = null;
let loaded = 0;
const progressListeners = new Set<(fraction: number) => void>();

/** Where the pluck actually starts — mp3 decoders can add a little padding at the front. */
function onsetOf(buffer: AudioBuffer): number {
  const data = buffer.getChannelData(0);
  const limit = Math.min(data.length, Math.floor(buffer.sampleRate * 0.1));
  for (let i = 0; i < limit; i++) {
    if (Math.abs(data[i]) > 0.004) return Math.max(0, i - 24) / buffer.sampleRate;
  }
  return 0;
}

export function uprightBassReady(): boolean {
  return samples !== null;
}

/** Downloads and decodes every sample (once per tab). `onProgress` gets 0–1 as files arrive. */
export function loadUprightBass(onProgress?: (fraction: number) => void): Promise<void> {
  if (onProgress) {
    progressListeners.add(onProgress);
    onProgress(samples ? 1 : loaded / TOTAL);
  }
  if (samples) return Promise.resolve();
  if (loading) return loading.finally(() => onProgress && progressListeners.delete(onProgress));

  const ctx = getAudioContext();
  const result: Sample[][][] = KEYS.map(() => Array.from({ length: LAYERS }, () => [] as Sample[]));
  const jobs: { k: number; l: number; t: number }[] = [];
  KEYS.forEach((_, k) => {
    for (let l = 0; l < LAYERS; l++) for (let t = 0; t < TAKES; t++) jobs.push({ k, l, t });
  });

  async function fetchOne(job: { k: number; l: number; t: number }, attempt = 0): Promise<void> {
    const url = `${BASE}/${KEYS[job.k].name}_v${job.l + 1}_rr${job.t + 1}.mp3`;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} for ${url}`);
      const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
      result[job.k][job.l][job.t] = { buffer, offset: onsetOf(buffer) };
      loaded += 1;
      for (const fn of progressListeners) fn(loaded / TOTAL);
    } catch (err) {
      if (attempt < 2) return fetchOne(job, attempt + 1);
      throw err;
    }
  }

  loading = (async () => {
    let next = 0;
    const worker = async () => {
      while (next < jobs.length) await fetchOne(jobs[next++]);
    };
    await Promise.all(Array.from({ length: 8 }, worker));
    samples = result;
  })();
  loading.catch(() => {
    loading = null;
    loaded = 0;
  });
  return loading.finally(() => onProgress && progressListeners.delete(onProgress));
}

// ---- Output chain: bass → (dry + a touch of room) → master → speakers ----

type Chain = { input: GainNode; master: GainNode; wet: GainNode };
let chain: Chain | null = null;

/** A short, dark room impulse — enough air that the bass isn't bone dry. Identical in both ears,
    from a fixed seed: independent random left/right channels left the bass audibly off centre
    (even energy-matched ones leaned a few tenths of a dB one way or the other). An upright is a
    mono source anyway; this keeps it dead centre. */
export function roomImpulse(ctx: AudioContext): AudioBuffer {
  const length = Math.floor(ctx.sampleRate * 1.3);
  const ir = ctx.createBuffer(2, length, ctx.sampleRate);
  let seed = 0x9e3779b9;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
  const left = ir.getChannelData(0);
  let lp = 0;
  for (let i = 0; i < length; i++) {
    const t = i / ctx.sampleRate;
    lp += (rand() - lp) * 0.18; // darken
    left[i] = t < 0.012 ? 0 : lp * Math.exp(-t * 4.2);
  }
  ir.getChannelData(1).set(left);
  return ir;
}

function getChain(): Chain {
  const ctx = getAudioContext();
  if (chain) return chain;
  const input = ctx.createGain();
  const master = ctx.createGain();
  const wet = ctx.createGain();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 2.5;
  comp.attack.value = 0.01;
  comp.release.value = 0.2;
  const reverb = ctx.createConvolver();
  reverb.buffer = roomImpulse(ctx);
  input.connect(comp);
  comp.connect(master);
  comp.connect(reverb);
  reverb.connect(wet);
  wet.connect(master);
  master.connect(ctx.destination);
  wet.gain.value = 0.16;
  master.gain.value = 0.9;
  chain = { input, master, wet };
  return chain;
}

export function setUprightBassVolume(volume: number) {
  getChain().master.gain.setTargetAtTime(volume * 1.1, getAudioContext().currentTime, 0.05);
}

/** Room sound around the bass: true/false, or an amount 0–1 (0.5 = the usual touch). */
export function setUprightBassRoom(amount: boolean | number) {
  const a = typeof amount === "boolean" ? (amount ? 0.5 : 0) : amount;
  getChain().wet.gain.setTargetAtTime(a * 0.32, getAudioContext().currentTime, 0.05);
}

const lastTake = new Map<string, number>();

/**
 * Plays one note at `time` (AudioContext seconds) for `seconds`, then mutes it the way a bassist's
 * fingers do (a quick fade, not a cut). `velocity` (0–1) picks the dynamic layer and fine-tunes
 * the level within it; takes rotate so no two consecutive hits of a note use the same recording.
 */
export function playUprightBassNote(midi: number, time: number, seconds: number, velocity: number, ghost = false) {
  if (!samples) return;
  const ctx = getAudioContext();
  let k = 0;
  for (let i = 1; i < KEYS.length; i++) if (Math.abs(KEYS[i].midi - midi) < Math.abs(KEYS[k].midi - midi)) k = i;
  const v = Math.max(0, Math.min(0.999, velocity));
  const layer = Math.min(LAYERS - 1, Math.floor(v * LAYERS));
  const id = `${k}:${layer}`;
  const prevTake = lastTake.get(id) ?? -1;
  let take = Math.floor(Math.random() * (TAKES - 1));
  if (take >= prevTake) take += 1;
  take %= TAKES;
  lastTake.set(id, take);
  const sample = samples[k][layer][take];
  if (!sample) return;

  const src = ctx.createBufferSource();
  src.buffer = sample.buffer;
  src.playbackRate.value = Math.pow(2, (midi - KEYS[k].midi) / 12);
  const gain = ctx.createGain();
  const within = v * LAYERS - layer; // 0–1 inside the layer
  const level = (0.72 + 0.28 * within) * (ghost ? 0.55 : 1);
  const start = Math.max(time, ctx.currentTime);
  const release = ghost ? 0.05 : 0.07;
  const end = start + Math.max(0.06, seconds);
  gain.gain.setValueAtTime(level, start);
  gain.gain.setValueAtTime(level, end);
  gain.gain.setTargetAtTime(0, end, release / 3);
  src.connect(gain);
  gain.connect(getChain().input);
  src.start(start, sample.offset);
  src.stop(end + release * 2 + 0.05);
}
