import { midiToNote } from "./noteRange";
import type { AccidentalStyle } from "./noteSpelling";
import { prettyQuality } from "./iRealPro";
import {
  chordQualityById,
  parseChordInput,
  pcLabel,
  qualityIdForText,
  type ChordQuality,
} from "./chords";

// --- Roman numerals -------------------------------------------------------
//
// A numeral is an optional accidental, the numeral itself, then a quality suffix written the
// usual Roman-numeral way: the numeral's case already says major or minor, so the suffix only
// adds what's on top of that. Lowercase "ii7" is a minor 7, "ii" a minor triad, "iih7" (iiø7)
// half-diminished, "viio" diminished, "i^7" minor-major 7; uppercase "V7" is a dominant 7,
// "I^7" a major 7, "I" a major triad. Explicit spellings ("ii-7", "iim7") are accepted too.

const NUMERAL_PC: Record<string, number> = { i: 0, ii: 2, iii: 4, iv: 5, v: 7, vi: 9, vii: 11 };

/** Longest first, so "vii" isn't read as "v" + "ii" and "iv" isn't "i" + "v". */
const NUMERAL_RE = /^([b#♭♯])?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(.*)$/;

/** Qualities written with a lowercase numeral. */
const MINOR_FAMILY = new Set([
  "min",
  "dim",
  "min6",
  "min7",
  "min7b5",
  "dim7",
  "minMaj7",
  "min9",
  "min11",
  "min13",
  "minAdd9",
]);

export function isMinorFamily(qualityId: string): boolean {
  return MINOR_FAMILY.has(qualityId);
}

/** What a suffix means after a lowercase numeral, where the minor is already implied. */
const LOWERCASE_SUFFIX: Record<string, string> = {
  "": "min",
  "7": "min7",
  "6": "min6",
  "9": "min9",
  "11": "min11",
  "13": "min13",
  "^7": "minMaj7",
  maj7: "minMaj7",
  add9: "minAdd9",
  add2: "minAdd9",
};

function foldGlyphs(raw: string): string {
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

export type ParsedNumeral = {
  /** Semitones above the tonic, 0-11. */
  degree: number;
  /** Lowercase numeral (minor family). */
  lower: boolean;
  accidental?: "b" | "#";
  numeral: string;
  /** Exactly as typed. */
  qualityRaw: string;
  qualityId: string | null;
};

export function parseNumeral(raw: string): ParsedNumeral | null {
  const match = NUMERAL_RE.exec(raw.trim());
  if (!match) return null;
  const [, accRaw, numeral, qualityRaw] = match;
  const accidental = accRaw === "b" || accRaw === "♭" ? "b" : accRaw ? "#" : undefined;
  const lower = numeral === numeral.toLowerCase();
  const base = NUMERAL_PC[numeral.toLowerCase()];
  const degree = (((base + (accidental === "b" ? -1 : accidental === "#" ? 1 : 0)) % 12) + 12) % 12;
  const folded = foldGlyphs(qualityRaw);
  const qualityId = lower
    ? (LOWERCASE_SUFFIX[folded] ?? qualityIdForText(qualityRaw))
    : qualityIdForText(qualityRaw);
  return { degree, lower, accidental, numeral, qualityRaw, qualityId };
}

/** How a numeral token is drawn: ♭/♯, the numeral, and the suffix through `prettyQuality`. */
export function prettyNumeral(token: string): string {
  const match = NUMERAL_RE.exec(token.trim());
  if (!match) return token;
  const [, accRaw, numeral, qualityRaw] = match;
  const acc = accRaw === "b" || accRaw === "♭" ? "♭" : accRaw ? "♯" : "";
  return acc + numeral + prettyQuality(qualityRaw);
}

/** Splits a typed answer into one token per chord. Whitespace, commas and bars always separate;
    in numeral mode a dash does too when another numeral follows it ("ii-V-I"), but not when it's
    a minor sign ("ii-7"). */
export function splitAnswer(raw: string, mode: "numerals" | "chords"): string[] {
  const pieces = raw.split(/[\s,|–—]+/).filter(Boolean);
  if (mode === "chords") return pieces;
  return pieces.flatMap((p) => p.split(/-(?=[b#♭♯]?[ivIV])/)).filter(Boolean);
}

// --- Progressions ---------------------------------------------------------

export type ProgressionChord = {
  degree: number;
  quality: ChordQuality;
  /** The numeral as written in the progression, e.g. "ii7", "bVII7", "#io7". */
  numeral: string;
};

export type Progression = {
  id: string;
  category: string;
  name: string;
  chords: ProgressionChord[];
  /** Whether the progression is in a minor key (its tonic chord is lowercase). */
  minor: boolean;
};

export const PROGRESSION_CATEGORIES = [
  "Jazz",
  "Pop & rock",
  "Minor",
  "Cadences",
  "Blues",
] as const;

const SPECS: { id: string; category: string; name: string; spec: string }[] = [
  // Jazz.
  { id: "ii-V-I", category: "Jazz", name: "ii–V–I", spec: "ii7 V7 I^7" },
  { id: "ii-V-i", category: "Jazz", name: "iiø–V–i (minor)", spec: "iih7 V7 i7" },
  { id: "I-vi-ii-V", category: "Jazz", name: "I–vi–ii–V", spec: "I^7 vi7 ii7 V7" },
  { id: "iii-vi-ii-V", category: "Jazz", name: "iii–vi–ii–V", spec: "iii7 vi7 ii7 V7" },
  { id: "I-VI7-ii-V", category: "Jazz", name: "I–VI7–ii–V", spec: "I^7 VI7 ii7 V7" },
  { id: "iii-VI-ii-V-I", category: "Jazz", name: "iii–VI7–ii–V–I", spec: "iii7 VI7 ii7 V7 I^7" },
  { id: "ii-bII-I", category: "Jazz", name: "ii–♭II7–I (tritone sub)", spec: "ii7 bII7 I^7" },
  { id: "iv-bVII-I", category: "Jazz", name: "iv–♭VII7–I (backdoor)", spec: "iv7 bVII7 I^7" },
  { id: "I-#io-ii-V", category: "Jazz", name: "I–♯i°7–ii–V", spec: "I^7 #io7 ii7 V7" },
  { id: "ladybird", category: "Jazz", name: "I–♭III7–♭VI–♭II (Lady Bird)", spec: "I^7 bIII7 bVI^7 bII^7" },
  { id: "minor-turnaround", category: "Jazz", name: "i–viø–iiø–V (minor)", spec: "i7 vih7 iih7 V7" },

  // Pop & rock.
  { id: "I-V-vi-IV", category: "Pop & rock", name: "I–V–vi–IV", spec: "I V vi IV" },
  { id: "I-vi-IV-V", category: "Pop & rock", name: "I–vi–IV–V ('50s)", spec: "I vi IV V" },
  { id: "vi-IV-I-V", category: "Pop & rock", name: "vi–IV–I–V", spec: "vi IV I V" },
  { id: "I-IV-V", category: "Pop & rock", name: "I–IV–V", spec: "I IV V" },
  { id: "I-IV-vi-V", category: "Pop & rock", name: "I–IV–vi–V", spec: "I IV vi V" },
  { id: "IV-V-iii-vi", category: "Pop & rock", name: "IV–V–iii–vi", spec: "IV V iii vi" },
  { id: "I-bVII-IV", category: "Pop & rock", name: "I–♭VII–IV", spec: "I bVII IV" },
  { id: "canon", category: "Pop & rock", name: "Pachelbel's Canon", spec: "I V vi iii IV I IV V" },

  // Minor.
  { id: "i-bVII-bVI-bVII", category: "Minor", name: "i–♭VII–♭VI–♭VII", spec: "i bVII bVI bVII" },
  { id: "i-bVI-bIII-bVII", category: "Minor", name: "i–♭VI–♭III–♭VII", spec: "i bVI bIII bVII" },
  { id: "i-iv-V-i", category: "Minor", name: "i–iv–V–i", spec: "i iv V i" },
  { id: "andalusian", category: "Minor", name: "i–♭VII–♭VI–V (Andalusian)", spec: "i bVII bVI V" },

  // Cadences.
  { id: "I-IV-V-I", category: "Cadences", name: "I–IV–V–I (authentic)", spec: "I IV V I" },
  { id: "I-IV-I", category: "Cadences", name: "I–IV–I (plagal)", spec: "I IV I" },
  { id: "I-IV-V-vi", category: "Cadences", name: "I–IV–V–vi (deceptive)", spec: "I IV V vi" },
  { id: "vi-ii-V-I", category: "Cadences", name: "vi–ii–V–I", spec: "vi ii V I" },

  // Blues.
  { id: "blues", category: "Blues", name: "I7–IV7–I7–V7–IV7–I7", spec: "I7 IV7 I7 V7 IV7 I7" },
  { id: "blues-turnaround", category: "Blues", name: "I7–VI7–ii–V7 (turnaround)", spec: "I7 VI7 ii7 V7" },
];

function buildProgression(s: (typeof SPECS)[number]): Progression {
  const chords = s.spec.split(" ").map((numeral) => {
    const parsed = parseNumeral(numeral);
    const quality = parsed?.qualityId ? chordQualityById(parsed.qualityId) : undefined;
    if (!parsed || !quality) throw new Error(`Bad progression chord "${numeral}" in ${s.id}`);
    return { degree: parsed.degree, quality, numeral };
  });
  const tonic = chords.find((c) => c.degree === 0);
  return { ...s, chords, minor: !!tonic && isMinorFamily(tonic.quality.id) };
}

export const PROGRESSIONS: Progression[] = SPECS.map(buildProgression);

export const DEFAULT_ENABLED_PROGRESSION_IDS = [
  "ii-V-I",
  "ii-V-i",
  "I-vi-ii-V",
  "I-V-vi-IV",
  "I-vi-IV-V",
  "vi-IV-I-V",
  "I-IV-V",
  "andalusian",
  "I-IV-V-vi",
];

export function progressionById(id: string): Progression | undefined {
  return PROGRESSIONS.find((p) => p.id === id);
}

// --- Rounds ---------------------------------------------------------------

export type ProgressionRound = {
  progression: Progression;
  tonicPc: number;
  tonicMidi: number;
  /** Each chord's notes, bass first. */
  voicings: string[][];
  /** The tonic chord's notes, for "Play the key first". */
  tonicVoicing: string[];
};

/** Nearest MIDI note with pitch class `pc` in the 12-note window starting 6 below `center`. */
function placeNear(pc: number, center: number): number {
  const low = center - 6;
  return low + ((((pc - low) % 12) + 12) % 12);
}

/** Bass on the root around an octave below the tonic, the other chord tones packed into one
    octave above it — every chord sits in the same window, so the voices move by small steps the
    way a pianist's left/right hand would instead of jumping around in root position. */
function voiceChord(tonicMidi: number, degree: number, quality: ChordQuality): string[] {
  const rootPc = (((tonicMidi + degree) % 12) + 12) % 12;
  const pcs = [...new Set(quality.intervals.map((iv) => (rootPc + iv) % 12))];
  // A root in the right hand too only makes a triad fuller; with 4+ notes the bass covers it.
  const upperPcs = pcs.length >= 4 ? pcs.filter((pc) => pc !== rootPc) : pcs;
  const upper = upperPcs.map((pc) => placeNear(pc, tonicMidi + 12)).sort((a, b) => a - b);
  const bass = placeNear(rootPc, tonicMidi - 12);
  return [bass, ...upper].map(midiToNote);
}

function buildRound(progression: Progression, tonicMidi: number): ProgressionRound {
  const tonicQuality = chordQualityById(progression.minor ? "min" : "maj")!;
  return {
    progression,
    tonicPc: ((tonicMidi % 12) + 12) % 12,
    tonicMidi,
    voicings: progression.chords.map((c) => voiceChord(tonicMidi, c.degree, c.quality)),
    tonicVoicing: voiceChord(tonicMidi, 0, tonicQuality),
  };
}

/** A round of `progression` with its tonic in `[lowMidi, highMidi]` — a random key, or the
    nearest octave of `fixedPc` when a fixed key is chosen. */
export function progressionRound(
  progression: Progression,
  lowMidi: number,
  highMidi: number,
  fixedPc: number | null,
): ProgressionRound {
  let tonicMidi = lowMidi + Math.floor(Math.random() * (highMidi - lowMidi + 1));
  if (fixedPc !== null) {
    tonicMidi = lowMidi + ((((fixedPc - lowMidi) % 12) + 12) % 12);
  }
  return buildRound(progression, tonicMidi);
}

export function randomProgressionRound(
  pool: Progression[],
  lowMidi: number,
  highMidi: number,
  fixedPc: number | null,
): ProgressionRound {
  const progression = pool[Math.floor(Math.random() * pool.length)];
  return progressionRound(progression, lowMidi, highMidi, fixedPc);
}

/** A chord's name in the round's key, e.g. "D-7", plain iReal text. */
export function chordNameText(
  round: ProgressionRound,
  index: number,
  style: AccidentalStyle,
): string {
  const chord = round.progression.chords[index];
  return pcLabel((round.tonicPc + chord.degree) % 12, style, index) + chord.quality.suffix;
}

/** The root of the round's first chord — what "Chord names" mode hands you to start from. */
export function firstChordRoot(round: ProgressionRound, style: AccidentalStyle): string {
  return pcLabel((round.tonicPc + round.progression.chords[0].degree) % 12, style, 0);
}

// --- Grading --------------------------------------------------------------

export type AnswerMode = "numerals" | "chords";

/** Whether a chord-name token's quality reads as minor, for grading without qualities — the
    resolved quality when there is one, else a minor-looking start ("-", "m" but not "maj",
    "ø"/"h", "°"/"o", "dim"). */
function chordTokenIsMinor(qualityRaw: string, qualityId: string | null): boolean {
  if (qualityId) return isMinorFamily(qualityId);
  return /^(-|m(?!aj)|min|h|ø|o|°|dim)/i.test(qualityRaw.trim());
}

/** Whether one typed token matches chord `index` of the round. With `qualities` off, only the
    degree/root and major-vs-minor have to be right (the numeral's case, or a minor sign). */
export function tokenMatches(
  token: string | undefined,
  round: ProgressionRound,
  index: number,
  mode: AnswerMode,
  qualities: boolean,
): boolean {
  if (!token) return false;
  const chord = round.progression.chords[index];
  if (mode === "numerals") {
    const parsed = parseNumeral(token);
    if (!parsed || parsed.degree !== chord.degree) return false;
    return qualities
      ? parsed.qualityId === chord.quality.id
      : parsed.lower === isMinorFamily(chord.quality.id);
  }
  const parsed = parseChordInput(token);
  if (!parsed || parsed.bassPc !== null) return false;
  if (parsed.rootPc !== (round.tonicPc + chord.degree) % 12) return false;
  return qualities
    ? parsed.qualityId === chord.quality.id
    : chordTokenIsMinor(parsed.qualityRaw, parsed.qualityId) === isMinorFamily(chord.quality.id);
}

/** One true/false per chord in the progression. Extra typed tokens are ignored. */
export function gradeAnswer(
  raw: string,
  round: ProgressionRound,
  mode: AnswerMode,
  qualities: boolean,
): boolean[] {
  const tokens = splitAnswer(raw, mode);
  return round.progression.chords.map((_, i) => tokenMatches(tokens[i], round, i, mode, qualities));
}
