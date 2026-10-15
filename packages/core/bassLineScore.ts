import type { BassNote, PerformedBeat } from "./bassLine";
import { newId, restsFor, spellMidi, TICKS_PER_QUARTER, type TNote, type Transcription } from "./bassTranscription";

// Writes a chorus of Bass Genius's line as a transcription, so it can be drawn with the
// transcription editor's score while it plays: one measure per bar played, the chart's chords
// above, notes quantized to the editor's grid (straight values where they fit, eighth-note triplets
// otherwise — a triplet skip becomes two tied triplet eighths and one more), long notes tied, gaps
// filled with rests.

type Shape = Pick<TNote, "value" | "dots" | "triplet">;
const STRAIGHT: [number, Shape][] = [
  [192, { value: "w" }],
  [144, { value: "h", dots: 1 }],
  [96, { value: "h" }],
  [72, { value: "q", dots: 1 }],
  [48, { value: "q" }],
  [36, { value: "8", dots: 1 }],
  [24, { value: "8" }],
  [12, { value: "16" }],
];

/** Note shapes adding up to `ticks`, starting `at` ticks into the bar. */
function shapesFor(ticks: number, at: number): Shape[] {
  const out: Shape[] = [];
  let left = ticks;
  if (ticks % 12 !== 0 || at % 12 !== 0) {
    while (left >= 16) {
      out.push({ value: "8", triplet: true });
      left -= 16;
    }
    while (left >= 8) {
      out.push({ value: "16", triplet: true });
      left -= 8;
    }
    return out;
  }
  let pos = at;
  while (left >= 12) {
    // Don't let a note run across the middle of the bar unless it starts on a beat.
    const fit = STRAIGHT.find(([t]) => t <= left && (pos % 48 === 0 || pos % t === 0 || t < 48)) ?? STRAIGHT[STRAIGHT.length - 1];
    out.push(fit[1]);
    left -= fit[0];
    pos += fit[0];
  }
  return out;
}

const q4 = (beats: number) => Math.round((beats * TICKS_PER_QUARTER) / 4) * 4;

export type ScoredChorus = {
  transcription: Transcription;
  /** Each played note's place in the score, by its start (performance beats), in order. */
  noteAt: { beat: number; measure: number; note: number }[];
};

export function chorusToTranscription(
  notes: BassNote[],
  beats: PerformedBeat[],
  startBeat: number,
  opts: { title: string; preferFlat: boolean; timeSignature: { top: number; bottom: number } },
): ScoredChorus {
  const capacity = (opts.timeSignature.top * TICKS_PER_QUARTER * 4) / opts.timeSignature.bottom;
  const bars: { start: number; beats: number }[] = [];
  beats.forEach((b, i) => {
    if (b.beatInBar === 0 || i === 0) bars.push({ start: startBeat + i, beats: b.beatsInBar });
  });
  const sorted = [...notes].sort((a, b) => a.beat - b.beat);
  const noteAt: ScoredChorus["noteAt"] = [];

  const measures = bars.map((bar, mi) => {
    const end = bar.start + bar.beats;
    const inBar = sorted.filter((n) => n.beat >= bar.start - 1e-6 && n.beat < end - 1e-6);
    const out: TNote[] = [];
    let t = 0;
    inBar.forEach((n, k) => {
      const s = q4(n.beat - bar.start);
      if (s < t || s >= capacity) return;
      const nextStart = inBar[k + 1] ? inBar[k + 1].beat : end;
      const len = Math.min(q4(Math.min(n.length, nextStart - n.beat)), capacity - s);
      if (len < 8) return;
      if (s > t) out.push(...restShapes(s - t, t));
      const pitch = spellMidi(n.midi, opts.preferFlat);
      const pieces = shapesFor(len, s);
      noteAt.push({ beat: n.beat, measure: mi, note: out.length });
      pieces.forEach((shape, p) => {
        out.push({
          id: newId(),
          ...shape,
          pitch,
          midi: n.midi,
          ...(p < pieces.length - 1 ? { tie: true } : {}),
          ...(n.ghost ? { ghost: true } : {}),
        } as TNote);
      });
      t = s + pieces.reduce((sum, sh) => sum + shapeTicks(sh), 0);
    });

    const chords: Transcription["measures"][number]["chords"] = [];
    const first = bar.start - startBeat;
    for (let k = 0; k < bar.beats && k < opts.timeSignature.top; k++) {
      const b = beats[first + k];
      const h = b?.harmony;
      if (!h) continue;
      if (beats[first + k - 1]?.harmony?.symbol !== h.symbol) chords.push({ beat: k, symbol: h.symbol });
    }
    return { id: newId(), chords, notes: out };
  });

  return {
    transcription: { title: opts.title, tune: "", source: "", tempo: null, comments: "", timeSignature: opts.timeSignature, measures },
    noteAt,
  };
}

function shapeTicks(sh: Shape): number {
  const base = { w: 192, h: 96, q: 48, "8": 24, "16": 12 }[sh.value];
  return sh.triplet ? (base * 2) / 3 : sh.dots ? base * 1.5 : base;
}

function restShapes(ticks: number, at: number): TNote[] {
  if (ticks % 12 === 0 && at % 12 === 0) return restsFor(ticks);
  return shapesFor(ticks, at).map((sh) => ({ id: newId(), ...sh }) as TNote);
}
