import { midiToNote, type ParsedRange } from "@/lib/noteRange";

export type IntervalDef = {
  id: string;
  /** Full name shown throughout the UI (the main display, results, history). */
  label: string;
  semitones: number;
};

/** The twelve intervals within an octave. All enabled by default — unlike Scale Trainer's 24
    modes, this is a small enough set that curating a "starter subset" isn't worth the friction of
    everything else starting off unavailable. */
export const INTERVALS: IntervalDef[] = [
  { id: "m2", label: "Minor 2nd", semitones: 1 },
  { id: "M2", label: "Major 2nd", semitones: 2 },
  { id: "m3", label: "Minor 3rd", semitones: 3 },
  { id: "M3", label: "Major 3rd", semitones: 4 },
  { id: "P4", label: "Perfect 4th", semitones: 5 },
  { id: "TT", label: "Tritone", semitones: 6 },
  { id: "P5", label: "Perfect 5th", semitones: 7 },
  { id: "m6", label: "Minor 6th", semitones: 8 },
  { id: "M6", label: "Major 6th", semitones: 9 },
  { id: "m7", label: "Minor 7th", semitones: 10 },
  { id: "M7", label: "Major 7th", semitones: 11 },
  { id: "P8", label: "Octave", semitones: 12 },
];

export const DEFAULT_ENABLED_INTERVAL_IDS = INTERVALS.map((i) => i.id);

/** 1 = ascending (the target is above the start), -1 = descending. */
export type Direction = 1 | -1;

export type IntervalRound = {
  interval: IntervalDef;
  direction: Direction;
  startMidi: number;
  /** [start, target], the order they need to be played in. */
  notes: string[];
};

function buildRound(
  startMidi: number,
  interval: IntervalDef,
  direction: Direction,
): IntervalRound {
  const targetMidi = startMidi + interval.semitones * direction;
  return {
    interval,
    direction,
    startMidi,
    notes: [midiToNote(startMidi), midiToNote(targetMidi)],
  };
}

function randomStartMidi(range: ParsedRange): number {
  return range.lowMidi + Math.floor(Math.random() * (range.highMidi - range.lowMidi + 1));
}

/** Every interval+direction from `pool`/`directions` whose target note still lands in `range`. */
function validChoices(
  startMidi: number,
  range: ParsedRange,
  pool: IntervalDef[],
  directions: Direction[],
): { interval: IntervalDef; direction: Direction }[] {
  const choices: { interval: IntervalDef; direction: Direction }[] = [];
  for (const interval of pool) {
    for (const direction of directions) {
      const target = startMidi + interval.semitones * direction;
      if (target >= range.lowMidi && target <= range.highMidi) {
        choices.push({ interval, direction });
      }
    }
  }
  return choices;
}

/** A fresh round from a brand-new random starting note. Retries a handful of times for a start
    that actually has a valid interval+direction in range before falling back to anchoring at the
    bottom of the range and trying both directions regardless of the `directions` setting (since
    every instrument range here is comfortably wider than a single interval, this fallback should
    only ever matter for a pathologically narrow custom range). */
export function randomIntervalRound(
  range: ParsedRange,
  pool: IntervalDef[],
  directions: Direction[],
): IntervalRound {
  for (let attempt = 0; attempt < 20; attempt++) {
    const start = randomStartMidi(range);
    const choices = validChoices(start, range, pool, directions);
    if (choices.length > 0) {
      const picked = choices[Math.floor(Math.random() * choices.length)];
      return buildRound(start, picked.interval, picked.direction);
    }
  }
  const start = range.lowMidi;
  const choices = validChoices(start, range, pool, [1, -1]);
  const picked = choices[0] ?? { interval: pool[0], direction: 1 as Direction };
  return buildRound(start, picked.interval, picked.direction);
}

/** The next round in a chain: starts exactly where `fromMidi` (the previous round's target) left
    off, so the interval continues relative to the note just reached rather than a fresh root. The
    starting note is still always shown/announced (`roundLabel` in the component doesn't special-case
    this) — a chain runs silently through several rounds, so losing track of where you are after one
    wrong note would otherwise leave you stuck with no way to recover mid-session. Falls back to a
    brand-new random round if the chain's run out of room to go anywhere from here without leaving
    the range. */
export function chainedIntervalRound(
  fromMidi: number,
  range: ParsedRange,
  pool: IntervalDef[],
  directions: Direction[],
): IntervalRound {
  const choices = validChoices(fromMidi, range, pool, directions);
  if (choices.length === 0) return randomIntervalRound(range, pool, directions);
  const picked = choices[Math.floor(Math.random() * choices.length)];
  return buildRound(fromMidi, picked.interval, picked.direction);
}

/** Every octave of `pitchClass` (0 = C, 1 = C#, …) whose start note *and* its target (this
    specific interval, this specific direction) both fit in the range. */
function rootCandidatesForPitchClass(
  range: ParsedRange,
  pitchClass: number,
  interval: IntervalDef,
  direction: Direction,
): number[] {
  const lo = direction === 1 ? range.lowMidi : range.lowMidi + interval.semitones;
  const hi = direction === 1 ? range.highMidi - interval.semitones : range.highMidi;
  if (hi < lo) return [];
  const first = lo + ((((pitchClass - lo) % 12) + 12) % 12);
  const candidates: number[] = [];
  for (let midi = first; midi <= hi; midi += 12) candidates.push(midi);
  return candidates;
}

/** A round starting on this exact key (pitch class), in a random octave that fits — or null if
    no octave of it fits this interval/direction/range combination at all. */
export function intervalRoundForPitchClass(
  range: ParsedRange,
  interval: IntervalDef,
  direction: Direction,
  pitchClass: number,
): IntervalRound | null {
  const candidates = rootCandidatesForPitchClass(range, pitchClass, interval, direction);
  if (candidates.length === 0) return null;
  const start = candidates[Math.floor(Math.random() * candidates.length)];
  return buildRound(start, interval, direction);
}

/** The full drill: every selected interval, in every selected direction, starting on all 12 keys
    (each its own random octave) — the exhaustive "Drill every interval" sweep. A key that simply
    doesn't fit an interval/direction anywhere in the range (e.g. a narrow custom range and a big
    interval) is left out rather than forcing an invalid round. Unshuffled — callers that want a
    random order shuffle it themselves. */
export function drillQueueForPool(
  range: ParsedRange,
  pool: IntervalDef[],
  directions: Direction[],
): IntervalRound[] {
  const rounds: IntervalRound[] = [];
  for (const interval of pool) {
    for (const direction of directions) {
      for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
        const round = intervalRoundForPitchClass(range, interval, direction, pitchClass);
        if (round) rounds.push(round);
      }
    }
  }
  return rounds;
}

/** The bare pitch class (0-11) a MIDI note belongs to — used for requeuing a drill miss (like
    Scale Trainer's `scaleRoundForPitchClass`) and for the struggle-stat key. */
export function pitchClassOf(midi: number): number {
  return ((midi % 12) + 12) % 12;
}
