/**
 * Pattern data and pure generation logic for this drum warmup tool — no React, no audio, just
 * "what are the sticking letters for this bar." Rendering lives in
 * `components/StickControlStave.tsx` (VexFlow), playback in `lib/stickControlEngine.ts`.
 *
 * Deliberately narrowed to one single thing, per a direct "for simplicity, remove all the pattern
 * types except for strokes then a roll, and remove all the roll sizes except 9 stroke roll":
 * every pattern is now a stretch of straight strokes (from a bank of transcribed sticking
 * patterns, `SINGLE_BEAT_COMBINATIONS` below) followed by a 9-stroke open roll, written out
 * twice. Earlier versions of this file supported several other pattern types (plain combinations,
 * triplets, a standalone stroke-roll type, several roll sizes) — all removed here, not hidden
 * behind options, since the whole point of the request was fewer moving parts to get the one
 * remaining thing exactly right.
 *
 * The 72 `SINGLE_BEAT_COMBINATIONS` entries are each a full 16-stroke line (not a 4-stroke "cell"
 * meant to be tiled — several of these aren't actually one cell repeated four times, e.g. one
 * rotates through four related but distinct groups) — transcribed from a printed reference by
 * reading scanned pages directly (not OCR'd, so treat this as a careful best-effort transcription,
 * not a guaranteed pixel-perfect one).
 *
 * The roll itself is the standard PAS "9 stroke open roll" rudiment — `rollSticking` is a one-line
 * closed-form generator: the first 9 letters of the infinite alternating-double-stroke stream
 * "RRLLRRLLRRLL..." (RRLLRRLLR).
 *
 * A roll's strokes are written at exactly *double* the surrounding note value (straight strokes
 * at 8th notes, roll strokes at double that, 16th notes — 8th notes used to be switchable to 16th
 * straight/32nd rolled via a "Note value" option, removed per a direct later simplification
 * request, "get rid of the note value drop down and just do the 8th note one") — specified
 * directly, with a worked example ("double stroke roll should be 4 8th notes then 8 16th notes"),
 * after two earlier, wrong rhythm models (see this file's own git history/PROJECT.md for the
 * full story — same-duration-as-a-plain-stroke, then a letter-pair "diddle" model, both reported
 * back as wrong before this one).
 *
 * The transition from straight strokes into the roll, and from the roll back into the next
 * straight segment, both have to land on a genuinely different hand than whatever just played —
 * otherwise the hand-off is awkward or outright unplayable (three-plus of the same hand in a
 * row). This was wrong three times before landing on the current approach, every round corrected
 * from direct, example-driven feedback:
 *   1. First version: the roll's own start hand was picked at random, with no relationship to
 *      the straight segment it followed — could land on the same hand the straight part just
 *      finished with.
 *   2. Second version: fixed the roll's own start hand (always opposite the straight segment's
 *      ending hand), but made the *second* bar an exact mirror of the first — which fixed the
 *      within-bar transition but could still produce a bad hand-off at the seam between the first
 *      bar's roll and the second bar's own straight segment, reported back with a worked example
 *      ("RLRL RRLLRRLL RLRL RRLLRRLL" — the second bar restates the *same* straight sticking, not
 *      its mirror).
 *   3. Third version: made both bars' straight segments come from one continuous tiling of the
 *      pattern instead (`tileTo(full16, straightSlots * 2)`, split in half) rather than restating
 *      position 0 or mirroring — correct for a pattern built from plain period-2 alternation
 *      (whose own straight segment always starts and ends on different hands already), but *not*
 *      for one whose straight segment starts and ends on the *same* hand — not just an obvious
 *      case like "RRRR," something like "RLLR" has this too — where the "just continue the tiling"
 *      approach can still land bar 2's straight segment on the same hand the roll just ended on.
 *      Reported back with a screenshot showing exactly that collision.
 *   4. Fourth version (first attempt at the current fix): added a check for exactly that — but
 *      derived it from a mathematical assumption ("a roll's own fast-slot count is always a
 *      multiple of 4 here, so its ending hand always equals its bar's straight segment's ending
 *      hand") that only happened to hold at the one meter it was tested against. The roll cell
 *      itself is `ROLL_SIZE` (9) letters long, not 4 — tiling a 9-length cell to a slot count
 *      that isn't itself a multiple of 9 shifts phase on every wrap, so the "ends where it
 *      started, basically" shortcut silently broke at other beats-per-bar/note-value
 *      combinations. Caught by an exhaustive script, not another screenshot — checking the
 *      seam/start-hand rules across every one of the 72 transcribed patterns at several different
 *      meters, which the default meter's own test had never exercised.
 * Current approach keeps the continuous-tiling idea from version 3 (it's still the right behavior
 * whenever it's already safe) but replaces version 4's derived assumption with reading the real
 * value: bar 1 is built for real first, and bar 2's straight segment is checked against bar 1's
 * own *actual* last cell — whatever hand that genuinely turns out to be, not a predicted one. If
 * it would collide, *only that segment* gets flipped (not the whole bar, and never the roll,
 * which is always re-derived fresh from whatever that segment turns out to be) before building
 * bar 2 for real. This keeps every seam clean regardless of which pattern or meter comes up,
 * with no assumption about the roll's own internal periodicity to get subtly wrong again, while
 * still reproducing the exact "RLRL RRLLRRLL RLRL RRLLRRLL" shape from version 2's own worked
 * example whenever that's already safe on its own.
 *
 * One more seam was still unguarded even after all of the above: the pattern *repeats* (`repeats`
 * copies of `bars` back to back, per `lib/stickControlEngine.ts`), so bar 2's own last stroke
 * feeds straight into bar 1's own first stroke again on the next lap — a seam none of the logic
 * above ever checks, since it only ever looks at transitions *within* one lap. Reported directly,
 * with a worked example (an R ending bar 2, an R starting bar 1 right after). Fixed by checking
 * that specific seam once both bars are built for real, and — only when it would collide —
 * duplicating the whole 2-bar pattern into 4, with bars 3-4 the exact mirror (every hand flipped)
 * of bars 1-2 (`mirrorCells`, below) rather than re-deriving a third variant from scratch:
 * mirroring preserves every seam relationship the logic above already established (each one is an
 * inequality between two hands, and flipping both sides of an inequality with the same bijection
 * can't turn it into an equality), so bars 3-4 stay exactly as clean internally as bars 1-2 were,
 * and the *new* loop-closing seam (bar 4's last stroke into bar 1's first) is a genuine hand
 * change too, since bar 4 is bar 2 with every hand flipped.
 *
 * One more seam sits *between* two different patterns, not within one: per a direct request
 * ("make sure the next pattern is always starting with a sticking opposite to what the previous
 * ended with"), `generatePattern` takes an optional `previousEndHand` — when given, the whole
 * straight-segment cell is flipped (the same `otherHand`-elementwise operation as `mirrorCells`, just
 * applied before anything else is built from the cell) whenever it doesn't already open on the
 * right hand, which is safe for the identical reason mirroring a finished 2-bar block was safe
 * above — every rule this function establishes is an inequality between two hands, and flipping
 * every hand in the cell with one consistent bijection before any of that logic runs can't turn
 * any of it into an equality. `lib/stickControlEngine.ts` is what actually supplies this: it keeps
 * a precomputed "next pattern" one step ahead of whatever's currently showing, always generated
 * against the current pattern's own real last stroke, so every pattern-to-pattern transition a
 * player actually hears gets the same hand-continuity guarantee the seams *within* one pattern
 * already have.
 *
 * Meter is no longer configurable either, per a direct follow-up ("remove the meter section, the
 * beats per bar should always be 4") — `StickControlOptions` (which only ever held `beatsPerBar`
 * by this point, "Note value" having already been cut) is gone entirely, and `generatePattern`
 * takes no options argument at all now, just the optional `previousEndHand`. Always-4/4 was
 * already this tool's own default and by far its most common real use the whole time it *was*
 * configurable, so this removes a knob rather than changing default behavior.
 *
 * A real option came back, though: per a direct request, the roll segment now has three
 * selectable `RollType`s, not just the one double-stroke rudiment — `StickControlOptions` returns
 * with exactly one field, `rollType`. "Double stroke roll" is the original, unchanged
 * RRLLRRLLR-family rudiment. "Single stroke roll" is new: the *same* written rhythm/length as the
 * double-stroke roll (still `fast`-speed cells, still however many fast slots the roll segment
 * has), just plain alternating single strokes (`alternatingSticking`) instead of the double-stroke
 * sticking — "same notes... but with single alternating sticking," per the request. "Triplets" is
 * structurally different, not just a different sticking over the same rhythm: the roll segment is
 * written as 8th-note triplets (`CellSpeed: "triplet"`, a third of a beat each, Tuplet-wrapped in
 * the renderer) rather than double-speed 16ths, with its own sticking randomly picked from
 * `TRIPLET_CELLS` — "randomized sticking between alternating, RRL RRL, and LLR, LLR," per the
 * request's own literal wording, which is why `TRIPLET_CELLS` keeps those three cells as separate
 * named entries rather than collapsing "RRL"/"LLR" into one shape evaluated at two start hands
 * (see that constant's own comment for the probability consequence of that literal choice). All
 * three types reuse the exact same hand-continuity machinery already proven correct above — rule
 * A (the roll must open opposite the straight segment's own end) is satisfied by construction for
 * "single"/"double" (both generate directly from the required start hand) and by an explicit
 * mirror-if-needed correction for "triplet" (the same technique already used twice elsewhere in
 * this file), so every seam-safety guarantee this file establishes holds identically regardless of
 * which roll type is selected — verified by re-running the full exhaustive seam-check script
 * across all three.
 *
 * Introducing a genuinely different rhythmic value (the triplet's third-of-a-beat, next to the
 * straight segment's half-beat and the existing roll's quarter-beat) retired the old
 * `NoteCell.fast: boolean` in favor of `NoteCell.speed: CellSpeed` ("normal" | "fast" | "triplet")
 * plus a `CELL_BEAT_FRACTION` lookup table — a boolean genuinely can't express three distinct
 * durations. This also let `GeneratedPattern.subdivision` (which existed purely to compute a
 * cell's own duration and detect beat boundaries, both now done directly from
 * `CELL_BEAT_FRACTION` instead) be dropped entirely — it had already been reduced to an always-2
 * constant by the earlier "Note value" removal, and tracking real beat-fractions directly removes
 * the need for a subdivision concept altogether, not just hides it.
 */

export type Hand = "R" | "L";

/** A stroke's own written speed — a third kind (`"triplet"`) is why this isn't just the `fast`
    boolean it used to be; see this file's own doc comment for the full reasoning. */
export type CellSpeed = "normal" | "fast" | "triplet";

/** How much of one beat (a quarter note) each speed occupies — a normal (8th-note) stroke is half
    a beat, a fast (16th-note, the roll's own double-speed default) stroke a quarter, and a triplet
    (8th-note-triplet) stroke a third. Drives both playback duration (`lib/stickControlEngine.ts`)
    and beat-boundary detection for beaming (`components/StickControlStave.tsx`) directly, with no
    separate "subdivision" concept needed on top of it. */
export const CELL_BEAT_FRACTION: Record<CellSpeed, number> = {
  normal: 1 / 2,
  fast: 1 / 4,
  triplet: 1 / 3,
};

/** One playable position in a bar: a stroke, plus how fast it's written (see `CellSpeed`). */
export type NoteCell = { hand: Hand; speed: CellSpeed };

function normalCell(h: Hand): NoteCell {
  return { hand: h, speed: "normal" };
}

function fastCell(h: Hand): NoteCell {
  return { hand: h, speed: "fast" };
}

function tripletCell(h: Hand): NoteCell {
  return { hand: h, speed: "triplet" };
}

function toCells(cell: Hand[]): NoteCell[] {
  return cell.map(normalCell);
}

function toFastCells(cell: Hand[]): NoteCell[] {
  return cell.map(fastCell);
}

function toTripletCells(cell: Hand[]): NoteCell[] {
  return cell.map(tripletCell);
}

function otherHand(h: Hand): Hand {
  return h === "R" ? "L" : "R";
}

/** Flips every cell's hand (R<->L), keeping `speed` as-is — used only to keep the pattern's own
    *loop-closing* seam clean when it repeats (see `generatePattern`'s own comment on this below).
    Mirroring is safe to apply across a whole already-verified 2-bar block: every seam-cleanliness
    check in this file is of the form "hand A != hand B," and flipping both sides of an inequality
    with the same bijection can't turn it into an equality, so a mirrored block stays exactly as
    clean internally as the original was. */
function mirrorCells(cells: NoteCell[]): NoteCell[] {
  return cells.map((c) => ({ hand: otherHand(c.hand), speed: c.speed }));
}

function hands(s: string): Hand[] {
  return s.split("") as Hand[];
}

/** All 72 transcribed sticking patterns, each the full 16-stroke line as printed in the original
    source (see this file's own doc comment for why the full line, not a shorter tileable cell).
    Index 0 = pattern 1. */
export const SINGLE_BEAT_COMBINATIONS: Hand[][] = [
  "RLRLRLRLRLRLRLRL",
  "LRLRLRLRLRLRLRLR",
  "RRLLRRLLRRLLRRLL",
  "LLRRLLRRLLRRLLRR",
  "RLRRLRLLRLRRLRLL",
  "RLLRLRRLRLLRLRRL",
  "RRLRLLRLRRLRLLRL",
  "RLRLLRLRRLRLLRLR",
  "RRRLRRRLRRRLRRRL",
  "LLLRLLLRLLLRLLLR",
  "RLLLRLLLRLLLRLLL",
  "LRRRLRRRLRRRLRRR",
  "RRRRLLLLRRRRLLLL",
  "RLRLRRLLRLRLRRLL",
  "LRLRLLRRLRLRLLRR",
  "RLRLRLRRLRLRLRLL",
  "RLRLRLLRLRLRLRRL",
  "RLRLRRLRLRLRLLRL",
  "RLRLRRRLRLRLRRRL",
  "LRLRLLLRLRLRLLLR",
  "RLRLRLLLRLRLRLLL",
  "LRLRLRRRLRLRLRRR",
  "RLRLRRRRLRLRLLLL",
  "RRLLRLRRLLRRLRLL",
  "RRLLRLLRLLRRLRRL",
  "RRLLRRLRLLRRLLRL",
  "RRLLLLRRRRLLLLRR",
  "RRLLRRRLRRLLRRRL",
  "LLRRLLLRLLRRLLLR",
  "RRLLRLLLRRLLRLLL",
  "LLRRLRRRLLRRLRRR",
  "RRLLRRRRLLRRLLLL",
  "RLRRLRRLRLRRLRRL",
  "LRLLRLLRLRLLRLLR",
  "RLRRLLRLRLRRLLRL",
  "LRLLRRLRLRLLRRLR",
  "RLRRRLRRRLRRRLRR",
  "LRLLLRLLLRLLLRLL",
  "RLRRLLLRLRLLRRRL",
  "RLRRLRRRLRLLRLLL",
  "RLRRLLLLRLRRLLLL",
  "LRLLRRRRLRLLRRRR",
  "RLLRLLRLRLLRLLRL",
  "LRRLRRLRLRRLRRLR",
  "RLLRRLLRRLLRRLLR",
  "LRRLLRRLLRRLLRRL",
  "RLLRLLLRLRRLRRRL",
  "LRRLRRRLLRRLLRRR",
  "RLLRLLLLRLLRLLLL",
  "LRRLRRRRLRRLRRRR",
  "RRLRRRLRRRLRRRLR",
  "LLRLLLRLLLRLLLRL",
  "RRLRLLLRLLRLRRRL",
  "RRLRLRRRLLRLRLLL",
  "RRLRLLLLRRLRLLLL",
  "LLRLRRRRLLRLRRRR",
  "RRRLLLLRRRRLLLLR",
  "RRRLRLLLRRRLRLLL",
  "LLLRLRRRLLLRLRRR",
  "RRRLRRRRLLLRLLLL",
  "RLLLLRRRRLLLLRRR",
  "RLLLRRRRLRRRLLLL",
  "RRRLLLRRRLLLRRRL",
  "LLLRRRLLLRRRLLLR",
  "RRLRRLRRLRRLRLRL",
  "LLRLLRLLRLLRLRLR",
  "RLLRLLRLLRLLRLRL",
  "LRRLRRLRRLRRLRLR",
  "RLRRLLLLRRRRLRLL",
  "RRLLRLRRLLLLRRRR",
  "LLRRLRLLRRRRLLLL",
  "RRRRLLRRLRRLRLRL",
].map(hands);

/** A roll, built from the standard rudiment formula: the first `strokeCount` letters of the
    infinite alternating-double-stroke stream. Matches the real 9-stroke open roll sticking
    exactly (RRLLRRLLR). Used only by the "Double stroke roll" `RollType`. */
export function rollSticking(strokeCount: number, startHand: Hand = "R"): Hand[] {
  const other: Hand = startHand === "R" ? "L" : "R";
  const doubled = [startHand, startHand, other, other];
  return Array.from({ length: Math.max(1, strokeCount) }, (_, i) => doubled[i % 4]);
}

/** The one roll length the "Double stroke roll" type drills — per a direct simplification
    request. Not used by "Single stroke roll" (sized to match the roll segment's own fast-slot
    count directly, see `alternatingSticking`) or "Triplets" (sized to the roll segment's own
    triplet-note count instead, see `TRIPLET_CELLS`). */
export const ROLL_SIZE = 9;

/** Plain continuous alternation (R, L, R, L, ...) of exactly `length` strokes, starting on
    `startHand` — the "Single stroke roll" option's own sticking: the *same* written rhythm/length
    as the "Double stroke roll" option (still `fast`-speed cells, still however many fast slots the
    roll segment has), just alternating single strokes instead of the RRLLRRLLR double-stroke
    rudiment, per a direct request ("same notes as current double stroke roll but with single
    alternating sticking"). Generated directly from `startHand`, the same way `rollSticking` is, so
    it always already opens on the required hand with no mirror-correction needed. */
function alternatingSticking(length: number, startHand: Hand): Hand[] {
  const other = otherHand(startHand);
  return Array.from({ length: Math.max(1, length) }, (_, i) => (i % 2 === 0 ? startHand : other));
}

/** Strokes per beat the "Triplets" roll type writes — 3 (8th-note triplets), vs. the "Single"/
    "Double" roll types' 4 (16th notes, `1 / CELL_BEAT_FRACTION.fast`). */
const TRIPLET_NOTES_PER_BEAT = 3;

/** The three sticking shapes a "Triplets" roll randomly picks from, per the request's own literal
    wording ("randomized sticking between alternating, RRL RRL, and LLR, LLR") — alternating, plus
    both directions of the "broken double" shape, the same trio an earlier (now-removed) version of
    this file's own `TRIPLET_CELLS` already used for a different, since-deleted pattern type.
    Picked uniformly at `randomInt(TRIPLET_CELLS.length)`, tiled to fill the roll segment's own
    triplet-note count, then — exactly like `generatePattern`'s own `previousEndHand` handling and
    the bar 1 -> bar 2 seam fix, both elsewhere in this file — mirrored (every hand flipped) if the
    tiled result doesn't already open on the hand rule A requires, rather than generated directly
    from a start hand the way `rollSticking`/`alternatingSticking` are. One accepted, documented
    consequence of keeping these as three separate literal cells rather than one "broken double"
    shape evaluated at two start hands: two of the three (`RLR`, `RRL`) already open on R, so when
    rule A requires an R start, `LLR` is the only pick that needs mirroring (into `RRL`) — making
    the broken-double shape (`RRL`/`LLR`) about twice as likely as the alternating shape (`RLR`) to
    actually appear whenever the required start hand is R, and the mirror image of that split when
    it's L. Not a bug — a direct, transparent consequence of the request's own three named options,
    not two evenly-weighted ones. */
const TRIPLET_CELLS: Hand[][] = [hands("RLR"), hands("RRL"), hands("LLR")];

/** How the roll segment (the second half of the pattern's own 4/4 bar) is written — see this
    file's own doc comment for what each one means musically. */
export type RollType = "single" | "double" | "triplet";

export const ROLL_TYPES: { value: RollType; label: string }[] = [
  { value: "single", label: "Single stroke roll" },
  { value: "double", label: "Double stroke roll" },
  { value: "triplet", label: "Triplets" },
];

export interface StickControlOptions {
  rollType: RollType;
}

export interface GeneratedPattern {
  /** Always 4 now — meter stopped being configurable per a direct simplification request. Still a
      field (not inlined as a constant everywhere it's read), so the renderer/engine stay generic
      over whatever this turns out to be. */
  beatsPerBar: number;
  /** Normally exactly 2 bars; 4 when the pattern's own loop-closing seam (bar 2's last stroke into
      bar 1's first, once the pattern repeats) would otherwise collide on the same hand — see
      `generatePattern`'s own comment on that case. Never user-chosen or computed by any other
      rule. */
  bars: NoteCell[][];
}

function randomInt(max: number): number {
  return Math.floor(Math.random() * max);
}

/** Repeats (tiles) `cell` end to end until the result is exactly `length` long — the same "just
    keep restarting the cell from the top" approach these patterns themselves use at their own bar
    seams (e.g. a 4-stroke cell's hand can repeat across the seam, like ...L R | R L...; that's how
    the original source itself is written, not an artifact of tiling). */
function tileTo<T>(cell: T[], length: number): T[] {
  return Array.from({ length }, (_, i) => cell[i % cell.length]);
}

/** Picks a random one of the 72 transcribed sticking patterns — per a direct simplification
    request ("get rid of sticking source and just always make it random"), the only way this
    tool's straight segment is ever sourced now; the earlier "a specific pattern" and
    "procedurally generated" alternatives (and the selector choosing between all three) are gone,
    not hidden. Returns just the sticking itself — a later round removed the "which pattern is
    this" label this used to also return, per a direct request not to identify patterns by
    number. */
function randomPattern(): Hand[] {
  return SINGLE_BEAT_COMBINATIONS[randomInt(SINGLE_BEAT_COMBINATIONS.length)];
}

/** Builds one roll segment's cells — straight-8th-note-equivalent beats' worth, written at
    whichever speed `rollType` calls for — already guaranteed to open on `rollStartHand` (rule A;
    see this file's own doc comment) regardless of which type is picked, though "triplet" gets
    there by an explicit mirror-correction while "single"/"double" generate directly from the
    required hand (see `alternatingSticking`/`rollSticking`'s own comments). */
function buildRollCells(rollType: RollType, rollStartHand: Hand, rollBeats: number): NoteCell[] {
  if (rollType === "triplet") {
    const base = TRIPLET_CELLS[randomInt(TRIPLET_CELLS.length)];
    const tiled = tileTo(base, rollBeats * TRIPLET_NOTES_PER_BEAT);
    const corrected = tiled[0] === rollStartHand ? tiled : tiled.map(otherHand);
    return toTripletCells(corrected);
  }
  const rollSlotsFast = rollBeats * (1 / CELL_BEAT_FRACTION.fast);
  const hands =
    rollType === "single"
      ? alternatingSticking(rollSlotsFast, rollStartHand)
      : tileTo(rollSticking(ROLL_SIZE, rollStartHand), rollSlotsFast);
  return toFastCells(hands);
}

/** Builds a fresh random pattern (always 4/4, straight 8th notes) — pure and deterministic given
    its own randomness (and, when passed, `previousEndHand`), so both the component (for an idle
    preview) and the playback engine (for precomputing the next pattern in the continuity chain)
    can call it directly with no shared state. `previousEndHand`, when given, is the hand a
    *previous* pattern's own last stroke actually ended on — this pattern's own first stroke is
    then forced to be the opposite of it (see this file's own doc comment for why flipping the
    whole straight-segment cell for this is safe). */
export function generatePattern(options: StickControlOptions, previousEndHand?: Hand): GeneratedPattern {
  const { rollType } = options;
  // Always 4/4 — meter stopped being configurable per a direct simplification request.
  const beatsPerBar = 4;
  const straightBeats = Math.max(1, Math.floor(beatsPerBar / 2));
  const rollBeats = Math.max(1, beatsPerBar - straightBeats);
  // The straight segment is always 8th notes (2 per beat) — per an earlier simplification
  // request, the only note value this tool offers for it now.
  const straightSlots = straightBeats * (1 / CELL_BEAT_FRACTION.normal);

  let full16 = randomPattern();
  if (previousEndHand !== undefined && full16[0] === previousEndHand) {
    full16 = full16.map(otherHand);
  }

  // Both bars' straight segments come from *one* continuous tiling of the pattern, split in
  // half, rather than each bar independently restarting at position 0 or mirroring the other
  // (both tried and reported wrong) — see this file's own doc comment for the full history.
  const allStraightHands = tileTo(full16, straightSlots * 2);
  const straightHands1 = allStraightHands.slice(0, straightSlots);
  let straightHands2 = allStraightHands.slice(straightSlots, straightSlots * 2);

  function buildBar(straightHands: Hand[]): NoteCell[] {
    // The roll always opens on whichever hand this bar's own straight segment *didn't* just end
    // on, so the hand-off is a genuine alternation, never a repeat of the same hand.
    const rollStartHand = otherHand(straightHands[straightHands.length - 1]);
    return [...toCells(straightHands), ...buildRollCells(rollType, rollStartHand, rollBeats)];
  }

  const bar1 = buildBar(straightHands1);

  // For the bar 1 -> bar 2 seam to be a genuine hand change, bar 2's straight segment has to
  // *start* on a different hand than bar 1's roll just *ended* on — read directly off bar 1's own
  // actual last cell, not derived mathematically. (An earlier version here assumed a roll always
  // ends on the same hand its own bar's straight segment did, true only when the roll cell's own
  // length divides evenly into however many fast slots it's tiled to — true for the default
  // meter, but false in general once `rollSlotsFast` stops being a clean multiple of `ROLL_SIZE`,
  // which produced real, confirmed failures at other meters; reading the actual value sidesteps
  // needing that assumption to hold at all.) Continuing the tiling above already gets this right
  // for patterns built from plain period-2 alternation (their own straight segment's start/end
  // hands already differ), but not every pattern — one whose straight segment starts and ends on
  // the *same* hand (not just "RRRR," something like "RLLR" has this too) can still collide at
  // the seam otherwise, confirmed directly by a reported screenshot of exactly that collision.
  // When it would, flip just bar 2's straight segment (never its roll, which is always re-derived
  // fresh from whatever that segment turns out to be) rather than the whole bar, so the seam is
  // clean no matter which pattern or meter comes up.
  const roll1EndHand = bar1[bar1.length - 1].hand;
  if (straightHands2[0] === roll1EndHand) {
    straightHands2 = straightHands2.map(otherHand);
  }

  const bar2 = buildBar(straightHands2);

  // The pattern repeats (bar 2 feeding straight back into bar 1 on the next lap), and that
  // loop-closing seam — bar 2's own last stroke into bar 1's own first — was never checked by any
  // of the seam logic above, which only ever looked at transitions *within* one lap. Reported
  // directly, with a worked example: an R ending bar 2 and an R starting bar 1 over again. When
  // that would collide, duplicate the whole 2-bar pattern into 4, with bars 3-4 the exact mirror
  // (every hand flipped) of bars 1-2 — mirroring preserves every seam relationship already
  // verified above (see `mirrorCells`'s own comment), so bars 3-4 stay internally clean on their
  // own, and the *new* loop-closing seam (bar 4's last stroke into bar 1's first) is now a genuine
  // hand change too, since bar 4 is bar 2 with every hand flipped — concretely, if bar 2 ended on
  // R (the collision), bar 4 (mirrored) ends on L, which is no longer the same as bar 1's own
  // (unflipped) first hand.
  const loopCloses = bar2[bar2.length - 1].hand === bar1[0].hand;
  const bars = loopCloses ? [bar1, bar2, mirrorCells(bar1), mirrorCells(bar2)] : [bar1, bar2];

  return { beatsPerBar, bars };
}
