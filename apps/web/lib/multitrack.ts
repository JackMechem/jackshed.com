import { scheduleClick } from "@/lib/clickEngine";
import { getAudioContext } from "@/lib/metronome";

/** A piece of audio on a track. */
export type EngineClip = {
  id: string;
  buffer: AudioBuffer;
  /** Where the clip starts on the timeline, in seconds (can be slightly negative). */
  offset: number;
  /** The part of the buffer that plays (seconds into the buffer). */
  trimStart: number;
  trimEnd: number;
  /** When set, the clip repeats until this timeline position. */
  repeatEnd: number | null;
};

export type EngineTrack = {
  id: string;
  clips: EngineClip[];
  volume: number;
  muted: boolean;
  solo: boolean;
};

type ClipTiming = Pick<EngineClip, "offset" | "trimStart" | "trimEnd" | "repeatEnd">;

export function clipLength(clip: Pick<EngineClip, "trimStart" | "trimEnd">): number {
  return Math.max(0.001, clip.trimEnd - clip.trimStart);
}

/** Where a clip stops on the timeline, including any repeats. */
export function trackEndTime(clip: ClipTiming): number {
  return clip.repeatEnd !== null
    ? Math.max(clip.repeatEnd, clip.offset + 0.01)
    : clip.offset + clipLength(clip);
}

export type MetronomeConfig = {
  enabled: boolean;
  bpm: number;
  beatsPerBar: number;
  volume: number;
};

export type PlayOptions = {
  /** Seconds of count-in before `from` (the metronome clicks through it). */
  preRoll?: number;
  /** Timeline position of beat 1 of a bar; clicks are laid out from here. */
  gridOrigin?: number;
  /** Keep playing past the end of the existing tracks (used while recording). */
  openEnded?: boolean;
  /** Play only the metronome, not the recorded tracks. */
  tracksOff?: boolean;
};

type Segment = {
  ctxStart: number;
  songStart: number;
  songEnd: number;
  /** Index of the next metronome click to schedule in this segment. */
  clickK: number;
};

const LOOKAHEAD = 0.3;
const TICK_MS = 40;
const START_DELAY = 0.06;

function clipsChanged(a: EngineClip[], b: EngineClip[]): boolean {
  if (a.length !== b.length) return true;
  return a.some((clip, i) => {
    const other = b[i];
    return (
      clip.id !== other.id ||
      clip.buffer !== other.buffer ||
      clip.offset !== other.offset ||
      clip.trimStart !== other.trimStart ||
      clip.trimEnd !== other.trimEnd ||
      clip.repeatEnd !== other.repeatEnd
    );
  });
}

function audible(track: EngineTrack, anySolo: boolean) {
  return !track.muted && (!anySolo || track.solo);
}

/**
 * Sample-accurate multitrack player with loop and metronome. Playback is scheduled ahead of
 * time on the Web Audio clock, so tracks stay in sync and loops are gapless.
 */
export class Engine {
  private ctx = getAudioContext();
  private master = this.ctx.createGain();
  private tracks = new Map<
    string,
    { track: EngineTrack; gain: GainNode; analyser: AnalyserNode }
  >();
  private levelBuffer = new Float32Array(1024);
  private segments: Segment[] = [];
  private sources = new Set<AudioScheduledSourceNode>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private playing = false;
  private pausedTime = 0;
  private loop: { start: number; end: number } | null = null;
  private metronome: MetronomeConfig = { enabled: false, bpm: 100, beatsPerBar: 4, volume: 0.6 };
  private gridOrigin = 0;
  private duration = 0;
  private fixedEnd = 0;
  private tracksOff = false;
  private nextCtx = 0;
  private startCtx = 0;
  private nextSong = 0;

  onEnded: (() => void) | null = null;

  constructor() {
    this.master.connect(this.ctx.destination);
  }

  /** Audio-clock time at which the current play() began (song time `from - preRoll`). */
  get startTime() {
    return this.startCtx;
  }

  /** Peak level (0–1) currently coming out of a track, after its fader, mute and solo. */
  getLevel(id: string): number {
    const entry = this.tracks.get(id);
    if (!entry) return 0;
    entry.analyser.getFloatTimeDomainData(this.levelBuffer);
    let peak = 0;
    for (let i = 0; i < this.levelBuffer.length; i++) {
      peak = Math.max(peak, Math.abs(this.levelBuffer[i]));
    }
    return peak;
  }

  get isPlaying() {
    return this.playing;
  }

  setMasterVolume(volume: number) {
    this.master.gain.setTargetAtTime(volume, this.ctx.currentTime, 0.01);
  }

  setDuration(duration: number) {
    this.duration = duration;
  }

  setTracks(list: EngineTrack[]) {
    let restart = false;
    const ids = new Set(list.map((t) => t.id));
    for (const [id, entry] of this.tracks) {
      if (!ids.has(id)) {
        entry.gain.disconnect();
        entry.analyser.disconnect();
        this.tracks.delete(id);
        restart = true;
      }
    }
    for (const track of list) {
      const existing = this.tracks.get(track.id);
      if (!existing) {
        const gain = this.ctx.createGain();
        gain.connect(this.master);
        // A tap on the track after its fader, for the level meter.
        const analyser = this.ctx.createAnalyser();
        analyser.fftSize = 1024;
        gain.connect(analyser);
        this.tracks.set(track.id, { track, gain, analyser });
        restart = true;
      } else {
        if (clipsChanged(existing.track.clips, track.clips)) restart = true;
        existing.track = track;
      }
    }
    this.applyGains();
    if (restart) this.restart();
  }

  setLoop(loop: { start: number; end: number } | null) {
    const same =
      (!loop && !this.loop) ||
      (loop && this.loop && loop.start === this.loop.start && loop.end === this.loop.end);
    this.loop = loop;
    if (!same) this.restart();
  }

  setMetronome(config: MetronomeConfig) {
    const m = this.metronome;
    const changed =
      m.enabled !== config.enabled || m.bpm !== config.bpm || m.beatsPerBar !== config.beatsPerBar;
    this.metronome = config;
    if (changed) this.restart();
  }

  private applyGains() {
    const anySolo = [...this.tracks.values()].some((e) => e.track.solo);
    for (const { track, gain } of this.tracks.values()) {
      const level = audible(track, anySolo) ? track.volume : 0;
      gain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.01);
    }
  }

  /** Current timeline position in seconds (negative during a count-in). */
  getTime(): number {
    if (!this.playing) return this.pausedTime;
    const now = this.ctx.currentTime;
    let current: Segment | null = null;
    for (const seg of this.segments) if (seg.ctxStart <= now) current = seg;
    if (!current) return this.segments[0]?.songStart ?? this.pausedTime;
    return Math.min(current.songEnd, current.songStart + (now - current.ctxStart));
  }

  play(from: number, options: PlayOptions = {}) {
    this.halt();
    if (this.ctx.state === "suspended") void this.ctx.resume();
    const { preRoll = 0, gridOrigin = 0, openEnded = false, tracksOff = false } = options;
    this.tracksOff = tracksOff;
    this.gridOrigin = gridOrigin;
    this.fixedEnd = openEnded ? Infinity : this.duration;
    this.playing = true;
    this.segments = [];
    this.nextCtx = this.ctx.currentTime + START_DELAY;
    this.startCtx = this.nextCtx;
    this.nextSong = from - preRoll;
    this.pump();
    if (this.playing) this.timer = setInterval(() => this.pump(), TICK_MS);
  }

  pause(): number {
    const t = Math.max(0, this.getTime());
    this.halt();
    this.playing = false;
    this.pausedTime = t;
    return t;
  }

  seek(t: number) {
    if (this.playing) {
      const openEnded = this.fixedEnd === Infinity;
      this.play(t, { gridOrigin: this.gridOrigin, openEnded, tracksOff: this.tracksOff });
    } else {
      this.pausedTime = t;
    }
  }

  private restart() {
    if (!this.playing) return;
    const openEnded = this.fixedEnd === Infinity;
    this.play(Math.max(0, this.getTime()), {
      gridOrigin: this.gridOrigin,
      openEnded,
      tracksOff: this.tracksOff,
    });
  }

  private halt() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    this.sources.clear();
    this.segments = [];
  }

  private finish() {
    const end = Number.isFinite(this.fixedEnd) ? this.fixedEnd : this.getTime();
    this.halt();
    this.playing = false;
    this.pausedTime = Math.max(0, end);
    this.onEnded?.();
  }

  private pump() {
    const ctx = this.ctx;
    const now = ctx.currentTime;

    while (this.nextCtx < now + LOOKAHEAD) {
      const a = this.nextSong;
      const loop = this.loop;
      const wraps = loop !== null && a < loop.end;
      const b = wraps ? loop!.end : this.fixedEnd;
      if (b <= a) {
        if (now >= this.nextCtx) {
          this.finish();
          return;
        }
        break;
      }
      const beat = 60 / this.metronome.bpm;
      const segment: Segment = {
        ctxStart: this.nextCtx,
        songStart: a,
        songEnd: b,
        clickK: Math.ceil((a - this.gridOrigin) / beat - 1e-9),
      };
      this.segments.push(segment);
      this.scheduleTracks(segment);
      this.nextCtx += b - a;
      this.nextSong = wraps ? loop!.start : b;
      if (!Number.isFinite(this.nextCtx)) break;
    }

    if (this.metronome.enabled) this.scheduleClicks(now);

    this.segments = this.segments.filter((s) => s.ctxStart + (s.songEnd - s.songStart) > now - 1);
  }

  private scheduleTracks(seg: Segment) {
    if (this.tracksOff) return;
    for (const { track, gain } of this.tracks.values()) {
      for (const clip of track.clips) {
        const length = clipLength(clip);
        const end = trackEndTime(clip);
        const from = Math.max(seg.songStart, clip.offset);
        const to = Math.min(seg.songEnd, end);
        if (to <= from) continue;
        // One source per repetition of the clip that falls inside this segment.
        for (let k = Math.floor((from - clip.offset) / length + 1e-9); ; k++) {
          const iterStart = clip.offset + k * length;
          if (iterStart >= to) break;
          const start = Math.max(iterStart, from);
          const stop = Math.min(iterStart + length, end, to);
          if (stop <= start) continue;
          const source = this.ctx.createBufferSource();
          source.buffer = clip.buffer;
          source.connect(gain);
          source.start(
            seg.ctxStart + (start - seg.songStart),
            clip.trimStart + (start - iterStart),
            stop - start,
          );
          this.sources.add(source);
          source.onended = () => this.sources.delete(source);
        }
      }
    }
  }

  private scheduleClicks(now: number) {
    const { bpm, beatsPerBar, volume } = this.metronome;
    const beat = 60 / bpm;
    const horizon = now + LOOKAHEAD;
    for (const seg of this.segments) {
      if (seg.ctxStart > horizon) continue;
      const horizonSong = Math.min(seg.songEnd, seg.songStart + (horizon - seg.ctxStart));
      for (;;) {
        const song = this.gridOrigin + seg.clickK * beat;
        if (song >= horizonSong) break;
        const when = seg.ctxStart + (song - seg.songStart);
        if (when >= now - 0.005) {
          const downbeat = ((seg.clickK % beatsPerBar) + beatsPerBar) % beatsPerBar === 0;
          const osc = scheduleClick(
            this.ctx,
            Math.max(when, now),
            "sine",
            downbeat ? 1500 : 900,
            (downbeat ? 0.9 : 0.55) * volume,
            0.06,
          );
          this.sources.add(osc);
          osc.onended = () => this.sources.delete(osc);
        }
        seg.clickK++;
      }
    }
  }

  dispose() {
    this.halt();
    this.playing = false;
    this.master.disconnect();
    for (const { gain, analyser } of this.tracks.values()) {
      gain.disconnect();
      analyser.disconnect();
    }
    this.tracks.clear();
  }
}

/** Renders the audible tracks between `start` and `end` (seconds) into one stereo buffer. */
export async function renderMixdown(
  tracks: EngineTrack[],
  start: number,
  end: number,
): Promise<AudioBuffer> {
  const sampleRate = tracks.flatMap((t) => t.clips)[0]?.buffer.sampleRate ?? 44100;
  const length = Math.max(1, Math.ceil((end - start) * sampleRate));
  const offline = new OfflineAudioContext(2, length, sampleRate);
  const anySolo = tracks.some((t) => t.solo);

  for (const track of tracks) {
    if (!audible(track, anySolo)) continue;
    const gain = offline.createGain();
    gain.gain.value = track.volume;
    gain.connect(offline.destination);
    for (const clip of track.clips) {
      const length = clipLength(clip);
      const clipEnd = trackEndTime(clip);
      const from = Math.max(start, clip.offset);
      const to = Math.min(end, clipEnd);
      if (to <= from) continue;
      for (let k = Math.floor((from - clip.offset) / length + 1e-9); ; k++) {
        const iterStart = clip.offset + k * length;
        if (iterStart >= to) break;
        const begin = Math.max(iterStart, from);
        const stop = Math.min(iterStart + length, clipEnd, to);
        if (stop <= begin) continue;
        const source = offline.createBufferSource();
        source.buffer = clip.buffer;
        source.connect(gain);
        source.start(begin - start, clip.trimStart + (begin - iterStart), stop - begin);
      }
    }
  }
  return offline.startRendering();
}
