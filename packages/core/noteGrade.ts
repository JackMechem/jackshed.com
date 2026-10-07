import { midiToNote, parseNote } from "./noteRange";

export type Grade = "correct" | "partial" | "incorrect";

/** Shared by every trainer that shows a correct/partial/incorrect result (Note Trainer, Scale
    Trainer): the color and label for each grade. */
export const GRADE_COLOR: Record<Grade, string> = {
  correct: "#22c55e",
  partial: "#f59e0b",
  incorrect: "#ef4444",
};
export const GRADE_LABEL: Record<Grade, string> = {
  correct: "Correct",
  partial: "Partial",
  incorrect: "Incorrect",
};

const RANK: Record<Grade, number> = { incorrect: 0, partial: 1, correct: 2 };

export function betterGrade(a: Grade | null, b: Grade): boolean {
  return a === null || RANK[b] > RANK[a];
}

export const DEFAULT_REFERENCE_A = 440;

export function frequencyToMidi(freq: number, refA = DEFAULT_REFERENCE_A): number {
  return 69 + 12 * Math.log2(freq / refA);
}

/** e.g. { note: "A2", cents: +12 } — how far the heard pitch is from the nearest semitone. */
export function describePitch(
  freq: number,
  refA = DEFAULT_REFERENCE_A,
): { note: string; cents: number } {
  const midi = frequencyToMidi(freq, refA);
  const nearest = Math.round(midi);
  return { note: midiToNote(nearest), cents: Math.round((midi - nearest) * 100) };
}

export type GradeOptions = {
  /** Accept the right note in any octave. */
  ignoreOctave?: boolean;
  /** How many cents off the target still counts, so slightly out-of-tune strings pass. */
  toleranceCents?: number;
  refA?: number;
};

/**
 * correct: the pitch is within the tolerance of the target. With `ignoreOctave`, the right
 * note in any octave counts. Anything else, including the right note in the wrong octave when
 * octaves matter, is incorrect. (A "partial" grade is given by the session when a wrong note
 * was played before the right one.)
 */
export function gradePitch(freq: number, target: string, options: GradeOptions = {}): Grade {
  const { ignoreOctave = false, toleranceCents = 50, refA = DEFAULT_REFERENCE_A } = options;
  const targetMidi = parseNote(target);
  if (targetMidi === null) return "incorrect";
  let diff = frequencyToMidi(freq, refA) - targetMidi;
  if (ignoreOctave) diff = ((((diff + 6) % 12) + 12) % 12) - 6;
  return Math.abs(diff) * 100 <= toleranceCents ? "correct" : "incorrect";
}

/** Correct notes score 1, partial notes score half. */
export function scoreOf(grades: Grade[]): number {
  return grades.reduce((sum, g) => sum + (g === "correct" ? 1 : g === "partial" ? 0.5 : 0), 0);
}
