import { midiToNote } from "./noteRange";
import { spellNote, type AccidentalStyle } from "./noteSpelling";
import { prettyQuality } from "./iRealPro";

export type ChordQuality = {
  id: string;
  category: string;
  /** iReal-Pro-style quality suffix — "" (major triad), "-" (minor), "^7" (major 7), "h7"
      (half-diminished 7, iReal's own letter for it), "o7" (diminished 7), etc. This is both the
      canonical answer text (what "correctly formatted" looks like once revealed) and — run
      through `prettyQuality` — how it's drawn (^ → Δ, h → ø, o → °, # → ♯, b → ♭), the exact same
      substitution Chord Charts uses, so a chord here looks like a chord there. */
  suffix: string;
  /** Full name, e.g. "Minor 7♭5 (half-diminished)" — shown in results/struggles, never before a
      round is graded (that would give the answer away). */
  name: string;
  /** Semitone offsets from the root, ascending — the notes actually played. */
  intervals: number[];
  /** Alternate typed spellings that also count, beyond the suffix itself (always accepted) —
      "maj7", "m7", "dim", "sus4", etc. Matched case-insensitively, spaces/parens stripped (see
      `normalizeQualityText`). Deliberately doesn't include bare "M" for major or "M7" for major
      7: since matching is case-insensitive there's no way to tell "M" (major) from "m" (minor)
      apart once normalized, and "m"/"m7"/... for minor is by far the more universal shorthand, so
      that's the one bare-letter form that's supported — major relies on "maj"/"" instead. */
  aliases: string[];
};

/** Display order for the category groupings in the chord picker. */
export const CHORD_CATEGORIES = [
  "Triads",
  "Sixths",
  "Sevenths",
  "Altered dominants",
  "Extensions",
  "Sus & add",
] as const;

export const CHORD_QUALITIES: ChordQuality[] = [
  // Triads.
  { id: "maj", category: "Triads", suffix: "", name: "Major", intervals: [0, 4, 7], aliases: ["maj", "major"] },
  { id: "min", category: "Triads", suffix: "-", name: "Minor", intervals: [0, 3, 7], aliases: ["m", "min", "minor"] },
  { id: "dim", category: "Triads", suffix: "o", name: "Diminished", intervals: [0, 3, 6], aliases: ["dim", "diminished"] },
  { id: "aug", category: "Triads", suffix: "+", name: "Augmented", intervals: [0, 4, 8], aliases: ["aug", "augmented"] },
  { id: "sus4", category: "Triads", suffix: "sus", name: "Sus4", intervals: [0, 5, 7], aliases: ["sus", "sus4"] },
  { id: "sus2", category: "Triads", suffix: "sus2", name: "Sus2", intervals: [0, 2, 7], aliases: ["sus2"] },

  // Sixths.
  { id: "six", category: "Sixths", suffix: "6", name: "6", intervals: [0, 4, 7, 9], aliases: ["6"] },
  { id: "min6", category: "Sixths", suffix: "-6", name: "Minor 6", intervals: [0, 3, 7, 9], aliases: ["m6", "min6", "minor6"] },
  { id: "sixNine", category: "Sixths", suffix: "69", name: "6/9", intervals: [0, 4, 7, 9, 14], aliases: ["69", "6/9", "6add9"] },

  // Sevenths.
  { id: "maj7", category: "Sevenths", suffix: "^7", name: "Major 7", intervals: [0, 4, 7, 11], aliases: ["maj7"] },
  { id: "min7", category: "Sevenths", suffix: "-7", name: "Minor 7", intervals: [0, 3, 7, 10], aliases: ["m7", "min7", "minor7"] },
  { id: "dom7", category: "Sevenths", suffix: "7", name: "Dominant 7", intervals: [0, 4, 7, 10], aliases: ["7", "dom7", "dominant7"] },
  {
    id: "min7b5",
    category: "Sevenths",
    suffix: "h7",
    name: "Minor 7♭5 (half-diminished)",
    intervals: [0, 3, 6, 10],
    aliases: ["m7b5", "min7b5", "-7b5", "halfdim", "halfdiminished"],
  },
  { id: "dim7", category: "Sevenths", suffix: "o7", name: "Diminished 7", intervals: [0, 3, 6, 9], aliases: ["dim7", "diminished7"] },
  {
    id: "minMaj7",
    category: "Sevenths",
    suffix: "-^7",
    name: "Minor Major 7",
    intervals: [0, 3, 7, 11],
    aliases: ["minmaj7", "mmaj7", "min(maj7)", "m(maj7)", "-maj7"],
  },

  // Altered dominants.
  { id: "dom7sharp5", category: "Altered dominants", suffix: "7#5", name: "7♯5", intervals: [0, 4, 8, 10], aliases: ["7#5", "7+5"] },
  { id: "dom7flat5", category: "Altered dominants", suffix: "7b5", name: "7♭5", intervals: [0, 4, 6, 10], aliases: ["7b5", "7-5"] },
  { id: "dom7sharp9", category: "Altered dominants", suffix: "7#9", name: "7♯9", intervals: [0, 4, 7, 10, 15], aliases: ["7#9"] },
  { id: "dom7flat9", category: "Altered dominants", suffix: "7b9", name: "7♭9", intervals: [0, 4, 7, 10, 13], aliases: ["7b9"] },
  { id: "dom7sharp11", category: "Altered dominants", suffix: "7#11", name: "7♯11", intervals: [0, 4, 7, 10, 18], aliases: ["7#11"] },

  // Extensions (built as a plain stack up to the named extension).
  { id: "nine", category: "Extensions", suffix: "9", name: "9", intervals: [0, 4, 7, 10, 14], aliases: ["9"] },
  { id: "min9", category: "Extensions", suffix: "-9", name: "Minor 9", intervals: [0, 3, 7, 10, 14], aliases: ["m9", "min9", "minor9"] },
  { id: "maj9", category: "Extensions", suffix: "^9", name: "Major 9", intervals: [0, 4, 7, 11, 14], aliases: ["maj9"] },
  { id: "eleven", category: "Extensions", suffix: "11", name: "11", intervals: [0, 4, 7, 10, 14, 17], aliases: ["11"] },
  { id: "min11", category: "Extensions", suffix: "-11", name: "Minor 11", intervals: [0, 3, 7, 10, 14, 17], aliases: ["m11", "min11", "minor11"] },
  { id: "thirteen", category: "Extensions", suffix: "13", name: "13", intervals: [0, 4, 7, 10, 14, 17, 21], aliases: ["13"] },
  { id: "min13", category: "Extensions", suffix: "-13", name: "Minor 13", intervals: [0, 3, 7, 10, 14, 17, 21], aliases: ["m13", "min13", "minor13"] },
  { id: "maj13", category: "Extensions", suffix: "^13", name: "Major 13", intervals: [0, 4, 7, 11, 14, 17, 21], aliases: ["maj13"] },

  // Sus & add.
  { id: "dom7sus4", category: "Sus & add", suffix: "7sus", name: "7sus4", intervals: [0, 5, 7, 10], aliases: ["7sus", "7sus4"] },
  { id: "dom9sus4", category: "Sus & add", suffix: "9sus", name: "9sus4", intervals: [0, 5, 7, 10, 14], aliases: ["9sus", "9sus4"] },
  { id: "add9", category: "Sus & add", suffix: "add9", name: "Add9", intervals: [0, 4, 7, 14], aliases: ["add9", "add2"] },
  { id: "minAdd9", category: "Sus & add", suffix: "-add9", name: "Minor Add9", intervals: [0, 3, 7, 14], aliases: ["madd9", "minadd9", "-add2"] },
  { id: "five", category: "Sus & add", suffix: "5", name: "5 (Power Chord)", intervals: [0, 7], aliases: ["5"] },
];

/** A sensible common core, mirroring Scale Trainer's "starter subset" — the rest of the (much
    bigger, weirder) bank is there to opt into, not thrown at a first-time player all at once. */
export const DEFAULT_ENABLED_CHORD_IDS = [
  "maj",
  "min",
  "dom7",
  "maj7",
  "min7",
  "min7b5",
  "dim7",
  "sus4",
  "six",
  "min6",
  "nine",
  "add9",
];

const QUALITY_BY_ID = new Map(CHORD_QUALITIES.map((q) => [q.id, q]));

const NATURAL_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** A-G plus an optional sharp/flat to a 0-11 pitch class, or null for anything else. */
function letterToPc(letter: string, accidental?: "#" | "b"): number | null {
  const base = NATURAL_PC[letter.toUpperCase()];
  if (base === undefined) return null;
  const delta = accidental === "#" ? 1 : accidental === "b" ? -1 : 0;
  return (((base + delta) % 12) + 12) % 12;
}

/** A pitch class (0-11) spelled per `style`, no octave — reuses `spellNote`'s accidental logic
    via a throwaway octave, the same trick Interval/Scale Trainer use internally. */
export function pcLabel(pc: number, style: AccidentalStyle, seq: number): string {
  return spellNote(midiToNote(60 + pc), style, seq, true);
}

export type ChordRound = {
  quality: ChordQuality;
  rootPc: number;
  /** null when there's no slash bass (or the "slash" bass happened to land on the root itself,
      which isn't a slash chord at all). */
  bassPc: number | null;
  rootMidi: number;
  /** Every note actually played — the bass (if any) first, then the chord tones root-up. */
  notes: string[];
};

function buildRound(rootMidi: number, quality: ChordQuality, bassPc: number | null): ChordRound {
  const rootPc = (((rootMidi % 12) + 12) % 12);
  const normalizedBassPc = bassPc !== null && bassPc !== rootPc ? bassPc : null;
  const chordNotes = quality.intervals.map((iv) => midiToNote(rootMidi + iv));
  let notes = chordNotes;
  if (normalizedBassPc !== null) {
    // The bass sits under the root, not wherever it'd fall by pitch-class math alone — walk down
    // from the root to the nearest octave of the bass pitch class below it.
    let bassMidi = rootMidi - 1;
    while ((((bassMidi % 12) + 12) % 12) !== normalizedBassPc) bassMidi--;
    notes = [midiToNote(bassMidi), ...chordNotes];
  }
  return { quality, rootPc, bassPc: normalizedBassPc, rootMidi, notes };
}

/** A fresh round: a random quality from `pool`, a random root in `[rootLowMidi, rootHighMidi]`,
    and — with probability `slashChance` (0-1) — a random slash bass (any of the 12 pitch
    classes, not just a chord tone, so it can land on a "weird" non-diatonic bass same as a real
    slash chord sometimes does). */
export function randomChordRound(
  rootLowMidi: number,
  rootHighMidi: number,
  pool: ChordQuality[],
  slashChance: number,
): ChordRound {
  const quality = pool[Math.floor(Math.random() * pool.length)];
  const rootMidi = rootLowMidi + Math.floor(Math.random() * (rootHighMidi - rootLowMidi + 1));
  const bassPc = Math.random() < slashChance ? Math.floor(Math.random() * 12) : null;
  return buildRound(rootMidi, quality, bassPc);
}

/** A round on this exact quality/root pitch class/bass, in a random octave that fits — or null if
    no octave of the root fits the range at all. Used both to requeue a drill/weak miss (the same
    chord again, just a freshly re-rolled octave) and to build the drill/weak queues themselves. */
export function chordRoundForRootAndQuality(
  rootLowMidi: number,
  rootHighMidi: number,
  quality: ChordQuality,
  rootPc: number,
  bassPc: number | null,
): ChordRound | null {
  const first = rootLowMidi + ((((rootPc - rootLowMidi) % 12) + 12) % 12);
  if (first > rootHighMidi) return null;
  const candidates: number[] = [];
  for (let midi = first; midi <= rootHighMidi; midi += 12) candidates.push(midi);
  const rootMidi = candidates[Math.floor(Math.random() * candidates.length)];
  return buildRound(rootMidi, quality, bassPc);
}

/** The full drill: every selected quality, starting on all 12 keys (each its own random octave,
    and independently rolling a slash bass per `slashChance`) — the exhaustive "Drill every
    chord" sweep. Unshuffled — callers that want a random order shuffle it themselves. */
export function drillQueueForPool(
  rootLowMidi: number,
  rootHighMidi: number,
  pool: ChordQuality[],
  slashChance: number,
): ChordRound[] {
  const rounds: ChordRound[] = [];
  for (const quality of pool) {
    for (let pc = 0; pc < 12; pc++) {
      const bassPc = Math.random() < slashChance ? Math.floor(Math.random() * 12) : null;
      const round = chordRoundForRootAndQuality(rootLowMidi, rootHighMidi, quality, pc, bassPc);
      if (round) rounds.push(round);
    }
  }
  return rounds;
}

// --- Typed-answer parsing -------------------------------------------------

/** Root/bass letter, an accidental, then everything in between is the quality text (typed
    freeform) — the same shape `lib/iRealPro.ts`'s `CHORD_RE`/`splitMain` use for iReal's own
    grammar, just permissive about what the quality text can contain instead of a fixed char
    class, since the player might type a word ("maj7") as easily as a symbol ("^7"). The quality
    group is non-greedy, so with an anchored `$` it naturally backtracks to treat a trailing
    "/<letter>" as the bass separator only when a real note letter follows the last slash —
    "F6/9" (a six-nine chord, no real bass) has no letter after its "/", so the whole "6/9"
    ends up in the quality group instead. */
const CHORD_INPUT_RE = /^([A-Ga-g])(#|b|♯|♭)?(.*?)(?:\/([A-Ga-g])(#|b|♯|♭)?)?$/;

function normalizeAccidental(raw: string | undefined): "#" | "b" | undefined {
  if (raw === "#" || raw === "♯") return "#";
  if (raw === "b" || raw === "♭") return "b";
  return undefined;
}

/** Case/whitespace/punctuation-insensitive, and folds the "pretty" glyphs a player might paste
    or type via a symbol picker back to their plain-text iReal equivalents, so "Δ7" and "maj7"
    both look up the same alias. */
function normalizeQualityText(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()]/g, "")
    .replace(/δ/g, "^")
    .replace(/ø/g, "h")
    .replace(/°/g, "o")
    .replace(/♯/g, "#")
    .replace(/♭/g, "b");
}

const QUALITY_ALIASES = new Map<string, string>();
for (const quality of CHORD_QUALITIES) {
  QUALITY_ALIASES.set(normalizeQualityText(quality.suffix), quality.id);
  for (const a of quality.aliases) QUALITY_ALIASES.set(normalizeQualityText(a), quality.id);
}

export type ParsedChordInput = {
  rootLetter: string;
  rootAccidental?: "#" | "b";
  rootPc: number;
  /** Exactly as typed (for the live "proper formatted notation" preview) — not normalized. */
  qualityRaw: string;
  /** The resolved quality, or null if `qualityRaw` doesn't match any known chord (yet — while
      typing, this is normal and not itself an error). */
  qualityId: string | null;
  bassLetter?: string;
  bassAccidental?: "#" | "b";
  bassPc: number | null;
};

/** Parses whatever's been typed so far. Returns null only when there's no usable root at all
    (empty input, or text that doesn't start with a note letter) — a recognizable root with an
    not-yet-recognized quality still parses (`qualityId: null`), since that's the normal state of
    a chord that's only half-typed. */
export function parseChordInput(raw: string): ParsedChordInput | null {
  const compact = raw.trim().replace(/\s+/g, "");
  if (!compact) return null;
  const match = CHORD_INPUT_RE.exec(compact);
  if (!match) return null;
  const [, rootLetterRaw, rootAccRaw, qualityRaw, bassLetterRaw, bassAccRaw] = match;
  const rootAccidental = normalizeAccidental(rootAccRaw);
  const rootPc = letterToPc(rootLetterRaw, rootAccidental);
  if (rootPc === null) return null;
  const bassAccidental = normalizeAccidental(bassAccRaw);
  const bassPc = bassLetterRaw ? letterToPc(bassLetterRaw, bassAccidental) : null;
  return {
    rootLetter: rootLetterRaw.toUpperCase(),
    rootAccidental,
    rootPc,
    qualityRaw,
    qualityId: QUALITY_ALIASES.get(normalizeQualityText(qualityRaw)) ?? null,
    bassLetter: bassLetterRaw?.toUpperCase(),
    bassAccidental,
    bassPc,
  };
}

/** Whether a parsed answer matches a round — root, quality and slash bass all have to agree
    (comparing `null` bass to `null` bass when there's no slash either way). Enharmonic spelling
    doesn't matter (comparison is by pitch class), matching how every other trainer here treats
    enharmonic equivalence. */
export function chordInputMatchesRound(parsed: ParsedChordInput, round: ChordRound): boolean {
  return (
    parsed.rootPc === round.rootPc &&
    parsed.qualityId === round.quality.id &&
    (parsed.bassPc ?? null) === (round.bassPc ?? null)
  );
}

/** How a parsed chord (typed input, or a round's own answer) is actually drawn — root text,
    the quality run through `prettyQuality`'s Chord-Charts-matching glyph substitution, and an
    optional "/bass". Used for both the live-typing preview and the revealed-answer label. */
export function formatChordParts(parsed: {
  rootLetter: string;
  rootAccidental?: "#" | "b";
  qualityRaw: string;
  bassLetter?: string;
  bassAccidental?: "#" | "b";
}): { root: string; quality: string; bass: string | null } {
  const accidentalGlyph = (a?: "#" | "b") => (a === "#" ? "♯" : a === "b" ? "♭" : "");
  return {
    root: parsed.rootLetter + accidentalGlyph(parsed.rootAccidental),
    quality: prettyQuality(parsed.qualityRaw),
    bass: parsed.bassLetter ? parsed.bassLetter + accidentalGlyph(parsed.bassAccidental) : null,
  };
}

/** The canonical, correctly-formatted answer for a round, in the same shape `formatChordParts`
    produces — for the revealed-answer label once a round is graded. */
export function chordRoundParts(
  round: ChordRound,
  style: AccidentalStyle,
  seq: number,
): { root: string; quality: string; bass: string | null } {
  return {
    root: pcLabel(round.rootPc, style, seq),
    quality: prettyQuality(round.quality.suffix),
    bass: round.bassPc !== null ? pcLabel(round.bassPc, style, seq + 1) : null,
  };
}

export function chordQualityById(id: string): ChordQuality | undefined {
  return QUALITY_BY_ID.get(id);
}
