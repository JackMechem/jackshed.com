import { midiToNote, type ParsedRange } from "@/lib/noteRange";

export type ScaleMode = {
  id: string;
  /** Short name shown throughout the UI (the main display, results, history). */
  label: string;
  /** A longer/alternate name, shown as a tooltip where there's room. */
  aka?: string;
  category: string;
  /** Semitone offsets from the root, ascending, root included. The octave above the root is
      appended separately (see `scaleSequence`) so every mode ends on its own root an octave up. */
  intervals: number[];
};

/** Display order for the category groupings in the scale picker. */
export const SCALE_CATEGORIES = [
  "Major scale modes",
  "Minor scales",
  "Pentatonic & blues",
  "Melodic minor modes",
  "Symmetric scales",
] as const;

export const SCALE_MODES: ScaleMode[] = [
  // The seven modes of the major scale.
  { id: "ionian", label: "Major (Ionian)", category: "Major scale modes", intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: "dorian", label: "Dorian", category: "Major scale modes", intervals: [0, 2, 3, 5, 7, 9, 10] },
  { id: "phrygian", label: "Phrygian", category: "Major scale modes", intervals: [0, 1, 3, 5, 7, 8, 10] },
  { id: "lydian", label: "Lydian", category: "Major scale modes", intervals: [0, 2, 4, 6, 7, 9, 11] },
  { id: "mixolydian", label: "Mixolydian", category: "Major scale modes", intervals: [0, 2, 4, 5, 7, 9, 10] },
  { id: "aeolian", label: "Natural Minor (Aeolian)", category: "Major scale modes", intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: "locrian", label: "Locrian", category: "Major scale modes", intervals: [0, 1, 3, 5, 6, 8, 10] },

  // Other minor/major forms.
  { id: "harmonic-minor", label: "Harmonic Minor", category: "Minor scales", intervals: [0, 2, 3, 5, 7, 8, 11] },
  { id: "melodic-minor", label: "Melodic Minor", aka: "Jazz Minor", category: "Minor scales", intervals: [0, 2, 3, 5, 7, 9, 11] },
  { id: "harmonic-major", label: "Harmonic Major", category: "Minor scales", intervals: [0, 2, 4, 5, 7, 8, 11] },

  // Pentatonic & blues.
  { id: "major-pentatonic", label: "Major Pentatonic", category: "Pentatonic & blues", intervals: [0, 2, 4, 7, 9] },
  { id: "minor-pentatonic", label: "Minor Pentatonic", category: "Pentatonic & blues", intervals: [0, 3, 5, 7, 10] },
  { id: "blues", label: "Blues Scale", category: "Pentatonic & blues", intervals: [0, 3, 5, 6, 7, 10] },
  { id: "major-blues", label: "Major Blues Scale", category: "Pentatonic & blues", intervals: [0, 2, 3, 4, 7, 9] },

  // The seven modes of the (ascending) melodic minor scale.
  { id: "dorian-b2", label: "Dorian ♭2", aka: "Phrygian ♮6", category: "Melodic minor modes", intervals: [0, 1, 3, 5, 7, 9, 10] },
  { id: "lydian-augmented", label: "Lydian Augmented", category: "Melodic minor modes", intervals: [0, 2, 4, 6, 8, 9, 11] },
  { id: "lydian-dominant", label: "Lydian Dominant", aka: "Lydian ♭7", category: "Melodic minor modes", intervals: [0, 2, 4, 6, 7, 9, 10] },
  { id: "mixolydian-b6", label: "Mixolydian ♭6", aka: "Hindu", category: "Melodic minor modes", intervals: [0, 2, 4, 5, 7, 8, 10] },
  { id: "half-diminished", label: "Half-Diminished", aka: "Locrian ♮2", category: "Melodic minor modes", intervals: [0, 2, 3, 5, 6, 8, 10] },
  { id: "altered", label: "Altered", aka: "Super Locrian", category: "Melodic minor modes", intervals: [0, 1, 3, 4, 6, 8, 10] },

  // Symmetric scales.
  { id: "whole-tone", label: "Whole Tone", category: "Symmetric scales", intervals: [0, 2, 4, 6, 8, 10] },
  { id: "diminished-wh", label: "Whole-Half Diminished", category: "Symmetric scales", intervals: [0, 2, 3, 5, 6, 8, 9, 11] },
  { id: "diminished-hw", label: "Half-Whole Diminished", category: "Symmetric scales", intervals: [0, 1, 3, 4, 6, 7, 9, 10] },
  { id: "chromatic", label: "Chromatic", category: "Symmetric scales", intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
];

/** A sensible starter pool: the church modes, the common minor forms, pentatonics and the blues
    scale. Left out by default: the melodic-minor modes and symmetric scales, which are more of a
    deliberate add for players ready for them. */
export const DEFAULT_ENABLED_SCALE_IDS = [
  "ionian",
  "dorian",
  "phrygian",
  "lydian",
  "mixolydian",
  "aeolian",
  "locrian",
  "harmonic-minor",
  "melodic-minor",
  "major-pentatonic",
  "minor-pentatonic",
  "blues",
];

/** Every mode ends on the root an octave up, so "playing the scale" always means root-to-root. */
export function scaleSequence(rootMidi: number, mode: ScaleMode): string[] {
  return [...mode.intervals, 12].map((offset) => midiToNote(rootMidi + offset));
}

export type ScaleRound = {
  mode: ScaleMode;
  rootMidi: number;
  /** The full ascending sequence, root to root, in order. */
  notes: string[];
};

/** Picks a root note such that the whole scale (root up to the octave above) fits the range.
    Instrument ranges are all comfortably wider than an octave, but a narrow custom range falls
    back to just anchoring the scale at the bottom rather than producing an invalid round. */
function randomRootMidi(range: ParsedRange): number {
  const highRoot = range.highMidi - 12;
  if (highRoot < range.lowMidi) return range.lowMidi;
  return range.lowMidi + Math.floor(Math.random() * (highRoot - range.lowMidi + 1));
}

export function randomScaleRound(range: ParsedRange, mode: ScaleMode): ScaleRound {
  const rootMidi = randomRootMidi(range);
  return { mode, rootMidi, notes: scaleSequence(rootMidi, mode) };
}

export function randomMode(pool: ScaleMode[]): ScaleMode {
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Every octave of `pitchClass` (0 = C, 1 = C#, …) whose root-to-root scale fits the range. */
function rootCandidatesForPitchClass(range: ParsedRange, pitchClass: number): number[] {
  const highRoot = range.highMidi - 12;
  if (highRoot < range.lowMidi) return [];
  const first = range.lowMidi + ((((pitchClass - range.lowMidi) % 12) + 12) % 12);
  const candidates: number[] = [];
  for (let midi = first; midi <= highRoot; midi += 12) candidates.push(midi);
  return candidates;
}

/** A random octave of the given key that fits the range (falling back, like `randomScaleRound`,
    to anchoring near the bottom of the range if the range is too narrow for a clean fit). */
function randomRootForPitchClass(range: ParsedRange, pitchClass: number): number {
  const candidates = rootCandidatesForPitchClass(range, pitchClass);
  if (candidates.length) return candidates[Math.floor(Math.random() * candidates.length)];
  return range.lowMidi + ((((pitchClass - range.lowMidi) % 12) + 12) % 12);
}

export function scaleRoundForPitchClass(
  range: ParsedRange,
  mode: ScaleMode,
  pitchClass: number,
): ScaleRound {
  const rootMidi = randomRootForPitchClass(range, pitchClass);
  return { mode, rootMidi, notes: scaleSequence(rootMidi, mode) };
}

/** The full drill: every selected mode in all 12 keys, each with its own random octave.
    Unshuffled — callers that want a random order (e.g. the drill queue) shuffle it themselves. */
export function drillQueueForPool(range: ParsedRange, pool: ScaleMode[]): ScaleRound[] {
  const rounds: ScaleRound[] = [];
  for (const mode of pool) {
    for (let pitchClass = 0; pitchClass < 12; pitchClass++) {
      rounds.push(scaleRoundForPitchClass(range, mode, pitchClass));
    }
  }
  return rounds;
}
