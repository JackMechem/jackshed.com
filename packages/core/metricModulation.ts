import { MAX_BPM, MIN_BPM, clampBpmRange } from "./meterControls";

/** A tempo relationship: the new BPM is the old one times `ratio` (= `num`/`den` in lowest terms). */
export type Modulation = {
  id: string;
  ratio: number;
  num: number;
  den: number;
  label: string;
};

export const MODULATIONS: Modulation[] = [
  {
    id: "3-2",
    ratio: 3 / 2,
    num: 3,
    den: 2,
    label: "3:2 polyrhythm — quarter = dotted quarter",
  },
  {
    id: "2-3",
    ratio: 2 / 3,
    num: 2,
    den: 3,
    label: "2:3 polyrhythm — dotted quarter = quarter",
  },
  {
    id: "4-3",
    ratio: 4 / 3,
    num: 4,
    den: 3,
    label: "4:3 polyrhythm — dotted eighth = quarter",
  },
  {
    id: "3-4",
    ratio: 3 / 4,
    num: 3,
    den: 4,
    label: "3:4 polyrhythm — quarter = dotted eighth",
  },
  {
    id: "2-1",
    ratio: 2,
    num: 2,
    den: 1,
    label: "2:1 polyrhythm — double time",
  },
  {
    id: "1-2",
    ratio: 1 / 2,
    num: 1,
    den: 2,
    label: "1:2 polyrhythm — half time",
  },
  {
    id: "5-4",
    ratio: 5 / 4,
    num: 5,
    den: 4,
    label: "5:4 polyrhythm — 4 quarters = quintuplet of 5",
  },
  {
    id: "4-5",
    ratio: 4 / 5,
    num: 4,
    den: 5,
    label: "4:5 polyrhythm — 5 quarters = quintuplet of 4",
  },
  {
    id: "3-1",
    ratio: 3,
    num: 3,
    den: 1,
    label: "3:1 polyrhythm — triple time",
  },
  {
    id: "1-3",
    ratio: 1 / 3,
    num: 1,
    den: 3,
    label: "1:3 polyrhythm — third time",
  },
];

export type ModulationResult = {
  modulation: Modulation;
  toBpm: number;
  /** The ratio actually applied, as lowest-terms integers (`num`/`den` flipped if the inverse
      was used instead, to stay in range). */
  num: number;
  den: number;
};

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** A clean single note-value name for a fraction of a quarter note, where one exists. */
const NOTE_EQUIVALENTS: { num: number; den: number; name: string }[] = [
  { num: 1, den: 2, name: "eighth note" },
  { num: 1, den: 4, name: "sixteenth note" },
  { num: 3, den: 4, name: "dotted eighth note" },
  { num: 3, den: 8, name: "dotted sixteenth note" },
  { num: 2, den: 3, name: "quarter-note triplet" },
  { num: 1, den: 3, name: "eighth-note triplet" },
  { num: 1, den: 6, name: "sixteenth-note triplet" },
  { num: 3, den: 2, name: "dotted quarter note" },
  { num: 2, den: 1, name: "half note" },
  { num: 3, den: 1, name: "dotted half note" },
  { num: 4, den: 1, name: "whole note" },
];

/**
 * What a new tempo's quarter note is worth in terms of a reference tempo's quarter note (the
 * `num`/`den` of the modulation that got you there), e.g. "quarter-note triplet" for a 3:2
 * speedup. Null when the ratio doesn't reduce to a single standard note value (true for a few
 * of these, like 4:3 — those are genuinely group relationships, not a one-note equivalence).
 */
export function describeQuarterEquivalence(
  num: number,
  den: number,
): string | null {
  const g = gcd(num, den) || 1;
  const n = den / g;
  const d = num / g;
  return NOTE_EQUIVALENTS.find((e) => e.num === n && e.den === d)?.name ?? null;
}

/**
 * Picks a random enabled modulation and applies it to `fromBpm`. If the ratio would push the
 * tempo outside the valid range, its inverse is used instead, so the tempo bounces back toward
 * the middle rather than getting stuck at an edge.
 */
export function pickModulation(
  fromBpm: number,
  enabledIds: string[],
  avoidId: string | null,
): ModulationResult {
  const enabled = MODULATIONS.filter((m) => enabledIds.includes(m.id));
  const pool = enabled.length > 0 ? enabled : MODULATIONS;
  const choices =
    avoidId && pool.length > 1 ? pool.filter((m) => m.id !== avoidId) : pool;
  const modulation = choices[Math.floor(Math.random() * choices.length)];

  const raw = fromBpm * modulation.ratio;
  const outOfRange = raw < MIN_BPM || raw > MAX_BPM;
  const num = outOfRange ? modulation.den : modulation.num;
  const den = outOfRange ? modulation.num : modulation.den;
  return { modulation, toBpm: clampBpmRange(fromBpm * (num / den)), num, den };
}

export type Phase = "home" | "away";

export const RETURN_LABEL = "Return to original tempo";

export type Plan = {
  toBpm: number;
  label: string;
  /** Which modulation this was, for the "avoid repeating" check — null for a return step, since
      that's deterministic rather than one of the random ratios. */
  modulationId: string | null;
  nextPhase: Phase;
  /**
   * How many bars of the new tempo it takes for it and the reference tempo to land on their
   * downbeat together again — e.g. a 3:2 modulation realigns after 3 bars of the new tempo (and
   * 2 of the old one). Null when there's nothing to realign with (the two are already the same
   * tempo, as right after a "return to original" step).
   */
  barsToRealign: number | null;
  /** See `describeQuarterEquivalence` — null under the same conditions as `barsToRealign`. */
  quarterEquivalent: string | null;
};

/**
 * Decides what happens at the next modulation point. With `returnToOriginal` on, this alternates
 * between a random modulation away from the starting tempo and a deterministic jump straight
 * back to it; otherwise every point is a fresh random pick from wherever the tempo currently is.
 */
export function planModulation(
  fromBpm: number,
  originalBpm: number,
  returnToOriginal: boolean,
  phase: Phase,
  enabledIds: string[],
  avoidId: string | null,
): Plan {
  if (returnToOriginal && phase === "away") {
    return {
      toBpm: originalBpm,
      label: RETURN_LABEL,
      modulationId: null,
      nextPhase: "home",
      barsToRealign: null,
      quarterEquivalent: null,
    };
  }
  const { modulation, toBpm, num, den } = pickModulation(
    fromBpm,
    enabledIds,
    avoidId,
  );
  return {
    toBpm,
    label: modulation.label,
    modulationId: modulation.id,
    nextPhase: "away",
    barsToRealign: num,
    quarterEquivalent: describeQuarterEquivalence(num, den),
  };
}
