import type { BassNote } from "./bassLine";

// Keeps a generated bass line playable on an upright bass at the tempo it's played: a real bassist
// can't jump two octaves between eighth notes, pluck sixteenths at 300 BPM, or play below the low E
// string. Run over every chorus (the Computer's or a modelled player's) just before it's scheduled.
//
// - Range: low E (E1) to C4. Anything outside moves by octaves.
// - Leaps: the widest jump allowed depends on the time there is to make it — a 12th with half a
//   second, a 10th at walking speed, an octave, a 6th, then a 5th as the notes come faster. A note
//   that jumps further moves by octaves to the playable spot nearest the notes around it.
// - Zig-zags: a big leap straight into a big leap back the other way, at eighth-note speed, moves
//   the middle note an octave instead.
// - Speed: no more than about 13 plucked notes a second (20 for ghost notes); a note faster than
//   that is dropped and the note before it held through.
// Lines from real transcriptions almost never trip these — they catch seams, octave placement and
// fast tempos.

export const UPRIGHT_LOW = 28; // E1, the open low E string
export const UPRIGHT_HIGH = 60; // C4 — thumb position; walking lines live well below this

const MIN_GAP = 0.075; // seconds between plucked notes
const MIN_GAP_GHOST = 0.05;

/** The widest leap (semitones) a player can make in `dt` seconds. */
function maxLeap(dt: number): number {
  if (dt >= 0.45) return 19; // a 12th, with time to shift
  if (dt >= 0.25) return 16; // a 10th — walking players do (Ray Brown's F1 → A2 in quarters)
  if (dt >= 0.18) return 12;
  if (dt >= 0.11) return 9;
  return 7;
}

export type PlayableReport = { folded: number; leaps: number; zigzags: number; dropped: number };

/**
 * Returns a playable copy of `notes` (beats, sorted by start) at `bpm`. `before` is the last note
 * played before them (the previous chorus), so the first jump is checked too.
 */
export function makePlayable(notes: BassNote[], bpm: number, before: BassNote | null = null): { notes: BassNote[]; report: PlayableReport } {
  const sec = 60 / Math.max(20, bpm);
  const report: PlayableReport = { folded: 0, leaps: 0, zigzags: 0, dropped: 0 };
  const sorted = [...notes].sort((a, b) => a.beat - b.beat).map((n) => ({ ...n }));

  // Speed: when two notes come too fast, drop the decoration — a ghost note, or an off-beat note
  // before a note on the beat — and hold the note before it through.
  const kept: BassNote[] = [];
  const onBeat = (n: BassNote) => Math.abs(n.beat - Math.round(n.beat)) < 1e-6;
  for (const n of sorted) {
    let keep = true;
    for (;;) {
      const prev = kept[kept.length - 1];
      if (!prev) break;
      const gap = (n.beat - prev.beat) * sec;
      if (gap >= (n.ghost || prev.ghost ? MIN_GAP_GHOST : MIN_GAP) - 1e-9) break;
      report.dropped++;
      if (n.ghost) {
        keep = false;
        prev.length = Math.max(prev.length, n.beat + n.length - prev.beat);
        break;
      }
      if (prev.ghost || (onBeat(n) && !onBeat(prev))) {
        kept.pop();
        const before = kept[kept.length - 1];
        if (before) before.length = Math.max(before.length, n.beat - before.beat);
        continue; // check n against the note before that
      }
      keep = false;
      prev.length = Math.max(prev.length, n.beat + n.length - prev.beat);
      break;
    }
    if (keep) kept.push(n);
  }

  const inRange = (m: number) => m >= UPRIGHT_LOW && m <= UPRIGHT_HIGH;
  const fold = (m: number) => {
    let x = m;
    while (x < UPRIGHT_LOW) x += 12;
    while (x > UPRIGHT_HIGH) x -= 12;
    return x;
  };

  // Range.
  for (const n of kept) {
    const f = fold(n.midi);
    if (f !== n.midi) {
      n.midi = f;
      report.folded++;
    }
  }

  // Leaps (ghost notes are barely pitched; the jump that matters is between real notes).
  const pitched = kept.filter((n) => !n.ghost);
  let last: BassNote | null = before && !before.ghost ? before : null;
  for (let i = 0; i < pitched.length; i++) {
    const n = pitched[i];
    if (last) {
      const dt = (n.beat - last.beat) * sec;
      const limit = maxLeap(dt);
      if (Math.abs(n.midi - last.midi) > limit) {
        const next = pitched[i + 1];
        let best = n.midi;
        let bestCost = Infinity;
        for (const k of [-24, -12, 12, 24]) {
          const m = n.midi + k;
          if (!inRange(m) || Math.abs(m - last.midi) > limit) continue;
          const cost = Math.abs(m - last.midi) + (next ? 0.5 * Math.abs(m - next.midi) : 0);
          if (cost < bestCost) {
            bestCost = cost;
            best = m;
          }
        }
        if (best !== n.midi) {
          n.midi = best;
          report.leaps++;
        } else if (i > 0 && last === pitched[i - 1]) {
          // Nowhere for this note to go (e.g. it can't drop below low E): move the one before it.
          const p = last;
          const pp = pitched[i - 2] ?? null;
          for (const k of [12, -12]) {
            const m = p.midi + k;
            if (!inRange(m) || Math.abs(n.midi - m) > limit) continue;
            if (pp && Math.abs(m - pp.midi) > maxLeap((p.beat - pp.beat) * sec)) continue;
            p.midi = m;
            report.leaps++;
            break;
          }
        }
      }
    }
    last = n;
  }

  // Zig-zags: big leap, then a big leap straight back, both quick.
  for (let i = 1; i + 1 < pitched.length; i++) {
    const a = pitched[i - 1];
    const b = pitched[i];
    const c = pitched[i + 1];
    const d1 = b.midi - a.midi;
    const d2 = c.midi - b.midi;
    // Only at eighth-note speed — root up a 6th and back in quarters is everyday walking.
    const quick = (b.beat - a.beat) * sec < 0.2 && (c.beat - b.beat) * sec < 0.2;
    if (!quick || Math.abs(d1) <= 7 || Math.abs(d2) <= 7 || Math.sign(d1) === Math.sign(d2)) continue;
    const m = b.midi - Math.sign(d1) * 12;
    if (inRange(m) && Math.max(Math.abs(m - a.midi), Math.abs(c.midi - m)) < Math.max(Math.abs(d1), Math.abs(d2))) {
      b.midi = m;
      report.zigzags++;
    }
  }

  // Ghost notes sit with the note they decorate (a ghosted repeat shouldn't float two octaves off).
  for (let i = 0; i < kept.length; i++) {
    const n = kept[i];
    if (!n.ghost) continue;
    const ref = kept.slice(0, i).reverse().find((m) => !m.ghost) ?? kept.slice(i + 1).find((m) => !m.ghost);
    if (!ref) continue;
    while (n.midi - ref.midi > 12 && n.midi - 12 >= UPRIGHT_LOW) n.midi -= 12;
    while (ref.midi - n.midi > 12 && n.midi + 12 <= UPRIGHT_HIGH) n.midi += 12;
  }

  return { notes: kept, report };
}

/** Whether a line breaks any of the rules (for tests). */
export function playabilityProblems(notes: BassNote[], bpm: number, before: BassNote | null = null): string[] {
  const sec = 60 / Math.max(20, bpm);
  const out: string[] = [];
  const sorted = [...notes].sort((a, b) => a.beat - b.beat);
  sorted.forEach((n, i) => {
    if (n.midi < UPRIGHT_LOW || n.midi > UPRIGHT_HIGH) out.push(`range ${n.midi} at ${n.beat}`);
    const p = sorted[i - 1];
    if (p && (n.beat - p.beat) * sec < (n.ghost || p.ghost ? MIN_GAP_GHOST : MIN_GAP) - 1e-9) out.push(`too fast at ${n.beat}`);
  });
  const pitched = sorted.filter((n) => !n.ghost);
  let last = before && !before.ghost ? before : null;
  for (const n of pitched) {
    if (last && Math.abs(n.midi - last.midi) > maxLeap((n.beat - last.beat) * sec)) out.push(`leap ${last.midi}→${n.midi} at ${n.beat}`);
    last = n;
  }
  return out;
}
