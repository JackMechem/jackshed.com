export type Instrument = {
  id: string;
  label: string;
  range: string;
  /** Open-string notes, lowest pitch first — only set for stringed instruments, and only the
      standard tuning named in `label` (a different tuning would need its own entry, same as
      lib/tunings.ts does for the Tuner). Drives Note Trainer's "Shed a string" drills. */
  strings?: string[];
};

export const CUSTOM_INSTRUMENT_ID = "custom";

export const INSTRUMENTS: Instrument[] = [
  {
    id: "bass4",
    label: "Upright / Electric Bass (4-string)",
    range: "E1-G4",
    strings: ["E1", "A1", "D2", "G2"],
  },
  {
    id: "bass5",
    label: "Electric Bass (5-string)",
    range: "B0-G4",
    strings: ["B0", "E1", "A1", "D2", "G2"],
  },
  {
    id: "guitar",
    label: "Guitar (6-string, standard tuning)",
    range: "E2-E6",
    strings: ["E2", "A2", "D3", "G3", "B3", "E4"],
  },
  {
    id: "ukulele",
    label: "Ukulele (soprano, standard tuning)",
    range: "C4-A5",
    strings: ["C4", "E4", "G4", "A4"],
  },
  { id: "piano88", label: "Piano — 88 Key", range: "A0-C8" },
  { id: "piano76", label: "Keyboard — 76 Key", range: "E1-G7" },
  { id: "piano73", label: "Keyboard — 73 Key", range: "E1-E7" },
  { id: "piano61", label: "Keyboard — 61 Key", range: "C2-C7" },
  { id: "piano49", label: "Keyboard — 49 Key", range: "C2-C6" },
  { id: "piano37", label: "Keyboard — 37 Key", range: "C3-C6" },
  { id: "piano25", label: "Keyboard — 25 Key", range: "C3-C5" },
  { id: "violin", label: "Violin", range: "G3-C7", strings: ["G3", "D4", "A4", "E5"] },
  { id: "viola", label: "Viola", range: "C3-E6", strings: ["C3", "G3", "D4", "A4"] },
  { id: "cello", label: "Cello", range: "C2-C6", strings: ["C2", "G2", "D3", "A3"] },
  { id: "trumpet", label: "Trumpet", range: "F#3-D6" },
  { id: "trombone", label: "Trombone", range: "E2-F5" },
  { id: "altosax", label: "Alto Saxophone", range: "Db3-A5" },
  { id: "tenorsax", label: "Tenor Saxophone", range: "Ab2-E5" },
  { id: "flute", label: "Flute", range: "C4-D7" },
  { id: "clarinet", label: "Clarinet (Bb)", range: "D3-C7" },
];
