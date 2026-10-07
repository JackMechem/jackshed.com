/** Shared by Note Trainer and Scale Trainer: how an accidental note gets displayed. */

export type AccidentalStyle = "sharp" | "flat" | "random" | "both";

export const ACCIDENTAL_STYLES: { value: AccidentalStyle; label: string }[] = [
  { value: "sharp", label: "Sharps (C#)" },
  { value: "flat", label: "Flats (D♭)" },
  { value: "random", label: "Random, either" },
  { value: "both", label: "Both (C#/D♭)" },
];

const SHARP_TO_FLAT: Record<string, string> = {
  "C#": "Db",
  "D#": "Eb",
  "F#": "Gb",
  "G#": "Ab",
  "A#": "Bb",
};

/** A stable pseudo-random bit for a seed, so a note's spelling doesn't flicker while it's still
    on screen (a real Math.random() call would re-roll on every re-render). */
export function seededBool(seed: number): boolean {
  const x = Math.sin(seed) * 43758.5453;
  return x - Math.floor(x) < 0.5;
}

/** Folds the note's own text into the seed so two different notes shown at once (the current
    note and the next-note preview) don't always get the same coin flip. */
export function accidentalSeed(note: string, seq: number): number {
  let h = seq;
  for (let i = 0; i < note.length; i++) h = h * 31 + note.charCodeAt(i);
  return h;
}

/** Respells a note (e.g. "C#4") per the accidental style; naturals are untouched either way. */
export function spellNote(
  note: string,
  style: AccidentalStyle,
  seq: number,
  stripOctave: boolean,
): string {
  const match = /^([A-G]#?)(\d+)$/.exec(note);
  if (!match) return note;
  const [, base, octave] = match;
  const withOctave = (name: string) =>
    stripOctave ? name : `${name}${octave}`;
  const flat = SHARP_TO_FLAT[base];
  if (!flat) return withOctave(base);
  switch (style) {
    case "flat":
      return withOctave(flat);
    case "both":
      return `${withOctave(base)}/${withOctave(flat)}`;
    case "random":
      return withOctave(seededBool(accidentalSeed(note, seq)) ? flat : base);
    case "sharp":
    default:
      return withOctave(base);
  }
}
