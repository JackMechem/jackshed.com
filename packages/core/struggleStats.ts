import type { Grade } from "./noteGrade";

/** How many times a note/scale has been graded each way, across every listen-mode session ever
    run (not reset between sessions — this is a running lifetime tally, separate from the
    per-session results and the timed "History" list). Shared shape/logic for Note Trainer
    (keyed by note, e.g. "F#3") and Scale Trainer (keyed by scale mode id, e.g. "dorian"). */
export type GradeCounts = { correct: number; partial: number; incorrect: number };

const EMPTY_COUNTS: GradeCounts = { correct: 0, partial: 0, incorrect: 0 };

export function attempts(counts: GradeCounts): number {
  return counts.correct + counts.partial + counts.incorrect;
}

/** Incorrect counts fully against you, partial counts half — the same weighting `scoreOf` (in
    lib/noteGrade.ts) uses for scoring a session, just inverted into "how much this has cost you"
    instead of "how well you did". */
export function weaknessScore(counts: GradeCounts): number {
  return counts.incorrect + counts.partial * 0.5;
}

/** Returns a new stats object with one grade added for `key` — never mutates `stats`. */
export function bumpGradeCounts<K extends string>(
  stats: Record<K, GradeCounts>,
  key: K,
  grade: Grade,
): Record<K, GradeCounts> {
  const current = stats[key] ?? EMPTY_COUNTS;
  return { ...stats, [key]: { ...current, [grade]: current[grade] + 1 } };
}

export type WeakEntry<K extends string> = { key: K; counts: GradeCounts; score: number };

/** Every key that's ever gone wrong at least once, worst first (ties broken by more attempts —
    a note missed 3 times in 4 tries says more than one missed once in one try). Keys that have
    only ever been played correctly aren't "struggles" and are left out entirely. */
export function rankWeak<K extends string>(
  stats: Record<K, GradeCounts>,
): WeakEntry<K>[] {
  return (Object.entries(stats) as [K, GradeCounts][])
    .map(([key, counts]) => ({ key, counts, score: weaknessScore(counts) }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) => b.score - a.score || attempts(b.counts) - attempts(a.counts),
    );
}
