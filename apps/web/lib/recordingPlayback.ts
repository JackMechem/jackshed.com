/**
 * Playing a take over its tune's song, the DAW way: both files are downloaded and decoded into
 * `AudioBuffer`s and played with Web Audio on one clock, so they stay locked together, seeking is
 * instant (streamed `<audio>` often can't seek in recorded files), and the waveforms can be drawn.
 */

import { getAudioContext } from "@/lib/metronome";

/** Min/max of the signal (all channels) in short buckets — what a waveform is drawn from. */
export type Peaks = { min: Float32Array; max: Float32Array; perSec: number; scale: number };

export type LoadedAudio = { buffer: AudioBuffer; peaks: Peaks };

const PEAKS_PER_SEC = 400;
const CACHE_SIZE = 4;
const cache = new Map<string, Promise<LoadedAudio>>();

function computePeaks(buffer: AudioBuffer): Peaks {
  const size = Math.max(1, Math.floor(buffer.sampleRate / PEAKS_PER_SEC));
  const n = Math.ceil(buffer.length / size);
  const min = new Float32Array(n);
  const max = new Float32Array(n);
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) => buffer.getChannelData(c));
  let loudest = 0;
  for (let b = 0; b < n; b++) {
    let lo = 0;
    let hi = 0;
    const end = Math.min(buffer.length, (b + 1) * size);
    for (const data of channels) {
      for (let i = b * size; i < end; i++) {
        const v = data[i];
        if (v < lo) lo = v;
        else if (v > hi) hi = v;
      }
    }
    min[b] = lo;
    max[b] = hi;
    loudest = Math.max(loudest, hi, -lo);
  }
  // Drawn normalised (a quiet take still shows), but not blown up past 8x.
  return { min, max, perSec: buffer.sampleRate / size, scale: loudest > 0 ? Math.min(8, 1 / loudest) : 1 };
}

/** Downloads and decodes an audio file (cached — the same song behind several takes loads once). */
export function loadAudio(url: string): Promise<LoadedAudio> {
  const hit = cache.get(url);
  if (hit) {
    cache.delete(url);
    cache.set(url, hit);
    return hit;
  }
  const job = (async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Couldn't download the audio (${res.status}).`);
    const buffer = await getAudioContext().decodeAudioData(await res.arrayBuffer());
    return { buffer, peaks: computePeaks(buffer) };
  })();
  job.catch(() => cache.delete(url));
  cache.set(url, job);
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  return job;
}

export type PlayerTrack = { buffer: AudioBuffer; /** Timeline position of the file's start (s). */ start: number };

/** Plays several buffers, each at its own timeline position, through its own gain (and a meter). */
export class TimelinePlayer {
  /** One timeline plays at a time across the site. */
  private static current: TimelinePlayer | null = null;
  private ctx = getAudioContext();
  private gains: GainNode[];
  private analysers: AnalyserNode[];
  private sources: AudioBufferSourceNode[] = [];
  private scratch = new Float32Array(1024);
  private t0 = 0;
  private pos0 = 0;
  private pausedAt = 0;
  playing = false;

  constructor(private tracks: PlayerTrack[]) {
    this.gains = tracks.map(() => this.ctx.createGain());
    this.analysers = tracks.map((_, i) => {
      const a = this.ctx.createAnalyser();
      a.fftSize = 1024;
      this.gains[i].connect(a);
      this.gains[i].connect(this.ctx.destination);
      return a;
    });
  }

  /** The playhead, in timeline seconds. */
  position(): number {
    return this.playing ? this.pos0 + Math.max(0, this.ctx.currentTime - this.t0) : this.pausedAt;
  }

  setGain(i: number, value: number) {
    this.gains[i]?.gain.setTargetAtTime(value, this.ctx.currentTime, 0.015);
  }

  /** Moves a track on the timeline (keeps playing from the same spot). */
  setStart(i: number, start: number) {
    if (!this.tracks[i] || this.tracks[i].start === start) return;
    this.tracks[i] = { ...this.tracks[i], start };
    if (this.playing) this.play(this.position());
  }

  play(from: number) {
    if (TimelinePlayer.current && TimelinePlayer.current !== this) TimelinePlayer.current.pause();
    TimelinePlayer.current = this;
    void this.ctx.resume();
    this.stopSources();
    const when = this.ctx.currentTime + 0.04;
    this.tracks.forEach((track, i) => {
      const into = from - track.start;
      if (into >= track.buffer.duration) return;
      const src = this.ctx.createBufferSource();
      src.buffer = track.buffer;
      src.connect(this.gains[i]);
      src.start(when + Math.max(0, -into), Math.max(0, into));
      this.sources.push(src);
    });
    this.t0 = when;
    this.pos0 = from;
    this.playing = true;
  }

  pause() {
    if (!this.playing) return;
    this.pausedAt = this.position();
    this.stopSources();
    this.playing = false;
  }

  seek(to: number) {
    if (this.playing) this.play(to);
    else this.pausedAt = to;
  }

  /** Peak level after the track's fader, 0..1. */
  level(i: number): number {
    const a = this.analysers[i];
    if (!a || !this.playing) return 0;
    a.getFloatTimeDomainData(this.scratch);
    let peak = 0;
    for (const v of this.scratch) peak = Math.max(peak, Math.abs(v));
    return Math.min(1, peak);
  }

  dispose() {
    this.pause();
    for (const g of this.gains) g.disconnect();
    for (const a of this.analysers) a.disconnect();
    if (TimelinePlayer.current === this) TimelinePlayer.current = null;
  }

  private stopSources() {
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        // already stopped
      }
      s.disconnect();
    }
    this.sources = [];
  }
}
