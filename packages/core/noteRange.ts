export type ParsedRange = {
  lowMidi: number;
  highMidi: number;
};

const CHROMATIC = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];

const FLAT_TO_SHARP: Record<string, string> = {
  Cb: "B",
  Db: "C#",
  Eb: "D#",
  Fb: "E",
  Gb: "F#",
  Ab: "G#",
  Bb: "A#",
};

const NOTE_RE = /^([A-Ga-g])(#|b)?(\d+)$/;
const RANGE_RE = /^\s*([A-Ga-g](?:#|b)?\d+)\s*(?:-|to)\s*([A-Ga-g](?:#|b)?\d+)\s*$/i;

function noteToMidi(noteName: string, octave: number): number | null {
  const idx = CHROMATIC.indexOf(noteName);
  if (idx === -1) return null;
  return idx + (octave + 1) * 12;
}

export function midiToNote(midi: number): string {
  const idx = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${CHROMATIC[idx]}${octave}`;
}

export function parseNote(raw: string): number | null {
  const match = NOTE_RE.exec(raw.trim());
  if (!match) return null;
  const [, letter, accidental, octaveStr] = match;
  let name = letter.toUpperCase();
  if (accidental === "#") name += "#";
  else if (accidental === "b") name = FLAT_TO_SHARP[name + "b"] ?? name;
  return noteToMidi(name, Number(octaveStr));
}

export function parseRange(raw: string): ParsedRange | null {
  const match = RANGE_RE.exec(raw);
  if (!match) return null;
  const low = parseNote(match[1]);
  const high = parseNote(match[2]);
  if (low === null || high === null) return null;
  return low <= high ? { lowMidi: low, highMidi: high } : { lowMidi: high, highMidi: low };
}

export function randomNoteInRange(range: ParsedRange): string {
  const span = range.highMidi - range.lowMidi + 1;
  const midi = range.lowMidi + Math.floor(Math.random() * span);
  return midiToNote(midi);
}

export function noteToFrequency(note: string): number | null {
  const midi = parseNote(note);
  return midi === null ? null : 440 * 2 ** ((midi - 69) / 12);
}
