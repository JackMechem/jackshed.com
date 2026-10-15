import { transcriptionBeats, type BeatChord, type ChordClass } from "./bassStyle";
import { measureCapacity, TICKS_PER_QUARTER, timeline, type Transcription } from "./bassTranscription";

// What a player's transcriptions show about how they play: register and rhythm, what they land on
// when the chord changes, how they get into each new chord (and across common progressions), the
// shapes they play through a bar of one chord (arpeggios, scale runs, approaches), and phrases
// they come back to. Everything is read against the transcriptions' own chord symbols — bars where
// the line doesn't fit the written chord are listed, since that usually means a misplaced symbol.

export type Where = { title: string; bar: number };
export type Share = { label: string; count: number; pct: number; example?: Where };

export type Insights = {
  transcriptions: number;
  bars: number;
  notes: number;
  range: { low: number; high: number; median: number } | null;
  rhythm: Share[];
  /** What the line plays on the first beat of a new chord (chord degree). */
  downbeats: Share[];
  /** Per beat of the bar (1–4): chord tone / scale tone / chromatic. */
  beats: { beat: number; shares: Share[] }[];
  motion: { steps: number; skips: number; leaps: number; up: number; down: number; repeats: number };
  /** How the note before a chord change leads into the change's first note. */
  approaches: Share[];
  /** Common chord changes and how the player crosses them. */
  transitions: { change: string; count: number; approaches: Share[]; lines: Share[] }[];
  /** One-chord bars of four notes, as chord degrees, by chord family. */
  shapes: { family: string; bars: number; items: (Share & { kind: string })[] }[];
  /** Five-note phrases (same intervals and rhythm, any key) that come back. */
  licks: { intervals: string; rhythm: string; count: number; examples: Where[]; notes: string }[];
  /** Bars where the downbeats don't fit the written chords — probably a misplaced chord symbol. */
  suspectBars: Where[];
};

const DEGREE = ["1", "♭2", "2", "♭3", "3", "4", "♭5", "5", "♯5", "6", "♭7", "7"];
const NAMES = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];
const FAMILY: Record<ChordClass, string> = {
  maj: "Major chords",
  dom: "Dominant 7ths",
  min: "Minor chords",
  minmaj: "Minor-major chords",
  hdim: "Half-diminished",
  dim: "Diminished",
  sus: "Sus chords",
  aug: "Augmented",
};
const CLS_SHORT: Record<ChordClass, string> = { maj: "maj", dom: "7", min: "m7", minmaj: "m(maj7)", hdim: "ø", dim: "°", sus: "sus", aug: "+" };
const MOTION: Record<number, string> = {
  0: "same root",
  1: "up a half step",
  2: "up a step",
  3: "up a minor 3rd",
  4: "up a major 3rd",
  5: "up a 4th",
  6: "a tritone",
  7: "down a 4th",
  8: "down a major 3rd",
  9: "down a minor 3rd",
  10: "down a step",
  11: "down a half step",
};

export const noteName = (midi: number) => `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
const degreeOf = (midi: number, c: BeatChord) => DEGREE[(((midi - c.root) % 12) + 12) % 12];
const isTone = (midi: number, c: BeatChord) => ((c.toneMask >> ((((midi - c.root) % 12) + 12) % 12)) & 1) === 1;
const inScale = (midi: number, c: BeatChord) => ((c.scaleMask >> ((((midi - c.root) % 12) + 12) % 12)) & 1) === 1;

/** Counts with an example each, turned into sorted shares. */
class Tally {
  private m = new Map<string, { count: number; example?: Where }>();
  total = 0;
  add(label: string, where?: Where) {
    const e = this.m.get(label);
    if (e) e.count++;
    else this.m.set(label, { count: 1, example: where });
    this.total++;
  }
  shares(limit = 99, min = 1): Share[] {
    return [...this.m.entries()]
      .filter(([, v]) => v.count >= min)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([label, v]) => ({ label, count: v.count, pct: this.total ? Math.round((v.count / this.total) * 100) : 0, example: v.example }));
  }
}

type N = { start: number; ticks: number; midi: number; ghost: boolean; measure: number; tune: number };

export function analyzeInsights(transcriptions: Transcription[]): Insights {
  const rhythm = new Tally();
  const downbeats = new Tally();
  const beatTallies = [new Tally(), new Tally(), new Tally(), new Tally()];
  const approaches = new Tally();
  const transitions = new Map<string, { count: number; approaches: Tally; lines: Tally }>();
  const shapes = new Map<ChordClass, { bars: number; tally: Tally; kinds: Map<string, string> }>();
  const motion = { steps: 0, skips: 0, leaps: 0, up: 0, down: 0, repeats: 0 };
  const lickMap = new Map<string, { count: number; examples: Where[]; notes: string; intervals: string; rhythm: string; last: number }>();
  const suspect: Where[] = [];
  const pitches: number[] = [];
  let bars = 0;
  let noteCount = 0;
  let used = 0;

  transcriptions.forEach((t, ti) => {
    if (measureCapacity(t) !== 4 * TICKS_PER_QUARTER) return;
    used++;
    const title = t.title.trim() || "Untitled";
    const chords = transcriptionBeats(t);
    const notes: N[] = timeline(t)
      .filter((n) => n.midi !== null)
      .map((n) => ({ start: n.start / TICKS_PER_QUARTER, ticks: n.ticks, midi: n.midi as number, ghost: n.ghost, measure: n.measure, tune: ti }));
    bars += t.measures.length;
    noteCount += notes.length;
    const at = (beat: number) => chords[Math.floor(beat + 1e-6)] ?? null;
    const where = (n: N): Where => ({ title, bar: n.measure + 1 });
    const pitched = notes.filter((n) => !n.ghost);

    for (const n of notes) {
      rhythm.add(n.ghost ? "Ghost notes" : rhythmName(n.ticks), where(n));
      if (!n.ghost) pitches.push(n.midi);
    }

    // Beat roles and downbeats.
    for (const n of pitched) {
      const c = at(n.start);
      if (!c) continue;
      const k = n.start - Math.floor(n.start);
      if (k > 1e-6) continue;
      const beatInBar = Math.floor(n.start + 1e-6) % 4;
      beatTallies[beatInBar].add(isTone(n.midi, c) ? "Chord tone" : inScale(n.midi, c) ? "Scale tone" : "Chromatic", where(n));
      const prev = at(n.start - 1);
      if (!prev || prev.key !== c.key || beatInBar === 0)
        downbeats.add(isTone(n.midi, c) || inScale(n.midi, c) ? degreeLabel(degreeOf(n.midi, c)) : `Chromatic (${degreeOf(n.midi, c)})`, where(n));
    }

    // Motion.
    for (let i = 1; i < pitched.length; i++) {
      const d = pitched[i].midi - pitched[i - 1].midi;
      const a = Math.abs(d);
      if (a === 0) motion.repeats++;
      else if (a <= 2) motion.steps++;
      else if (a <= 4) motion.skips++;
      else motion.leaps++;
      if (d > 0) motion.up++;
      else if (d < 0) motion.down++;
    }

    // Chord changes: the approach into each, and the line across common progressions.
    for (let i = 1; i < pitched.length; i++) {
      const n = pitched[i];
      const onBeat = Math.abs(n.start - Math.round(n.start)) < 1e-6;
      const c = at(n.start);
      const before = at(n.start - 1e-3);
      if (!onBeat || !c || !before || before.key === c.key) continue;
      const p = pitched[i - 1];
      if (n.start - (p.start + p.ticks / TICKS_PER_QUARTER) > 0.01 || n.start - p.start > 1.01) continue;
      const label = approachName(p.midi, n.midi, c);
      approaches.add(label, where(n));
      const change = `${CLS_SHORT[before.cls]} → ${CLS_SHORT[c.cls]}, root ${MOTION[(c.root - before.root + 12) % 12]}`;
      let tr = transitions.get(change);
      if (!tr) transitions.set(change, (tr = { count: 0, approaches: new Tally(), lines: new Tally() }));
      tr.count++;
      tr.approaches.add(label, where(n));
      const pp = pitched[i - 2];
      const line = `${pp && at(pp.start) === before ? degreeOf(pp.midi, before) + " " : ""}${degreeOf(p.midi, before)} | ${degreeOf(n.midi, c)}`;
      tr.lines.add(line, where(n));
    }

    // Bars of one chord with four notes: shapes.
    t.measures.forEach((m, mi) => {
      const c = chords[mi * 4];
      if (!c || chords[mi * 4 + 1] !== c || chords[mi * 4 + 2] !== c || chords[mi * 4 + 3] !== c) return;
      const inBar = pitched.filter((n) => n.measure === mi);
      if (inBar.length !== 4) return;
      const degrees = inBar.map((n) => degreeOf(n.midi, c)).join(" ");
      let fam = shapes.get(c.cls);
      if (!fam) shapes.set(c.cls, (fam = { bars: 0, tally: new Tally(), kinds: new Map() }));
      fam.bars++;
      fam.tally.add(degrees, { title, bar: mi + 1 });
      if (!fam.kinds.has(degrees)) fam.kinds.set(degrees, shapeKind(inBar.map((n) => n.midi), c, chords[mi * 4 + 4] ?? null, pitched.find((n) => n.measure === mi + 1)?.midi ?? null));
    });

    // Bars whose downbeats don't fit the written chord.
    /** Share of a bar's on-beat notes that are chord tones of the written chord. */
    const onBeatTones = (mi: number) => {
      const on = pitched.filter((n) => n.measure === mi && Math.abs(n.start - Math.round(n.start)) < 1e-6);
      if (!on.length) return 1;
      return on.filter((n) => {
        const c = at(n.start);
        return c ? isTone(n.midi, c) : true;
      }).length / on.length;
    };
    t.measures.forEach((m, mi) => {
      if (!chords[mi * 4]) return;
      const hits = pitched.filter((n) => n.measure === mi && Math.abs(n.start - Math.round(n.start)) < 1e-6 && Math.round(n.start) % 2 === 0);
      if (hits.length < 2) return;
      const misses = hits.filter((n) => {
        const c = at(n.start);
        return c && !isTone(n.midi, c) && !inScale(n.midi, c);
      }).length;
      const offTone = hits.filter((n) => {
        const c = at(n.start);
        return c && !isTone(n.midi, c);
      }).length;
      const first = hits.find((n) => Math.abs(n.start - mi * 4) < 1e-6);
      const firstOff = first ? !isTone(first.midi, at(first.start) ?? chords[mi * 4]!) : false;
      if ((misses >= 1 && offTone === hits.length) || (firstOff && onBeatTones(mi) <= 0.5)) suspect.push({ title, bar: mi + 1 });
    });

    // Recurring five-note phrases (intervals + rhythm), not overlapping themselves.
    for (let i = 0; i + 4 < pitched.length; i++) {
      const run = pitched.slice(i, i + 5);
      if (run[4].start - run[0].start > 4.01) continue;
      const ivs = run.slice(1).map((n, k) => n.midi - run[k].midi);
      if (ivs.every((d) => d === 0)) continue;
      const rhy = run.slice(0, 4).map((n, k) => Math.round((run[k + 1].start - n.start) * 12)).join(",");
      const key = `${ivs.join(",")}|${rhy}`;
      const ivText = ivs.map((d) => (d === 0 ? "=" : `${d > 0 ? "↑" : "↓"}${Math.abs(d)}`)).join(" ");
      const e = lickMap.get(key);
      const w = { title, bar: run[0].measure + 1 };
      const pos = ti * 1e6 + i;
      if (!e) lickMap.set(key, { count: 1, examples: [w], notes: run.map((n) => noteName(n.midi)).join(" "), intervals: ivText, rhythm: rhythmText(run), last: pos });
      else if (pos - e.last >= 5) {
        e.count++;
        e.last = pos;
        if (e.examples.length < 4) e.examples.push(w);
      }
    }
  });

  pitches.sort((a, b) => a - b);
  return {
    transcriptions: used,
    bars,
    notes: noteCount,
    range: pitches.length ? { low: pitches[0], high: pitches[pitches.length - 1], median: pitches[pitches.length >> 1] } : null,
    rhythm: rhythm.shares(),
    downbeats: downbeats.shares(),
    beats: beatTallies.map((t, i) => ({ beat: i + 1, shares: t.shares() })),
    motion,
    approaches: approaches.shares(8),
    transitions: [...transitions.entries()]
      .filter(([, v]) => v.count >= 2)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 8)
      .map(([change, v]) => ({ change, count: v.count, approaches: v.approaches.shares(3), lines: v.lines.shares(3) })),
    shapes: [...shapes.entries()]
      .sort((a, b) => b[1].bars - a[1].bars)
      .map(([cls, v]) => ({ family: FAMILY[cls], bars: v.bars, items: v.tally.shares(6).map((s) => ({ ...s, kind: v.kinds.get(s.label) ?? "" })) })),
    licks: [...lickMap.values()]
      .filter((l) => l.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8)
      .map(({ intervals, rhythm, count, examples, notes }) => ({ intervals, rhythm, count, examples, notes })),
    suspectBars: suspect,
  };
}

function degreeLabel(d: string): string {
  const names: Record<string, string> = {
    "1": "Root",
    "♭2": "♭9",
    "2": "9th (2)",
    "♭3": "3rd (♭3)",
    "3": "3rd",
    "4": "4th / 11th",
    "♭5": "♭5",
    "5": "5th",
    "♯5": "♯5 / ♭13",
    "6": "6th / 13th",
    "♭7": "7th (♭7)",
    "7": "7th (maj)",
  };
  return names[d] ?? d;
}

function rhythmName(ticks: number): string {
  if (ticks % 16 === 0 && ticks % 24 !== 0) return "Triplets";
  if (ticks >= 96) return "Half notes or longer";
  if (ticks >= 48) return "Quarter notes";
  if (ticks >= 24) return "Eighth notes";
  return "Sixteenths";
}

function rhythmText(run: N[]): string {
  const names: Record<number, string> = { 48: "♩", 24: "♪", 16: "³♪", 32: "³♩", 96: "𝅗𝅥", 72: "♩.", 12: "𝅘𝅥𝅯" };
  return run
    .slice(0, 4)
    .map((n, k) => names[Math.round((run[k + 1].start - n.start) * TICKS_PER_QUARTER)] ?? "·")
    .join(" ");
}

function approachName(from: number, to: number, target: BeatChord): string {
  const d = to - from;
  if (d === 0) return "Same note";
  if (d === 1) return "Half step below";
  if (d === -1) return "Half step above";
  if (d === 2) return "Whole step below";
  if (d === -2) return "Whole step above";
  if ((((from - target.root) % 12) + 12) % 12 === 7 && (Math.abs(d) === 5 || Math.abs(d) === 7)) return "From its 5th";
  if (Math.abs(d) === 12) return "Octave jump";
  return Math.abs(d) <= 4 ? "Small skip" : "Leap";
}

/** A name for a four-note bar shape over one chord. */
function shapeKind(midis: number[], c: BeatChord, next: BeatChord | null, nextMidi: number | null): string {
  const tones = midis.map((m) => isTone(m, c));
  const steps = midis.slice(1).map((m, k) => m - midis[k]);
  const up = steps.every((d) => d > 0);
  const down = steps.every((d) => d < 0);
  const approachLast = nextMidi !== null && Math.abs(nextMidi - midis[3]) <= 2 && Math.abs(nextMidi - midis[3]) >= 1 && next !== null;
  const firstThreeTones = tones.slice(0, 3).every(Boolean);
  const plus = approachLast ? " + approach" : "";
  if (steps[0] === 0 && steps[2] === 0) return "Two-feel (notes in pairs)";
  if (steps.some((d) => d === 0)) return "Repeated notes" + plus;
  if (tones.every(Boolean) && (up || down)) return up ? "Arpeggio up" : "Arpeggio down";
  if (steps.every((d) => Math.abs(d) <= 2)) return (up ? "Scale up" : down ? "Scale down" : "Stepwise") + plus;
  if (firstThreeTones) return `Arpeggio${up ? " up" : down ? " down" : ""}${plus}`;
  return (tones.filter(Boolean).length >= 2 ? "Chord tones" : "Mixed") + plus;
}
