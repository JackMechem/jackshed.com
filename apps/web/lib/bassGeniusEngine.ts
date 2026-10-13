import { scheduleClick } from "./clickEngine";
import { getAudioContext } from "./metronome";
import {
  chartHarmony,
  generateChorus,
  initialBassState,
  playbackOrder,
  type BassLineOptions,
  type BassLineState,
  type BassNote,
  type PerformedBeat,
} from "./bassLine";
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
  /** Swap in a changed chart (an edited typed progression): it takes over from the next chorus
      written, the one already scheduled finishes as it was. */
  setSong: (song: IRealSong) => void;
};

export type BassGeniusStartOptions = {
  song: IRealSong;
  line: BassLineOptions;
  bpm: number;
  /** How many times through the form; 0 = keep going until stopped. */
  choruses: number;
  countIn: boolean;
  click: boolean;
  /** Fires as each beat is heard: its index in the performance (negative during the count-in). */
  onBeat: (beat: number, info: PerformedBeat | null) => void;
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
    const { chorus, state: next } = generateChorus(song, opts.line, state, written, beats.length, isLast, harmony);
    state = next;
    notes.push(...chorus.notes);
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
      const swing = (Math.random() - 0.5) * 0.012; // a few ms either way, so it breathes
      const start = timeOf(n.beat) + (n.beat > 0 ? swing : 0);
      const length = (n.length * 60) / bpm;
      const last = finished && nextNote === notes.length;
      playUprightBassNote(n.midi, start, last ? length + 1.5 : length + 0.015, n.velocity, n.ghost);
    }

    while (timeOf(nextBeat) < horizon && nextBeat < beats.length) {
      const b = nextBeat++;
      const at = timeOf(b);
      if (b < 0) {
        scheduleClick(ctx, at, "triangle", b === -countIn ? 1600 : 1100, 0.35, 0.05);
      } else {
        const info = beats[b];
        if (click && info && info.beatsInBar % 2 === 0 && info.beatInBar % 2 === 1) {
          scheduleClick(ctx, at, "square", 5200, 0.05, 0.03);
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
    setSong(next: IRealSong) {
      song = next;
      harmony = chartHarmony(next);
    },
  };
}
