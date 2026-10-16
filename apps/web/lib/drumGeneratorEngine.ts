import { getAudioContext } from "./metronome";
import { drumSwingPoint } from "./bassGeniusEngine";
import { DEFAULT_DRUM_CONFIG, type DrumConfig, type DrumVoice } from "./drums";
import { playDrum } from "./drumSounds";
import { generateGroove, type DrumStyle, type GrooveBar, type GrooveOptions } from "./drumStyles";

// Plays Drum Generator: writes the groove 8 bars at a time (a little ahead of the music) and
// schedules each hit on the audio clock. Tempo changes apply at once (the clock re-anchors at the
// current beat); a new style or new options take over at the next bar line, rewriting what's
// ahead. A "beat" is the style's main beat (a quarter, or a dotted quarter in 12/8).

export const BLOCK_BARS = 8;

/** One written block: its bars, where it starts (performance beats) and the style it's in. */
export type DrumBlock = { start: number; style: DrumStyle; bars: GrooveBar[]; seed: number };

export type DrumGeneratorRun = {
  stop: () => void;
  setBpm: (bpm: number) => void;
  /** Switch style and/or options from the next bar line. */
  setGroove: (style: DrumStyle, opts: GrooveOptions) => void;
  setHumanize: (amount: number) => void;
  /** Each kit part's fader (a gain per voice, 1 = as recorded). */
  setVoiceGains: (gains: Partial<Record<DrumVoice, number>>) => void;
  /** Where the music is now: the performance beat (negative during the count-in). */
  position: () => number;
};

export type DrumGeneratorStart = {
  style: DrumStyle;
  opts: GrooveOptions;
  bpm: number;
  /** The first block's seed (so it plays what the preview showed); later blocks follow from it. */
  seed: number;
  countIn: boolean;
  /** 0–1: timing looseness and level variation. */
  humanize: number;
  voiceGains?: Partial<Record<DrumVoice, number>>;
  drumConfig?: DrumConfig;
  /** The blocks written so far (ahead of the music), each time one is added or rewritten. */
  onWrite: (blocks: DrumBlock[]) => void;
};

const TICK_MS = 25;
const LOOKAHEAD = 0.2;

/** The seed for a block of a run: the first is the run's own, so it matches the preview. */
export const blockSeed = (seed: number, block: number) => (block === 0 ? seed : (seed ^ Math.imul(block, 0x9e3779b1)) >>> 0);

/** `order`: when it sounds, in beats — a skip note is written on its whole beat but sounds about
    two thirds of the way through it, so it has to queue after the other hits on that beat (a
    queue in written order held the hi-hat and bass drum back behind it, making them late). */
type Pending = { order: number; beat: number; voice: Parameters<typeof playDrum>[1]; velocity: number; tone?: number; skip?: boolean; swing?: number; late?: number };

export function startDrumGenerator(opts: DrumGeneratorStart): DrumGeneratorRun {
  const ctx = getAudioContext();
  void ctx.resume();
  let bpm = opts.bpm;
  let style = opts.style;
  let grooveOpts = opts.opts;
  let humanize = opts.humanize;
  let gains = opts.voiceGains ?? {};
  const config = opts.drumConfig ?? DEFAULT_DRUM_CONFIG;
  const countIn = opts.countIn ? style.beats : 0;

  let anchorTime = ctx.currentTime + 0.12;
  let anchorBeat = -countIn;
  const timeOf = (beat: number) => anchorTime + ((beat - anchorBeat) * 60) / bpm;
  const beatAt = (time: number) => anchorBeat + ((time - anchorTime) * bpm) / 60;

  // Written blocks; `styleBar0` is the performance beat where the current style's bar 0 is (bar
  // numbers — for variations, fills and clave — count from there).
  const blocks: DrumBlock[] = [];
  let styleStart = 0;
  let blockCount = 0;
  let writtenTo = 0; // performance beat the writing has reached
  const queue: Pending[] = [];

  const write = () => {
    const bar = Math.round((writtenTo - styleStart) / style.beats);
    const seed = blockSeed(opts.seed, blockCount++);
    const bars = generateGroove(style, bar, BLOCK_BARS, seed, { ...grooveOpts, drumConfig: config });
    const start = writtenTo;
    for (const b of bars)
      for (const h of b.hits) {
        const beat = start + (h.beat - bar * style.beats);
        queue.push({ order: beat + (h.skip ? 0.5 + (h.swing ?? 0) : 0), beat, voice: h.voice, velocity: h.velocity, tone: h.tone, skip: h.skip, swing: h.swing, late: h.late });
      }
    queue.sort((a, b) => a.order - b.order);
    blocks.push({ start, style, bars: bars.map((b) => ({ ...b, bar: b.bar - bar })), seed });
    writtenTo = start + BLOCK_BARS * style.beats;
    opts.onWrite([...blocks]);
  };
  write();

  // Count-in: the closed hi-hat on each beat of one bar.
  for (let k = 0; k < countIn; k++) queue.unshift({ order: -countIn + k, beat: -countIn + k, voice: "hhClosed", velocity: k === 0 ? 0.75 : 0.55 });

  // One human offset per moment, shared by everything struck then.
  const feel = new Map<number, number>();
  const feelAt = (key: number) => {
    let f = feel.get(key);
    if (f === undefined) {
      f = (Math.random() - 0.5) * 2 * (0.012 * humanize);
      feel.set(key, f);
      if (feel.size > 512) feel.delete(feel.keys().next().value as number);
    }
    return f;
  };

  let stopped = false;
  const tick = () => {
    if (stopped) return;
    const horizon = ctx.currentTime + LOOKAHEAD;
    while (writtenTo - beatAt(horizon) < style.beats * 2) write();
    while (queue.length) {
      const h = queue[0];
      // A skip note is written on its whole beat; it sounds at the swing point after it.
      const swingPoint = h.skip ? drumSwingPoint("auto", bpm, config) + (h.swing ?? 0) : 0;
      const at = timeOf(h.beat + swingPoint);
      if (at > horizon) break;
      queue.shift();
      const key = Math.round(h.beat * 48);
      const time = at + (h.late ?? 0) + feelAt(key);
      const velocity = Math.max(0.03, Math.min(1, h.velocity * (1 + (Math.random() - 0.5) * 0.16 * humanize)));
      playDrum("sticks", h.voice, Math.max(ctx.currentTime, time), velocity, undefined, h.tone, gains[h.voice] ?? 1);
    }
  };
  const timer = setInterval(tick, TICK_MS);
  tick();

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
    setBpm: (next) => {
      const now = beatAt(ctx.currentTime);
      anchorTime = ctx.currentTime;
      anchorBeat = now;
      bpm = next;
    },
    setHumanize: (amount) => {
      humanize = amount;
    },
    setVoiceGains: (next) => {
      gains = next;
    },
    setGroove: (nextStyle, nextOpts) => {
      // From the next bar line of what's playing now (or the start, during the count-in).
      const now = Math.max(0, beatAt(ctx.currentTime + LOOKAHEAD));
      const sinceStyle = now - styleStart;
      const cut = styleStart + Math.ceil((sinceStyle + 1e-6) / style.beats) * style.beats;
      for (let i = queue.length - 1; i >= 0; i--) if (queue[i].beat >= cut - 1e-6) queue.splice(i, 1);
      // Keep the written bars before the cut.
      while (blocks.length && blocks[blocks.length - 1].start >= cut - 1e-6) blocks.pop();
      const last = blocks[blocks.length - 1];
      if (last) {
        const keep = Math.round((cut - last.start) / last.style.beats);
        if (keep < last.bars.length) blocks[blocks.length - 1] = { ...last, bars: last.bars.slice(0, keep) };
      }
      if (nextStyle.id !== style.id) styleStart = cut;
      style = nextStyle;
      grooveOpts = nextOpts;
      writtenTo = cut;
      write();
    },
    position: () => beatAt(ctx.currentTime),
  };
}
