import type { Bar, ChordSlot, IRealSong } from "./iRealPro";

// Bass Genius: turns a chord chart into a bass line. Three steps, all pure (no audio here — the
// web/mobile engines schedule the result):
//
// 1. `chartHarmony` reads every written bar into what's sounding on each beat (repeat signs,
//    "%" bars, held chords, chords sharing a bar, N.C.).
// 2. `playbackOrder` unrolls the chart the way a band reads it — repeats with numbered endings,
//    then on the last chorus D.C./D.S., "al Coda" and "Fine".
// 3. A *player* writes the line over that. Only "Computer" exists so far: a rules-based walker
//    (roots on the downbeat of each chord, chord and scale tones through the bar, a chromatic /
//    scale-step / dominant approach into the next chord, register drifting slowly so it doesn't
//    sit in one spot). Players modelled on real bassists will plug in beside it.

export type BassPlayerId = "computer";

export const BASS_PLAYERS: { id: BassPlayerId; label: string; description: string }[] = [
  {
    id: "computer",
    label: "Computer",
    description: "Walks the changes by the book: roots on the downbeat, chord and scale tones through the bar, and an approach note into every new chord.",
  },
];

export type BassFeel = "walking" | "two";
export type BassTouch = "soft" | "medium" | "strong";

/** Lowest and highest notes the line uses (E1 to G3 — a four-string upright's working range). */
export const BASS_LOW = 28;
export const BASS_HIGH = 55;

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

function pcOf(letter: string, accidental?: "b" | "#"): number {
  const base = LETTER_PC[letter.toUpperCase()] ?? 0;
  return (base + (accidental === "#" ? 1 : accidental === "b" ? -1 : 0) + 12) % 12;
}

export type Harmony = {
  /** As written ("C-7/Bb"), for display. */
  symbol: string;
  root: number;
  /** The note the bass should land on — the slash bass if there is one, else the root. */
  bass: number;
  /** Chord tones as pitch classes, root first. */
  tones: number[];
  /** The scale to walk through, as pitch classes. */
  scale: number[];
};

const SCALES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  lydianAug: [0, 2, 4, 6, 8, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  melodicMinor: [0, 2, 3, 5, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  mixoB13: [0, 2, 4, 5, 7, 8, 10],
  lydianDominant: [0, 2, 4, 6, 7, 9, 10],
  altered: [0, 1, 3, 4, 6, 8, 10],
  halfWhole: [0, 1, 3, 4, 6, 7, 9, 10],
  wholeTone: [0, 2, 4, 6, 8, 10],
  susDominant: [0, 2, 5, 7, 9, 10],
  locrianNat2: [0, 2, 3, 5, 6, 8, 10],
  wholeHalf: [0, 2, 3, 5, 6, 8, 9, 11],
};

/** Chord tones and a walking scale (as intervals from the root) for an iReal quality suffix. */
export function analyzeQuality(quality: string): { tones: number[]; scale: number[] } {
  const q = quality.replace(/[()]/g, "");
  const halfDim = q.includes("h");
  const dim = q.startsWith("o");
  const minor = q.startsWith("-") || (q.startsWith("m") && !q.startsWith("maj"));
  const sus = q.includes("sus");
  const alt = q.includes("alt");
  const maj7 = q.includes("^") || q.includes("maj7");
  const six = /(^|[^1b#])6/.test(q);
  const numbered = /7|9|11|13/.test(q);
  const aug = q.includes("+") || q.includes("#5");
  const flat5 = q.includes("b5") || halfDim;

  const third = sus ? (q.includes("sus2") ? 2 : 5) : minor || halfDim || dim ? 3 : 4;
  const fifth = dim || flat5 ? 6 : aug || alt ? 8 : 7;
  const seventh = halfDim
    ? 10
    : dim
      ? q.includes("7")
        ? 9
        : maj7
          ? 11
          : null
      : maj7
        ? 11
        : numbered
          ? 10
          : six
            ? 9
            : null;

  let scale: number[];
  if (dim) scale = SCALES.wholeHalf;
  else if (halfDim) scale = SCALES.locrianNat2;
  else if (minor) scale = maj7 ? SCALES.melodicMinor : q.includes("b6") || q.includes("b13") ? SCALES.aeolian : SCALES.dorian;
  else if (seventh === 10) {
    if (alt) scale = SCALES.altered;
    else if (sus) scale = SCALES.susDominant;
    else if (aug) scale = SCALES.wholeTone;
    else if (q.includes("b9")) scale = SCALES.halfWhole;
    else if (q.includes("#9")) scale = SCALES.altered;
    else if (q.includes("#11")) scale = SCALES.lydianDominant;
    else if (q.includes("b13")) scale = SCALES.mixoB13;
    else scale = SCALES.mixolydian;
  } else if (sus) scale = SCALES.susDominant;
  else if (aug) scale = SCALES.lydianAug;
  else if (q.includes("#11")) scale = SCALES.lydian;
  else scale = SCALES.ionian;

  const tones = [0, third, fifth, ...(seventh === null ? [] : [seventh])];
  return { tones: [...new Set(tones)], scale };
}

export function harmonyOf(slot: Extract<ChordSlot, { kind: "chord" }>): Harmony {
  const root = pcOf(slot.letter, slot.accidental);
  const { tones, scale } = analyzeQuality(slot.quality);
  const bass = slot.bass ? pcOf(slot.bass.letter, slot.bass.accidental) : root;
  const symbol = `${slot.letter}${slot.accidental ?? ""}${slot.quality}${slot.bass ? `/${slot.bass.letter}${slot.bass.accidental ?? ""}` : ""}`;
  return {
    symbol,
    root,
    bass,
    tones: tones.map((t) => (root + t) % 12),
    scale: [...new Set([...scale.map((t) => (root + t) % 12), bass])],
  };
}

/** How many pulses a bar of this time signature walks in: quarter notes, or dotted quarters in
    compound meters (6/8, 9/8, 12/8). */
export function beatsInMeter(ts: { top: number; bottom: number }): number {
  if (ts.bottom === 8 && ts.top % 3 === 0 && ts.top > 3) return ts.top / 3;
  if (ts.bottom === 2) return ts.top * 2;
  return Math.max(1, ts.top);
}

export type BarHarmony = {
  beats: number;
  /** What's sounding on each beat (null = N.C., the bass lays out). */
  perBeat: (Harmony | null)[];
  /** A chord symbol is written (re-struck) on this beat. */
  starts: boolean[];
};

/** Where `n` chords written in one bar of `beats` beats start. iReal doesn't store positions, so
    this follows the usual reading: evenly when they divide the bar, otherwise the first chord
    takes the extra time (three chords in 4/4 are 2 + 1 + 1). */
function slotStarts(n: number, beats: number): number[] {
  if (n <= 0) return [];
  if (beats % n === 0) return Array.from({ length: n }, (_, k) => (k * beats) / n);
  if (n < beats) return [0, ...Array.from({ length: n - 1 }, (_, k) => beats - (n - 1) + k)];
  return Array.from({ length: n }, (_, k) => Math.floor((k * beats) / n));
}

/** Every written bar's harmony, beat by beat. */
export function chartHarmony(song: IRealSong): BarHarmony[] {
  const out: BarHarmony[] = [];
  let ts = song.timeSignature;
  let last: Harmony | null = null;
  const bars = song.bars;
  for (let i = 0; i < bars.length; i++) {
    const bar: Bar = bars[i];
    if (bar.timeSignature) ts = bar.timeSignature;
    const beats = beatsInMeter(ts);
    const fit = (src: BarHarmony | undefined): BarHarmony => {
      if (!src) return { beats, perBeat: Array(beats).fill(last), starts: Array(beats).fill(false) };
      const perBeat = Array.from({ length: beats }, (_, b) => src.perBeat[Math.min(b, src.perBeat.length - 1)] ?? null);
      const starts = Array.from({ length: beats }, (_, b) => src.starts[b] ?? false);
      return { beats, perBeat, starts };
    };

    let bh: BarHarmony;
    if (bar.content.kind === "repeat") {
      bh = fit(bar.content.double ? out[i - 2] : out[i - 1]);
      if (bar.content.double && i + 1 < bars.length) {
        // The bar after a two-bar repeat sign is empty in the chart; it plays the bar before.
        out.push(bh);
        last = bh.perBeat[bh.beats - 1] ?? last;
        const next = bars[i + 1];
        if (next.timeSignature) ts = next.timeSignature;
        const second = fit(out[i - 1]);
        out.push(second);
        last = second.perBeat[second.beats - 1] ?? last;
        i += 1;
        continue;
      }
    } else {
      const slots = bar.content.slots;
      const perBeat: (Harmony | null)[] = Array(beats).fill(undefined);
      const starts: boolean[] = Array(beats).fill(false);
      const positions = slotStarts(slots.length, beats);
      slots.forEach((slot, k) => {
        const b = positions[k];
        if (perBeat[b] !== undefined) return; // more chords than beats: first one wins
        if (slot.kind === "chord") {
          perBeat[b] = harmonyOf(slot);
          starts[b] = true;
        } else if (slot.kind === "nc") {
          perBeat[b] = null;
        }
        // "slash" leaves the beat undefined: the chord before carries on.
      });
      let current = last;
      for (let b = 0; b < beats; b++) {
        if (perBeat[b] === undefined) perBeat[b] = current;
        else current = perBeat[b];
      }
      bh = { beats, perBeat, starts };
    }
    out.push(bh);
    last = bh.perBeat[bh.beats - 1] ?? last;
  }
  return out;
}

/**
 * The order the written bars are played in for one chorus. Repeats are taken (as many passes as
 * the highest numbered ending, at least two) and the right ending is picked each pass. Without
 * `takeJump` the chorus stops at a D.C./D.S. — that's the form a band blows over; with it (the last
 * chorus) the jump is taken, repeats are skipped after it (last ending only), "Fine" ends it, and
 * the "to Coda" marker jumps to the coda.
 */
export function playbackOrder(bars: Bar[], takeJump: boolean): number[] {
  const n = bars.length;
  const order: number[] = [];
  const label = (k: number) => (bars[k]?.endingLabel ? Number(bars[k].endingLabel) || 1 : 0);
  const segno = bars.findIndex((b) => b.segno);
  const codas = bars.flatMap((b, k) => (b.coda ? [k] : []));

  /** The ending group (contiguous bars carrying an ending label) starting at or after `k`. */
  function groupFrom(k: number): { end: number; labels: number[] } {
    let j = k;
    const labels: number[] = [];
    while (j < n && bars[j].endingLabel) {
      if (bars[j].endingStart || j === k) labels.push(label(j));
      j += 1;
    }
    return { end: j, labels };
  }
  /** How many times the repeat closing at `k` is played: up to its highest ending, at least 2. */
  function passesFor(k: number): number {
    let start = k;
    while (start > 0 && bars[start].endingLabel && !bars[start].endingStart) start -= 1;
    const labels = bars[start]?.endingLabel ? groupFrom(start).labels : [];
    const after = k + 1 < n && bars[k + 1].endingLabel ? groupFrom(k + 1).labels : [];
    return Math.max(2, ...labels, ...after);
  }

  let i = 0;
  let pass = 1;
  let repeatStart = 0;
  let leaving = false;
  let jumped = false;
  let tookCoda = false;
  let cameBack = false;
  const repeatsTaken = new Map<number, number>();
  let guard = 0;

  while (i < n && guard++ < 20000) {
    const bar = bars[i];
    if (bar.startRepeat && !cameBack) {
      repeatStart = i;
      pass = 1;
      leaving = false;
    }
    cameBack = false;

    if (jumped && !tookCoda && codas.length >= 2 && i === codas[0]) {
      tookCoda = true;
      i = codas[codas.length - 1];
      continue;
    }

    const l = label(i);
    if (l && (bar.endingStart || i === 0 || !bars[i - 1].endingLabel)) {
      const group = groupFrom(i);
      // After a D.C./D.S. it's the last ending — which can be written further on ("al 3rd ending").
      const wanted = jumped ? Math.max(...group.labels, ...bars.slice(i).map((_, k) => (bars[i + k].endingStart ? label(i + k) : 0))) : pass;
      if (l !== wanted) {
        let j = i + 1;
        while (j < n && !(bars[j].endingStart && label(j) === wanted)) j += 1;
        i = j < n ? j : group.end;
        continue;
      }
    } else if (!l && leaving) {
      pass = 1;
      leaving = false;
    }

    order.push(i);

    if (bar.endRepeat && !jumped) {
      const taken = repeatsTaken.get(i) ?? 0;
      if (taken + 1 < passesFor(i)) {
        repeatsTaken.set(i, taken + 1);
        pass += 1;
        i = repeatStart;
        cameBack = true;
        continue;
      }
      leaving = true;
    }

    const directive = bar.directive?.toLowerCase() ?? "";
    if (jumped && directive.includes("fine")) break;
    if (!jumped && /d\.?\s*[cs]\./.test(directive)) {
      if (!takeJump) break;
      jumped = true;
      pass = 1;
      leaving = false;
      i = directive.includes("s.") && segno >= 0 ? segno : 0;
      cameBack = true;
      continue;
    }
    i += 1;
  }
  return order;
}

export type BassNote = {
  /** Start, in beats from the top of the performance. */
  beat: number;
  /** Length in beats. */
  length: number;
  midi: number;
  /** 0–1. */
  velocity: number;
  /** A soft, half-muted note (a skip or pickup), not a full note. */
  ghost?: boolean;
};

export type PerformedBeat = {
  /** Written bar index (into `song.bars`), for highlighting the chart. */
  bar: number;
  beatInBar: number;
  beatsInBar: number;
  harmony: Harmony | null;
  chorus: number;
  /** Where the line on this beat came from, for a modelled player ("Blue Bossa, bars 9–12"). */
  from?: string;
};

/** How one phrase of a modelled player's chorus was made (for showing the working). */
export type BassPhrase = {
  /** Start, in performance beats, and length in beats. */
  beat: number;
  length: number;
  /** The chart's chords over it, bar by bar ("Bb6 G-7 | C-7 F7"). */
  chartChords: string;
  /** Null: the Computer walked it (nothing in the transcriptions fitted well enough). */
  source: null | {
    /** Index into the transcriptions the style was analysed from. */
    transcription: number;
    title: string;
    /** Where in that transcription, in beats from its top (4 a bar). */
    startBeat: number;
    /** Moved up this many semitones (0–11) to the chart's key, then `octave` octaves. */
    shift: number;
    octave: number;
    /** The transcription's own chords over the passage, bar by bar. */
    sourceChords: string;
    /** Share (0–1) of the player's notes there that are chord tones, scale tones or stepwise
        passing notes of the chart's chords. */
    fit: number;
    /** Notes moved to fit a different chord quality, or onto a slash chord's bass. */
    refitted: number;
    /** Notes folded back into the bass's range on their own. */
    folded: number;
  };
  /** The last note was turned into a half-step lead-in to the next phrase. */
  leadIn: boolean;
  /** "Learn their style" mode: what the new line did and the player tendencies behind it. */
  learned?: { player: string; points: string[] };
};

export type BassChorus = { notes: BassNote[]; beats: PerformedBeat[]; phrases?: BassPhrase[] };

export type BassLineOptions = {
  /** For a modelled player: copy phrases from their transcriptions, or write new lines in their
      style. */
  styleMode?: "copy" | "learn";
  /** "computer", or one of your own players (their analysed transcriptions come in separately). */
  player: string;
  feel: BassFeel;
  touch: BassTouch;
};

/** What a player carries from one chorus into the next, so choruses join up. */
export type BassLineState = {
  lastNote: number | null;
  registerGoal: number;
  barsToNewGoal: number;
  seed: number;
  /** Transcription passages a modelled player used lately, so choruses don't repeat them. */
  recent?: string[];
  /** Where a modelled player's last chorus left off in their transcriptions. */
  next?: { tune: number; beat: number; shift: number } | null;
};

export function initialBassState(seed = Math.floor(Math.random() * 2 ** 31)): BassLineState {
  return { lastNote: null, registerGoal: 36, barsToNewGoal: 4, seed };
}

/** Small seeded PRNG (mulberry32), so a chorus can be regenerated identically from its state. */
export function makeRng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    pick<T>(items: T[]): T {
      return items[Math.floor(next() * items.length)];
    },
    weighted<T>(items: [T, number][]): T {
      const total = items.reduce((s, [, w]) => s + w, 0);
      let r = next() * total;
      for (const [item, w] of items) {
        r -= w;
        if (r <= 0) return item;
      }
      return items[items.length - 1][0];
    },
    seed: () => Math.floor(next() * 2 ** 31),
  };
}
export type Rng = ReturnType<typeof makeRng>;

type Span = {
  /** Index into the chorus's beats. */
  start: number;
  length: number;
  harmony: Harmony;
  /** The same chord carried on from the previous span (a new bar, nothing re-written). */
  continuation: boolean;
  barStart: boolean;
};

/** Splits a chorus into chord spans: a new span at every written chord and every barline. */
function spansOf(beats: PerformedBeat[], starts: boolean[]): Span[] {
  const spans: Span[] = [];
  for (let k = 0; k < beats.length; k++) {
    const h = beats[k].harmony;
    if (!h) continue;
    const prev = spans[spans.length - 1];
    const contiguous = prev && prev.start + prev.length === k;
    const sameChord = contiguous && beats[k - 1]?.harmony === h;
    if (contiguous && sameChord && !starts[k] && beats[k].beatInBar !== 0) {
      prev.length += 1;
      continue;
    }
    spans.push({
      start: k,
      length: 1,
      harmony: h,
      continuation: !!(contiguous && sameChord && !starts[k]) || !!(prev && contiguous && prev.harmony.symbol === h.symbol),
      barStart: beats[k].beatInBar === 0,
    });
  }
  return spans;
}

function notesWithPc(pc: number, low = BASS_LOW, high = BASS_HIGH): number[] {
  const out: number[] = [];
  for (let m = low; m <= high; m++) if (m % 12 === pc) out.push(m);
  return out;
}

const pcIn = (m: number, pcs: number[]) => pcs.includes(((m % 12) + 12) % 12);

/** Picks the octave for a target pitch class: close to the previous note, near the register the
    line is drifting toward, never a repeat of the note just played. */
function placeTarget(pc: number, prev: number | null, goal: number, rng: Rng): number {
  const options = notesWithPc(pc).map((m) => {
    const leap = prev === null ? 0 : Math.abs(m - prev);
    const cost =
      (prev === null ? 0 : leap <= 7 ? leap * 0.25 : 2 + leap * 0.5) +
      Math.abs(m - goal) * 0.25 +
      Math.max(0, m - 48) * 0.6 + // above C3 only briefly
      (m === prev ? 5 : 0) +
      rng.next() * 0.8;
    return { m, cost };
  });
  options.sort((a, b) => a.cost - b.cost);
  return options[0].m;
}

function stepCost(a: number, b: number): number {
  const d = Math.abs(b - a);
  if (d === 0) return 5;
  if (d <= 2) return 0;
  if (d <= 4) return 0.9;
  if (d === 5) return 1.6;
  if (d === 7) return 2;
  if (d <= 9) return 3.5;
  return 7;
}

/** Fills one chord span after its first note: chord and scale tones, then (when another chord
    follows) an approach into it. A small beam search over candidate lines, sampled from the best
    few so the line varies chorus to chorus. */
function walkSpan(span: Span, first: number, next: number | null, goal: number, rng: Rng): number[] {
  const L = span.length;
  if (L === 1) return [first];
  const h = span.harmony;
  const pool: number[] = [];
  for (let m = BASS_LOW; m <= BASS_HIGH; m++) if (pcIn(m, h.scale) || pcIn(m, h.tones)) pool.push(m);

  type Path = { notes: number[]; cost: number };
  let beam: Path[] = [{ notes: [first], cost: 0 }];
  for (let pos = 1; pos < L; pos++) {
    const isApproach = next !== null && pos === L - 1;
    const strong = L >= 4 && pos === L / 2;
    const candidates = isApproach ? [...new Set([...pool, next! - 1, next! + 1, next! + 2, next! - 2].filter((m) => m >= BASS_LOW - 2 && m <= BASS_HIGH + 2))] : pool;
    const grown: Path[] = [];
    for (const path of beam) {
      const a = path.notes[path.notes.length - 1];
      const before = path.notes[path.notes.length - 2];
      for (const b of candidates) {
        let c = path.cost + stepCost(a, b);
        if (before !== undefined && Math.sign(b - a) !== 0 && Math.sign(a - before) !== 0 && Math.sign(b - a) !== Math.sign(a - before)) c += 0.6;
        if (strong && !pcIn(b, h.tones)) c += 1.2;
        if (!isApproach && !pcIn(b, h.scale)) c += 3;
        if (path.notes.includes(b)) c += 0.8; // keep the bar moving, not circling
        const off = Math.abs(b - goal);
        if (off > 9) c += (off - 9) * 0.35;
        if (b > 50) c += (b - 50) * 0.5;
        if (isApproach) {
          const d = Math.abs(next! - b);
          if (d === 0) c += 9;
          else if (d === 1) c += 0;
          else if (d === 2) c += pcIn(b, h.scale) ? 0.3 : 1.5;
          else if ((b - next! + 120) % 12 === 7 && d <= 7) c += 0.7; // the target's fifth
          else c += 2 + d * 0.45;
        }
        c += rng.next() * 1.1;
        grown.push({ notes: [...path.notes, b], cost: c });
      }
    }
    grown.sort((x, y) => x.cost - y.cost);
    beam = grown.slice(0, 48);
  }
  // Sample among the best few rather than always the single best.
  const best = beam[0].cost;
  const top = beam.slice(0, 6);
  return rng.weighted(top.map((p) => [p, Math.exp(-(p.cost - best) * 1.8)] as [Path, number])).notes;
}

export const TOUCH_VELOCITY: Record<BassTouch, number> = { soft: 0.42, medium: 0.62, strong: 0.84 };

/** One time through the chart, beat by beat, in the order it's played. */
export function performedBeats(song: IRealSong, harmony: BarHarmony[], chorus: number, isLast: boolean): { beats: PerformedBeat[]; starts: boolean[] } {
  const beats: PerformedBeat[] = [];
  const starts: boolean[] = [];
  for (const barIndex of playbackOrder(song.bars, isLast)) {
    const bh = harmony[barIndex];
    if (!bh) continue;
    for (let b = 0; b < bh.beats; b++) {
      beats.push({ bar: barIndex, beatInBar: b, beatsInBar: bh.beats, harmony: bh.perBeat[b], chorus });
      starts.push(bh.starts[b]);
    }
  }
  return { beats, starts };
}

/**
 * Writes one chorus of bass line. `isLast` takes the chart's jumps (D.C., coda) and ends on a held
 * root. `startBeat` offsets the notes so choruses can be concatenated.
 */
export function generateChorus(
  song: IRealSong,
  options: BassLineOptions,
  state: BassLineState,
  chorus: number,
  startBeat: number,
  isLast: boolean,
  harmony: BarHarmony[] = chartHarmony(song),
): { chorus: BassChorus; state: BassLineState } {
  const rng = makeRng(state.seed);
  const { beats, starts } = performedBeats(song, harmony, chorus, isLast);

  const spans = spansOf(beats, starts);
  const base = TOUCH_VELOCITY[options.touch];
  const vel = (accent = 0) => Math.max(0.05, Math.min(1, base + accent + (rng.next() - 0.5) * 0.1));
  const notes: BassNote[] = [];
  let goal = state.registerGoal;
  let barsToNewGoal = state.barsToNewGoal;
  let prev = state.lastNote;

  // First notes of every span, chosen up front so each span knows where the next one lands.
  const targets: number[] = [];
  for (const span of spans) {
    if (span.barStart) {
      barsToNewGoal -= 1;
      if (barsToNewGoal <= 0) {
        goal = 31 + Math.floor(rng.next() * 13); // somewhere G1–G2
        barsToNewGoal = 4 + Math.floor(rng.next() * 5);
      }
    }
    const h = span.harmony;
    let pc = h.bass;
    if (span.continuation && h.bass === h.root) {
      pc = rng.weighted<number>([
        [h.root, 3],
        [h.tones[1] ?? h.root, 3],
        [h.tones[2] ?? h.root, 3],
        [h.tones[3] ?? h.root, 1],
      ]);
    }
    const target = placeTarget(pc, targets.length ? targets[targets.length - 1] : prev, goal, rng);
    targets.push(target);
  }

  spans.forEach((span, si) => {
    const first = targets[si];
    const nextSpan = spans[si + 1];
    const adjacent = nextSpan && nextSpan.start === span.start + span.length;
    const nextTarget = adjacent ? targets[si + 1] : null;
    const at = startBeat + span.start;
    const lastSpan = isLast && si === spans.length - 1;

    if (lastSpan) {
      // Final chord: one long low root.
      const low = notesWithPc(span.harmony.bass, BASS_LOW, 40)[0] ?? first;
      notes.push({ beat: at, length: Math.max(span.length, 4), midi: low, velocity: vel(0.04) });
      prev = low;
      return;
    }

    if (options.feel === "two") {
      if (span.length >= 4 && span.length % 2 === 0) {
        const half = span.length / 2;
        const fifth = placeTarget(span.harmony.tones[2] ?? span.harmony.root, first, goal, rng);
        const second =
          nextTarget !== null && nextSpan && nextSpan.harmony !== span.harmony && rng.next() < 0.5
            ? walkSpan({ ...span, length: 2 }, first, nextTarget, goal, rng)[1]
            : fifth;
        notes.push({ beat: at, length: half, midi: first, velocity: vel(0.05) });
        notes.push({ beat: at + half, length: half, midi: second, velocity: vel() });
        prev = second;
      } else {
        notes.push({ beat: at, length: span.length, midi: first, velocity: vel(0.05) });
        prev = first;
      }
      // Now and then a soft pickup on the "and" of the last beat, into the next chord.
      if (nextTarget !== null && span.barStart && span.length >= 4 && rng.next() < 0.18) {
        const last = notes[notes.length - 1];
        last.length -= 1 / 3;
        const pickup = nextTarget + (rng.next() < 0.5 ? -1 : 1);
        notes.push({ beat: at + span.length - 1 / 3, length: 1 / 3, midi: pickup, velocity: vel(-0.3), ghost: true });
        prev = pickup;
      }
      return;
    }

    const line = walkSpan(span, first, nextTarget, goal, rng);
    line.forEach((m, k) => {
      notes.push({ beat: at + k, length: 1, midi: m, velocity: vel(k === 0 ? 0.05 : 0) });
    });
    // Occasionally a triplet skip into the next chord: the last note, then a ghosted repeat of it.
    if (nextTarget !== null && span.length >= 4 && rng.next() < 0.07) {
      const last = notes[notes.length - 1];
      last.length = 2 / 3;
      notes.push({ beat: last.beat + 2 / 3, length: 1 / 3, midi: last.midi, velocity: vel(-0.35), ghost: true });
    }
    prev = line[line.length - 1];
  });

  return {
    chorus: { notes, beats },
    state: { lastNote: prev, registerGoal: goal, barsToNewGoal, seed: rng.seed() },
  };
}

/** Note name for display ("E♭2"). */
export function bassNoteName(midi: number): string {
  const names = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}
