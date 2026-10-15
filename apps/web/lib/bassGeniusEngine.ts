import { scheduleClick } from "./clickEngine";
import { getAudioContext } from "./metronome";
import {
  chartHarmony,
  generateChorus,
  initialBassState,
  playbackOrder,
  type BassLineOptions,
  type BassLineState,
  type BassPhrase,
  type BassNote,
  type PerformedBeat,
} from "./bassLine";
import { generateLearnedChorus, type StyleModel } from "./bassLearned";
import { makePlayable } from "./bassPlayable";
import { compChorus, type CompEvent, type CompStyle } from "./comping";
import { compReady, playCompNote, type CompInstrument } from "./compSounds";
import { DEFAULT_DRUM_CONFIG, drumChorus, drumSkipPoint, type DrumConfig, type DrumHit, type DrumKit } from "./drums";
import { drumsReady, playDrum } from "./drumSounds";
import { generateStyledChorus, type BassStyle } from "./bassStyle";
import type { IRealSong } from "./iRealPro";
import { playUprightBassNote } from "./uprightBass";

// Plays a Bass Genius performance: writes the line a chorus at a time (`generateChorus`, one
// chorus ahead of the music, so "keep going" can run forever and every chorus is different) and
// schedules it on the audio clock a little ahead of time. Tempo can change while it plays (the
// clock re-anchors at the current beat). An optional count-in bar and a soft click on 2 and 4.

export type BassGeniusRun = {
  stop: () => void;
  setBpm: (bpm: number) => void;
  setClick: (on: boolean) => void;
  /** Hi-hat click level, 0–1. */
  setClickVolume: (volume: number) => void;
  setSwing: (swing: BassSwing) => void;
  /** Chords under the bass (null = off); takes effect from the next chord played. */
  setComp: (comp: { instrument: CompInstrument; style: CompStyle } | null) => void;
  /** A drummer (null = none); takes effect from the next hit. */
  setDrums: (kit: DrumKit | null) => void;
  /** Drums comping (snare chatter, section accents) or just time. */
  setDrumsComping: (on: boolean) => void;
  /** How the drummer plays: swing, lay back and timing apply at once, patterns from the next chorus. */
  setDrumConfig: (config: DrumConfig) => void;
  /** Swap in a changed chart (an edited typed progression): it takes over from the next chorus
      written, the one already scheduled finishes as it was. */
  setSong: (song: IRealSong) => void;
};

/** How far the off-beat eighths are pushed: "auto" follows the tempo. */
export type BassSwing = "straight" | "auto" | "light" | "hard";

/** Where the off-beat eighth lands, as a fraction of the beat (0.5 = straight, 2/3 = triplet). */
export function swingPoint(swing: BassSwing, bpm: number): number {
  // Long-to-short ratio: about triplet swing up to medium tempos, flattening out as it gets fast.
  const ratio =
    swing === "straight" ? 1 : swing === "light" ? 1.5 : swing === "hard" ? 2.3 : Math.max(1.15, Math.min(2, 2 - ((bpm - 140) * 0.8) / 160));
  return ratio / (1 + ratio);
}

/** Where the drummer's skip note falls (fraction of the beat): the drum settings' swing (easing
    at fast tempos if set), nudged by the Swing setting — lighter or harder; straight is straight. */
export function drumSwingPoint(swing: BassSwing, bpm: number, config: DrumConfig = DEFAULT_DRUM_CONFIG): number {
  const base = drumSkipPoint(config, bpm, swing === "straight");
  return swing === "light" ? Math.max(0.5, base - 0.05) : swing === "hard" ? Math.min(0.8, base + 0.03) : base;
}

export type BassGeniusStartOptions = {
  song: IRealSong;
  line: BassLineOptions;
  /** A modelled player's analysed transcriptions; null = the Computer. */
  style?: BassStyle | null;
  /** The same player's habits, for "learn their style" (`line.styleMode === "learn"`). */
  model?: StyleModel | null;
  bpm: number;
  /** How many times through the form; 0 = keep going until stopped. */
  choruses: number;
  countIn: boolean;
  click: boolean;
  clickVolume?: number;
  swing: BassSwing;
  comp: { instrument: CompInstrument; style: CompStyle } | null;
  drums?: DrumKit | null;
  drumsComping?: boolean;
  drumConfig?: DrumConfig;
  /** Fires as each beat is heard: its index in the performance (negative during the count-in). */
  onBeat: (beat: number, info: PerformedBeat | null) => void;
  /** Each chorus as soon as it's written (ahead of the music): its notes and beats, and the
      performance beat it starts on. */
  onWrite?: (chorus: number, notes: BassNote[], beats: PerformedBeat[], startBeat: number, phrases: BassPhrase[]) => void;
  onEnd: () => void;
};

const TICK_MS = 25;
const LOOKAHEAD = 0.2;

export function startBassGenius(opts: BassGeniusStartOptions): BassGeniusRun {
  const ctx = getAudioContext();
  void ctx.resume();
  let song = opts.song;
  let harmony = chartHarmony(song);
  const firstBeats = harmony[playbackOrder(opts.song.bars, false)[0] ?? 0]?.beats ?? 4;
  const countIn = opts.countIn ? firstBeats : 0;

  let bpm = opts.bpm;
  let click = opts.click;
  let clickVolume = opts.clickVolume ?? 0.6;
  let swing = opts.swing;
  let comp = opts.comp;
  let drums = opts.drums ?? null;
  // Drums are written for both kits every chorus, so switching kit (or turning them on) mid-tune
  // just picks from what's there.
  let drumsComping = opts.drumsComping ?? false;
  let drumConfig = opts.drumConfig ?? DEFAULT_DRUM_CONFIG;
  // Written both ways (time only / comping) every chorus, so the option can change mid-tune.
  const drumHits: Record<"time" | "comp", DrumHit[]> = { time: [], comp: [] };
  const nextDrum: Record<"time" | "comp", number> = { time: 0, comp: 0 };
  const sectionBars = () => new Set(song.bars.map((b, i) => (b.section ? i : -1)).filter((i) => i >= 0));
  // One human offset per moment, shared by every drum struck then, so the hi-hat foot, ride and
  // kick on a beat stay locked together.
  const feel = new Map<number, number>();
  const feelAt = (time: number) => {
    const key = Math.round(time * 1000);
    let f = feel.get(key);
    if (f === undefined) {
      f = (Math.random() - 0.5) * 2 * (drumConfig.timingMs / 1000);
      feel.set(key, f);
      if (feel.size > 256) feel.delete(feel.keys().next().value as number);
    }
    return f;
  };
  // Comping is written for every chorus in both styles, so switching style or turning it on mid-way
  // just picks from what's there.
  const comps: Record<CompStyle, CompEvent[]> = { comp: [], sustain: [] };
  const nextComp: Record<CompStyle, number> = { comp: 0, sustain: 0 };
  let lastVoicing: Record<CompStyle, number[] | null> = { comp: null, sustain: null };
  /** Swings a point in time: an off-beat eighth ("and") moves late; everything else (beats,
      triplets, sixteenths) stays put. */
  const swung = (beat: number) => {
    const whole = Math.floor(beat + 1e-6);
    return Math.abs(beat - whole - 0.5) < 1e-6 ? whole + swingPoint(swing, bpm) : beat;
  };
  // Beat `anchorBeat` (performance beats; the count-in is negative) sounds at `anchorTime`.
  let anchorTime = ctx.currentTime + 0.12;
  let anchorBeat = -countIn;
  const timeOf = (beat: number) => anchorTime + ((beat - anchorBeat) * 60) / bpm;
  const beatAt = (time: number) => anchorBeat + ((time - anchorTime) * bpm) / 60;

  const notes: BassNote[] = [];
  const beats: PerformedBeat[] = [];
  let state: BassLineState = initialBassState();
  let written = 0; // choruses written so far
  let finished = false; // the last chorus has been written
  const writeChorus = () => {
    const isLast = opts.choruses > 0 && written === opts.choruses - 1;
    const { chorus, state: next } =
      opts.line.styleMode === "learn" && opts.model
        ? generateLearnedChorus(song, opts.line, opts.model, state, written, beats.length, isLast, harmony)
        : opts.style
          ? generateStyledChorus(song, opts.line, opts.style, state, written, beats.length, isLast, harmony)
          : generateChorus(song, opts.line, state, written, beats.length, isLast, harmony);
    state = next;
    // Whatever wrote it, it has to be playable on an upright at this tempo.
    const playable = makePlayable(chorus.notes, bpm, notes[notes.length - 1] ?? null).notes;
    const last = playable[playable.length - 1];
    if (last && !last.ghost) state = { ...state, lastNote: last.midi };
    opts.onWrite?.(written, playable, chorus.beats, beats.length, chorus.phrases ?? []);
    for (const way of ["time", "comp"] as const)
      drumHits[way].push(
        ...drumChorus(chorus.beats, beats.length, "sticks", state.seed ^ 0x3d, { chorus: written, isLast, comping: way === "comp", sectionBars: sectionBars(), config: drumConfig }),
      );
    for (const style of ["comp", "sustain"] as const) {
      const c = compChorus(chorus.beats, beats.length, style, state.seed ^ (style === "comp" ? 0x51 : 0x77), lastVoicing[style]);
      comps[style].push(...c.events);
      lastVoicing = { ...lastVoicing, [style]: c.last };
    }
    notes.push(...playable);
    beats.push(...chorus.beats);
    written += 1;
    if (isLast) finished = true;
  };
  writeChorus();

  let nextNote = 0;
  let nextBeat = -countIn; // next beat to schedule clicks/UI for
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let stopped = false;

  const later = (fn: () => void, at: number) => {
    const t = setTimeout(() => {
      timers.delete(t);
      if (!stopped) fn();
    }, Math.max(0, (at - ctx.currentTime) * 1000));
    timers.add(t);
  };

  const tick = () => {
    const horizon = ctx.currentTime + LOOKAHEAD;
    // Keep at least two bars written ahead.
    while (!finished && beats.length - Math.max(0, Math.ceil(beatAt(horizon))) < 8) writeChorus();

    while (nextNote < notes.length && timeOf(notes[nextNote].beat) < horizon) {
      const n = notes[nextNote++];
      const jitter = (Math.random() - 0.5) * 0.012; // a few ms either way, so it breathes
      const startBeat = swung(n.beat);
      const start = timeOf(startBeat) + (n.beat > 0 ? jitter : 0);
      const length = ((swung(n.beat + n.length) - startBeat) * 60) / bpm;
      const last = finished && nextNote === notes.length;
      playUprightBassNote(n.midi, start, last ? length + 1.5 : length + 0.015, n.velocity, n.ghost);
    }

    for (const style of ["comp", "sustain"] as const) {
      const list = comps[style];
      while (nextComp[style] < list.length && timeOf(swung(list[nextComp[style]].beat)) < horizon) {
        const e = list[nextComp[style]++];
        if (!comp || comp.style !== style || !compReady(comp.instrument)) continue;
        const start = timeOf(swung(e.beat));
        const seconds = timeOf(swung(e.beat + e.length)) - start;
        // A hair of spread, like real fingers, bottom note first.
        e.midis.forEach((m, i) => playCompNote(comp!.instrument, m, start + i * 0.006 + Math.random() * 0.004, seconds, e.velocity));
      }
    }

    for (const way of ["time", "comp"] as const) {
      const list = drumHits[way];
      while (nextDrum[way] < list.length && timeOf(swung(list[nextDrum[way]].beat)) < horizon) {
        const h = list[nextDrum[way]++];
        const kit = drums;
        if (!kit || (way === "comp") !== drumsComping || !drumsReady(kit)) continue;
        const where = h.skip
          ? h.beat + (swing === "straight" ? 0.5 : Math.max(0.52, Math.min(0.82, drumSwingPoint(swing, bpm, drumConfig) + (h.swing ?? 0))))
          : swung(h.beat);
        // A human touch shared by the beat, plus any laid-back lag.
        const start = timeOf(where) + feelAt(timeOf(where)) + (h.late !== undefined ? drumConfig.layBackMs / 1000 : 0);
        const seconds = h.length !== undefined ? timeOf(swung(h.beat + h.length)) - timeOf(swung(h.beat)) + 0.15 : undefined;
        playDrum(kit, h.voice, start, h.velocity, seconds, h.tone);
      }
    }

    while (timeOf(nextBeat) < horizon && nextBeat < beats.length) {
      const b = nextBeat++;
      const at = timeOf(b);
      if (b < 0) {
        scheduleClick(ctx, at, "triangle", b === -countIn ? 1600 : 1100, 0.35, 0.05);
      } else {
        const info = beats[b];
        if (click && !drums && info && info.beatsInBar % 2 === 0 && info.beatInBar % 2 === 1) {
          if (clickVolume > 0) scheduleClick(ctx, at, "square", 5200, 0.085 * clickVolume, 0.03);
        }
      }
      later(() => opts.onBeat(b, b >= 0 ? (beats[b] ?? null) : null), at);
    }

    if (finished && nextNote >= notes.length && nextBeat >= beats.length) {
      clearInterval(interval);
      later(() => {
        stopped = true;
        opts.onEnd();
      }, timeOf(beats.length) + 1.5);
    }
  };
  const interval = setInterval(tick, TICK_MS);
  tick();

  return {
    stop() {
      stopped = true;
      clearInterval(interval);
      for (const t of timers) clearTimeout(t);
      timers.clear();
    },
    setBpm(next: number) {
      if (next === bpm) return;
      const now = ctx.currentTime + LOOKAHEAD; // everything before this is already scheduled
      anchorBeat = beatAt(now);
      anchorTime = now;
      bpm = next;
    },
    setClick(on: boolean) {
      click = on;
    },
    setClickVolume(v: number) {
      clickVolume = v;
    },
    setSwing(next: BassSwing) {
      swing = next;
    },
    setComp(next) {
      comp = next;
    },
    setDrums(next) {
      drums = next;
    },
    setDrumsComping(on: boolean) {
      drumsComping = on;
    },
    setDrumConfig(next: DrumConfig) {
      drumConfig = next;
    },
    setSong(next: IRealSong) {
      song = next;
      harmony = chartHarmony(next);
    },
  };
}
