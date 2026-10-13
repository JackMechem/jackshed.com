import type { Bar, ChordSlot, IRealSong } from "./iRealPro";
import { chordQualityById } from "./chords";
import { parseNumeral } from "./progressions";

// Bass Genius's "type a progression" input: chord names ("Dm7 G7 Cmaj7", "F7#9/A") or roman
// numerals in a key ("ii7 V7 Imaj7", "bVII7", "V7/ii"), mixed freely, turned into a plain chart
// the bass can play. A "|" marks a barline (several chords between two bars share the bar);
// without any "|", every chord gets a bar of its own. "%" repeats the previous bar.

const SHARP_KEYS = new Set([7, 2, 9, 4, 11, 6]); // G D A E B F#
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/** A pitch class spelled for a key: sharps in sharp keys, flats otherwise (F# not Gb). */
function spell(pc: number, keyPc: number): { letter: string; accidental?: "b" | "#" } {
  const name = (SHARP_KEYS.has(keyPc) ? SHARP_NAMES : FLAT_NAMES)[((pc % 12) + 12) % 12];
  const fixed = name === "Gb" ? "F#" : name;
  return { letter: fixed[0], accidental: (fixed[1] as "b" | "#" | undefined) || undefined };
}

/** What a chord suffix can look like once normalized: an optional minor/augmented/diminished/
    half-diminished mark, major-7 mark, a number, then any alterations, sus/add or "alt". */
const QUALITY_RE = /^(?:-|\+|o|h)?\^?(?:5|6|7|9|11|13|69)?(?:sus[24]?|add(?:2|4|9|11|13)|[b#](?:5|9|11|13)|alt|\^7?|\+|7|9|11|13)*$/;

/** Everyday quality spellings ("maj7", "m7b5", "dim", "Δ", "ø", "M7") to iReal's suffix grammar
    ("^7", "-7b5", "o", "^", "h", "^7") — what the chart renderer and the bass both read. */
export function normalizeQuality(raw: string): string | null {
  let q = raw
    .replace(/[\s()]/g, "")
    .replace(/Δ|∆/g, "^")
    .replace(/ø/g, "h")
    .replace(/°/g, "o")
    .replace(/♭/g, "b")
    .replace(/♯/g, "#")
    .replace(/M(?=\d|$)/g, "^") // CM7, CM = major
    .replace(/maj|ma(?=\d|$)/gi, "^")
    .replace(/min|mi(?=\d|$)/gi, "-")
    .replace(/dim/gi, "o")
    .replace(/aug/gi, "+")
    .replace(/m(?!aj)/g, "-");
  q = q.replace(/\^+/g, "^");
  if (q === "^") q = "^7"; // "CΔ" / "Cmaj" means a major 7 on a chart
  if (q === "h") q = "h7";
  if (q === "-^") q = "-^7";
  return QUALITY_RE.test(q) ? q : null;
}

const CHORD_RE = /^([A-Ga-g])([b#♭♯]?)([^/]*)(?:\/([A-Ga-g])([b#♭♯]?))?$/;
const acc = (a: string): "b" | "#" | undefined => (a === "b" || a === "♭" ? "b" : a === "#" || a === "♯" ? "#" : undefined);

function parseChordName(token: string): ChordSlot | null {
  const m = CHORD_RE.exec(token);
  if (!m) return null;
  const quality = normalizeQuality(m[3]);
  if (quality === null) return null;
  return {
    kind: "chord",
    letter: m[1].toUpperCase(),
    accidental: acc(m[2]),
    quality,
    bass: m[4] ? { letter: m[4].toUpperCase(), accidental: acc(m[5]) } : undefined,
  };
}

/** A numeral's iReal suffix: the parsed quality if known, otherwise the typed suffix read the
    everyday way (a lowercase numeral adds minor unless the suffix already says ø/°/minor). */
function numeralSuffix(token: string): { degree: number; suffix: string } | null {
  const n = parseNumeral(token);
  if (!n) return null;
  const known = n.qualityId ? chordQualityById(n.qualityId) : undefined;
  if (known) return { degree: n.degree, suffix: known.suffix };
  const q = normalizeQuality(n.qualityRaw);
  if (q === null) return null;
  const minorAlready = /^[-ho]/.test(q);
  return { degree: n.degree, suffix: n.lower && !minorAlready ? `-${q}` : q };
}

const NUMERAL_START = /^[b#♭♯]?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)/;

function parseNumeralChord(token: string, keyPc: number): ChordSlot | null {
  // "V7/ii" — a secondary chord, built on the degree after the slash.
  const [main, of] = token.split("/");
  let tonic = keyPc;
  if (of !== undefined) {
    const target = parseNumeral(of);
    if (!target) return null;
    tonic = (keyPc + target.degree) % 12;
  }
  const n = numeralSuffix(main);
  if (!n) return null;
  return { kind: "chord", ...spell(tonic + n.degree, keyPc), quality: n.suffix };
}

export type TypedChordKind = "numeral" | "name";

/** One typed token as a chord, or null if it isn't one. */
export function parseTypedChord(token: string, keyPc: number): { slot: ChordSlot; kind: TypedChordKind } | null {
  const t = token.trim();
  if (!t) return null;
  if (/^(n\.?c\.?)$/i.test(t)) return { slot: { kind: "nc" }, kind: "name" };
  if (NUMERAL_START.test(t)) {
    const slot = parseNumeralChord(t, keyPc);
    return slot ? { slot, kind: "numeral" } : null;
  }
  const slot = parseChordName(t);
  return slot ? { slot, kind: "name" } : null;
}

export type TypedProgression = {
  /** Null when nothing playable was typed. */
  song: IRealSong | null;
  /** Tokens that couldn't be read as chords. */
  unknown: string[];
  /** Any roman numerals in it (so the key matters). */
  usesNumerals: boolean;
};

/** Splits a bar's text into chord tokens: spaces and commas, and dashes between numerals
    ("ii-V-I") — but not a minor dash ("D-7", "ii-7"). */
function tokensOf(text: string): string[] {
  return text
    .split(/[\s,]+/)
    .filter(Boolean)
    .flatMap((p) => p.split(/[-–—](?=[b#♭♯]?[ivIV])/))
    .flatMap((p) => p.split(/[–—]/))
    .filter(Boolean);
}

export function parseTypedProgression(text: string, keyPc: number, timeSignature: { top: number; bottom: number }): TypedProgression {
  const hasBars = text.includes("|");
  const barTexts = hasBars ? text.split(/[|\n]+/) : tokensOf(text);
  const bars: Bar[] = [];
  const unknown: string[] = [];
  let usesNumerals = false;
  for (const barText of barTexts) {
    const tokens = hasBars ? tokensOf(barText) : [barText];
    if (tokens.length === 0) continue;
    if (tokens.length === 1 && (tokens[0] === "%" || tokens[0] === "x")) {
      if (bars.length) bars.push({ content: { kind: "repeat" } });
      continue;
    }
    const slots: ChordSlot[] = [];
    for (const token of tokens) {
      const parsed = parseTypedChord(token, keyPc);
      if (!parsed) {
        unknown.push(token);
        continue;
      }
      if (parsed.kind === "numeral") usesNumerals = true;
      slots.push(parsed.slot);
    }
    if (slots.length) bars.push({ content: { kind: "chords", slots } });
  }
  if (!bars.some((b) => b.content.kind === "chords" && b.content.slots.some((s) => s.kind === "chord"))) {
    return { song: null, unknown, usesNumerals };
  }
  const key = spell(keyPc, keyPc);
  return {
    song: {
      title: "Your progression",
      composer: "",
      style: "",
      key: `${key.letter}${key.accidental ?? ""}`,
      timeSignature,
      bars,
    },
    unknown,
    usesNumerals,
  };
}
