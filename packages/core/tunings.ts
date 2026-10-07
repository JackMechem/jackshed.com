export type Tuning = {
  id: string;
  label: string;
  /** Open-string notes, lowest pitch first. Empty for chromatic tuning. */
  strings: string[];
};

export type TunerInstrument = {
  id: string;
  label: string;
  /** Semitones a written note sits above the concert pitch (Bb instruments = 2). */
  transpose: number;
  tunings: Tuning[];
};

const CHROMATIC: Tuning = { id: "chromatic", label: "Chromatic", strings: [] };

export const TUNER_INSTRUMENTS: TunerInstrument[] = [
  { id: "chromatic", label: "Chromatic (concert pitch)", transpose: 0, tunings: [CHROMATIC] },
  {
    id: "guitar",
    label: "Guitar (6-string)",
    transpose: 0,
    tunings: [
      {
        id: "standard",
        label: "Standard (E A D G B E)",
        strings: ["E2", "A2", "D3", "G3", "B3", "E4"],
      },
      { id: "dropd", label: "Drop D", strings: ["D2", "A2", "D3", "G3", "B3", "E4"] },
      {
        id: "halfdown",
        label: "Half step down",
        strings: ["Eb2", "Ab2", "Db3", "Gb3", "Bb3", "Eb4"],
      },
      { id: "fulldown", label: "Full step down", strings: ["D2", "G2", "C3", "F3", "A3", "D4"] },
      { id: "dadgad", label: "DADGAD", strings: ["D2", "A2", "D3", "G3", "A3", "D4"] },
      { id: "openg", label: "Open G", strings: ["D2", "G2", "D3", "G3", "B3", "D4"] },
      { id: "opend", label: "Open D", strings: ["D2", "A2", "D3", "F#3", "A3", "D4"] },
      { id: "opene", label: "Open E", strings: ["E2", "B2", "E3", "G#3", "B3", "E4"] },
      { id: "guitar7", label: "7-string", strings: ["B1", "E2", "A2", "D3", "G3", "B3", "E4"] },
      CHROMATIC,
    ],
  },
  {
    id: "bass",
    label: "Bass (electric / upright)",
    transpose: 0,
    tunings: [
      { id: "bass4", label: "4-string (E A D G)", strings: ["E1", "A1", "D2", "G2"] },
      { id: "dropd", label: "Drop D", strings: ["D1", "A1", "D2", "G2"] },
      { id: "halfdown", label: "Half step down", strings: ["Eb1", "Ab1", "Db2", "Gb2"] },
      { id: "bass5", label: "5-string (B E A D G)", strings: ["B0", "E1", "A1", "D2", "G2"] },
      {
        id: "bass6",
        label: "6-string (B E A D G C)",
        strings: ["B0", "E1", "A1", "D2", "G2", "C3"],
      },
      CHROMATIC,
    ],
  },
  {
    id: "ukulele",
    label: "Ukulele",
    transpose: 0,
    tunings: [
      { id: "standard", label: "Standard (G C E A)", strings: ["C4", "E4", "G4", "A4"] },
      { id: "lowg", label: "Low G", strings: ["G3", "C4", "E4", "A4"] },
      { id: "baritone", label: "Baritone (D G B E)", strings: ["D3", "G3", "B3", "E4"] },
      CHROMATIC,
    ],
  },
  {
    id: "violin",
    label: "Violin / Mandolin",
    transpose: 0,
    tunings: [
      { id: "standard", label: "Standard (G D A E)", strings: ["G3", "D4", "A4", "E5"] },
      CHROMATIC,
    ],
  },
  {
    id: "viola",
    label: "Viola",
    transpose: 0,
    tunings: [
      { id: "standard", label: "Standard (C G D A)", strings: ["C3", "G3", "D4", "A4"] },
      CHROMATIC,
    ],
  },
  {
    id: "cello",
    label: "Cello",
    transpose: 0,
    tunings: [
      { id: "standard", label: "Standard (C G D A)", strings: ["C2", "G2", "D3", "A3"] },
      CHROMATIC,
    ],
  },
  {
    id: "banjo",
    label: "Banjo (5-string)",
    transpose: 0,
    tunings: [
      { id: "opeg", label: "Open G (g D G B D)", strings: ["D3", "G3", "B3", "D4", "G4"] },
      { id: "doublec", label: "Double C (g C G C D)", strings: ["C3", "G3", "C4", "D4", "G4"] },
      CHROMATIC,
    ],
  },
  { id: "bb", label: "Trumpet / Clarinet / Tenor sax (B♭)", transpose: 2, tunings: [CHROMATIC] },
  { id: "eb", label: "Alto / Baritone sax (E♭)", transpose: 9, tunings: [CHROMATIC] },
  { id: "f", label: "French horn (F)", transpose: 7, tunings: [CHROMATIC] },
];

export function getInstrument(id: string): TunerInstrument {
  return TUNER_INSTRUMENTS.find((i) => i.id === id) ?? TUNER_INSTRUMENTS[0];
}

export function getTuning(instrument: TunerInstrument, tuningId: string): Tuning {
  return instrument.tunings.find((t) => t.id === tuningId) ?? instrument.tunings[0];
}
