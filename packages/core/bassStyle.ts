import {
  BASS_HIGH,
  BASS_LOW,
  chartHarmony,
  generateChorus,
  harmonyOf,
  makeRng,
  performedBeats,
  TOUCH_VELOCITY,
  type BarHarmony,
  type BassChorus,
  type BassLineOptions,
  type BassLineState,
  type BassNote,
  type BassPhrase,
  type Harmony,
  type PerformedBeat,
  type Rng,
} from "./bassLine";
import { measureCapacity, TICKS_PER_QUARTER, timeline, type Transcription } from "./bassTranscription";
import { parseChordToken, type IRealSong } from "./iRealPro";

// Playing like one of your bass players: their transcriptions are the vocabulary.
//
// `analyzeStyle` reads every transcription into what's sounding on each beat (from its chord
// symbols) and the notes played over it. To write a chorus, `generateStyledChorus` walks the chart
// half a bar at a time and looks for the same progression somewhere in the transcriptions — the
// same root movement beat for beat, in any key, with the chord changes landing on the same beats
// of the bar — preferring the longest stretch that matches (up to 8 bars), with a little leeway
// for chord-quality differences (a sus for a 7th, a minor 6 for a minor 7…). The player's actual
// line from there is transposed into place, with any note that was a chord tone mapped to the
// matching tone of the new chord where the qualities differ, and set in the octave that joins
// best onto what came before. Where the passage's line was leading somewhere other than where the
// chart now goes, its last note is turned into a half-step approach to the next note played.
// Stretches nothing matches are walked by the Computer player in the same register, so the line
// never stops. Several good matches are picked between at random, and recently used passages are
// avoided, so choruses differ.

export type ChordClass = "maj" | "dom" | "min" | "minmaj" | "hdim" | "dim" | "sus" | "aug";

/** The family a chord quality belongs to, for deciding whether two progressions are "the same". */
export function chordClass(quality: string): ChordClass {
  const q = quality.replace(/[()]/g, "");
  const minor = q.startsWith("-") || (q.startsWith("m") && !q.startsWith("maj"));
  if (q.includes("h") || (minor && q.includes("b5"))) return "hdim";
  if (q.startsWith("o")) return "dim";
  if (minor) return q.includes("^") || q.includes("maj") ? "minmaj" : "min";
  if (q.includes("sus")) return "sus";
  if (q.includes("^") || q.includes("maj")) return "maj";
  if (/7|9|11|13|alt/.test(q)) return "dom";
  if (q.includes("+")) return "aug";
  return "maj";
}

const SIMILAR = new Set(["dom|sus", "min|minmaj", "maj|aug", "hdim|dim", "min|hdim", "dom|aug"]);
/** How different two chord families are (0 = same). */
function classCost(a: ChordClass, b: ChordClass): number {
  if (a === b) return 0;
  return SIMILAR.has(`${a}|${b}`) || SIMILAR.has(`${b}|${a}`) ? 0.3 : 1.5;
}

/** A chord as the matcher sees it: root and slash bass as pitch classes, its family, and its
    chord tones (root, 3rd, 5th, 7th — in that order) and scale as intervals from the root. */
export type BeatChord = {
  key: string;
  root: number;
  bass: number;
  cls: ChordClass;
  tones: number[];
  scale: number[];
  /** Chord tones / scale as 12-bit masks of intervals from the root. */
  toneMask: number;
  scaleMask: number;
};

const maskOf = (ivs: number[]) => ivs.reduce((m, iv) => m | (1 << iv), 0);
/** A 12-bit interval mask moved up `by` semitones. */
const rot = (m: number, by: number) => ((m << by) | (m >>> (12 - by))) & 0xfff;
function popcount(m: number): number {
  let n = 0;
  while (m) {
    m &= m - 1;
    n++;
  }
  return n;
}

const chordCache = new Map<string, BeatChord | null>();
function chordFromSymbol(symbol: string): BeatChord | null {
  const hit = chordCache.get(symbol);
  if (hit !== undefined) return hit;
  const slot = parseChordToken(symbol);
  let out: BeatChord | null = null;
  if (slot && slot.kind === "chord") out = fromHarmony(symbol, harmonyOf(slot), chordClass(slot.quality));
  chordCache.set(symbol, out);
  return out;
}
function fromHarmony(key: string, h: Harmony, cls: ChordClass): BeatChord {
  const rel = (pc: number) => (pc - h.root + 12) % 12;
  const tones = h.tones.map(rel);
  const scale = h.scale.map(rel);
  return { key, root: h.root, bass: h.bass, cls, tones, scale, toneMask: maskOf(tones), scaleMask: maskOf(scale) };
}
export function chordOfHarmony(h: Harmony | null): BeatChord | null {
  return h ? chordFromSymbol(h.symbol) : null;
}

type SourceNote = { start: number; length: number; midi: number; ghost: boolean };
type SourceTune = {
  title: string;
  /** Its index in the transcriptions given to `analyzeStyle`. */
  index: number;
  /** What's sounding on each beat (4 a bar), null before the first chord symbol. */
  beats: (BeatChord | null)[];
  /** Sorted by start; in beats from the top of the transcription. */
  notes: SourceNote[];
  /** `firstNoteAt[b]` = index of the first note starting at or after beat b. */
  firstNoteAt: number[];
  /** The pitch classes started in each beat, weighted (on the beat 1, off it 0.5; ghosts not) —
      what the player actually outlined there, whatever the chord symbols say. */
  beatNotes: BeatNote[];
};

/** A note the player started in a beat: pitch class, weight (1 on the beat, 0.5 off it), and
    whether it moves by step into the next note — a passing tone or an approach, which a walking
    line is full of and which shouldn't count against a chord. */
type BeatNote = { pc: number; w: number; step: boolean; repeat: boolean }[];

export type BassStyle = {
  name: string;
  tunes: SourceTune[];
  transcriptions: number;
  /** Bars with both a chord and notes — what can actually be matched. */
  usableBars: number;
  /** The player's usual register (median MIDI note). */
  median: number;
};

/** What's sounding on each beat of a 4/4 transcription (4 a bar), from its chord symbols: a chord
    on an off-beat (pushed, as written for an anticipation) sounds from the next beat; one on the
    "and" of 4 from the next bar's downbeat. Null before the first chord. */
export function transcriptionBeats(t: Transcription): (BeatChord | null)[] {
  const beats: (BeatChord | null)[] = [];
  let current: BeatChord | null = null;
  // A chord on an off-beat (pushed, as written for an anticipation) sounds from the next beat;
  // one on the "and" of 4 from the next bar's downbeat.
  let pushed: BeatChord | null = null;
  for (const m of t.measures) {
    const chords = [...m.chords].sort((a, b) => a.beat - b.beat);
    for (let k = 0; k < 4; k++) {
      if (pushed) {
        current = pushed;
        pushed = null;
      }
      for (const c of chords) if (c.beat > k - 1 + 1e-6 && c.beat <= k + 1e-6) current = chordFromSymbol(c.symbol) ?? current;
      if (k === 3) for (const c of chords) if (c.beat > 3 + 1e-6) pushed = chordFromSymbol(c.symbol) ?? pushed;
      beats.push(current);
    }
  }
  return beats;
}

/** Reads a player's transcriptions into something to match chord progressions against. */
export function analyzeStyle(name: string, transcriptions: Transcription[]): BassStyle {
  const tunes: SourceTune[] = [];
  const pitches: number[] = [];
  let usableBars = 0;
  for (const [index, t] of transcriptions.entries()) {
    // Only 4/4 for now (the editor's only meter).
    if (measureCapacity(t) !== 4 * TICKS_PER_QUARTER) continue;
    const beats = transcriptionBeats(t);
    const notes: SourceNote[] = timeline(t)
      .filter((n) => n.midi !== null)
      .map((n) => ({ start: n.start / TICKS_PER_QUARTER, length: n.ticks / TICKS_PER_QUARTER, midi: n.midi as number, ghost: n.ghost }));
    if (!notes.length) continue;
    for (const n of notes) if (!n.ghost) pitches.push(n.midi);
    const firstNoteAt: number[] = [];
    let ni = 0;
    for (let b = 0; b <= beats.length; b++) {
      while (ni < notes.length && notes[ni].start < b - 1e-6) ni++;
      firstNoteAt.push(ni);
    }
    for (let mi = 0; mi < t.measures.length; mi++) {
      const hasChord = beats.slice(mi * 4, mi * 4 + 4).some(Boolean);
      const hasNotes = firstNoteAt[Math.min(mi * 4 + 4, beats.length)] > firstNoteAt[mi * 4];
      if (hasChord && hasNotes) usableBars++;
    }
    const beatNotes: BeatNote[] = beats.map(() => []);
    notes.forEach((n, i) => {
      const k = Math.floor(n.start + 1e-6);
      if (n.ghost || k >= beats.length) return;
      const next = notes.slice(i + 1).find((m) => !m.ghost);
      const step = !!next && next.start - (n.start + n.length) < 0.01 && Math.abs(next.midi - n.midi) >= 1 && Math.abs(next.midi - n.midi) <= 2;
      const before = notes.slice(0, i).reverse().find((m) => !m.ghost);
      beatNotes[k].push({ pc: n.midi % 12, w: Math.abs(n.start - k) < 1e-6 ? 1 : 0.5, step, repeat: !!before && before.midi === n.midi });
    });
    tunes.push({ title: t.title.trim() || "Untitled", index, beats, notes, firstNoteAt, beatNotes });
  }
  pitches.sort((a, b) => a - b);
  return { name, tunes, transcriptions: tunes.length, usableBars, median: pitches.length ? pitches[pitches.length >> 1] : 36 };
}

/** How alike two chords are when the source is moved up `shift` semitones: the share of chord
    tones they have in common (so Bb6 and G-7 — the same four notes — count as close, and D-7 is
    near Bbmaj7), plus a bonus for the same root and for the same bass note. 0 to 1.7. */
function chordSim(t: BeatChord, s: BeatChord, shift: number): number {
  const sRoot = (s.root + shift) % 12;
  const a = rot(t.toneMask, t.root);
  const b = rot(s.toneMask, sRoot);
  return popcount(a & b) / popcount(a | b) + (sRoot === t.root ? 0.5 : 0) + ((s.bass + shift) % 12 === t.bass ? 0.2 : 0);
}

/** How well the notes a player started in one beat fit a chord, with the line moved up `shift`:
    chord tones 1, scale tones 0.6, anything else (a chromatic passing note) 0.25. Null when no
    note starts there (a held note or a rest says nothing). */
function noteFit(t: BeatChord, notes: BeatNote, shift: number, chordStart: boolean): number | null {
  if (!notes.length) return null;
  let sum = 0;
  let weight = 0;
  for (const n of notes) {
    const iv = (n.pc + shift - t.root + 24) % 12;
    const tone = (t.toneMask >> iv) & 1;
    let fit = iv === 0 || tone ? 1 : n.step ? FIT_STEP : (t.scaleMask >> iv) & 1 ? FIT_SCALE : FIT_OTHER;
    // The note on a new chord's downbeat says most about what the player heard there.
    // A downbeat that isn't in the chord is plainly wrong for a bass line, so it counts against.
    if (chordStart && n.w === 1) fit = (n.pc + shift) % 12 === t.bass ? 1.6 : tone ? 0.9 : FIT_WRONG_DOWNBEAT;
    // A repeated note says nothing new about the chord.
    sum += n.w * (n.repeat && fit > 0 ? fit * REPEAT_CREDIT : fit);
    weight += n.w;
  }
  return sum / weight;
}
const FIT_SCALE = 0.45;
const FIT_STEP = 0.9;
const REPEAT_CREDIT = 0.5;
const FIT_WRONG_DOWNBEAT = -0.6;
const FIT_OTHER = 0.1;

/** One beat's match: the player's own notes against the chart's chord count most (chord symbols
    in transcriptions are often loose or a bar off), their written chord a little. */
function beatScore(t: BeatChord, s: BeatChord, notes: BeatNote, shift: number, chordStart: boolean): number {
  const label = chordSim(t, s, shift);
  const fit = noteFit(t, notes, shift, chordStart) ?? label / 1.7;
  return LABEL_WEIGHT * label + 1.2 * fit;
}
const LABEL_WEIGHT = 0.12;

/** A stretch of the chorus played from a transcription (or by the Computer when `tune` is -1). */
type Segment = { b: number; length: number; tune: number; start: number; shift: number };

// Alignment scoring. Per beat: similarity − MATCH_BASE (so a close chord earns, a poor one costs);
// the Computer earns COMPUTER per beat. Jumping to a new place in the transcriptions costs JUMP,
// handing over to the Computer COMPUTER_IN — so a long run through the player's line wins even
// where a few chords disagree, the way a bassist hears rhythm changes as rhythm changes.
const MATCH_BASE = 0.85;
const COMPUTER = -0.55;
const JUMP = 14;
/** Extra for a jump that also changes key — a player doesn't change key every few bars. */
const KEY_CHANGE = 6;
const COMPUTER_IN = 1;
const RECENT_COST = 0.3;

/**
 * Lays the chorus over the transcriptions (a Viterbi alignment): each beat of the chart is either
 * a beat of some transcription (in some key) or the Computer's. Carrying on to the transcription's
 * next beat is free; starting somewhere new — only on a half bar, on the same half of the bar —
 * costs JUMP. Returns the best path as segments.
 */
function align(
  style: BassStyle,
  target: (BeatChord | null)[],
  beats: PerformedBeat[],
  end: number,
  recent: Set<string>,
  noise: () => number,
  /** Where the last chorus left off in the transcriptions: carrying on from there is free. */
  from: { tune: number; beat: number; shift: number } | null = null,
  /** Extra cost per source beat ("tune:beat"), e.g. for passages already used this chorus. */
  extra: Map<string, number> = new Map(),
): Segment[] {
  const N = target.length;
  const offsets: number[] = [];
  let total = 0;
  for (const tune of style.tunes) {
    offsets.push(total);
    total += tune.beats.length;
  }
  const S = total * 12; // (source beat, shift) states; index S is the Computer
  const C = S;
  if (N === 0) return [];
  // Source beats as chord ids, and similarity tables per target chord.
  const srcIds: number[] = new Array(total).fill(-1);
  const srcChords: BeatChord[] = [];
  const idOf = new Map<string, number>();
  style.tunes.forEach((tune, ti) =>
    tune.beats.forEach((c, j) => {
      if (!c) return;
      let id = idOf.get(c.key);
      if (id === undefined) {
        id = srcChords.length;
        idOf.set(c.key, id);
        srcChords.push(c);
      }
      srcIds[offsets[ti] + j] = id;
    }),
  );
  // The likely keys for each transcription against this chart (top 3 by how well their chord
  // roots line up) — trying all 12 everywhere is slow and invites far-fetched matches.
  const targetRoots = new Float64Array(12);
  for (const t of target) if (t) targetRoots[t.root] += 1;
  const allowed = new Uint8Array(S);
  style.tunes.forEach((tune, ti) => {
    const srcRoots = new Float64Array(12);
    for (const c of tune.beats) if (c) srcRoots[c.root] += 1;
    const fit = Array.from({ length: 12 }, (_, d) => {
      let sum = 0;
      for (let pc = 0; pc < 12; pc++) sum += targetRoots[pc] * srcRoots[(pc - d + 12) % 12];
      return { d, sum };
    }).sort((a, b) => b.sum - a.sum);
    const keep = new Set(fit.slice(0, 3).map((f) => f.d));
    if (from && from.tune === ti) keep.add(from.shift);
    for (let j = 0; j < tune.beats.length; j++) for (const d of keep) allowed[(offsets[ti] + j) * 12 + d] = 1;
  });
  const srcBeatNotes: BeatNote[] = [];
  style.tunes.forEach((tune) => tune.beatNotes.forEach((n) => srcBeatNotes.push(n)));
  const simCache = new Map<string, Float32Array>();
  /** Every source beat × shift scored against one chart chord. */
  const simFor = (t: BeatChord, chordStart: boolean) => {
    const key = `${t.key}|${chordStart ? 1 : 0}`;
    let row = simCache.get(key);
    if (!row) {
      row = new Float32Array(total * 12);
      for (let si = 0; si < total; si++) {
        const id = srcIds[si];
        if (id < 0) continue;
        for (let d = 0; d < 12; d++) if (allowed[si * 12 + d]) row[si * 12 + d] = beatScore(t, srcChords[id], srcBeatNotes[si], d, chordStart) - MATCH_BASE;
      }
      simCache.set(key, row);
    }
    return row;
  };
  const recentCost = new Float32Array(total);
  style.tunes.forEach((tune, ti) => {
    for (let j = 0; j < tune.beats.length; j++) {
      const key = `${ti}:${j}`;
      recentCost[offsets[ti] + j] = (recent.has(key) ? RECENT_COST : 0) + (extra.get(key) ?? 0);
    }
  });
  // Which (tune, beat) a flat source index is, for the jump-phase check.
  const beatInTune = new Int32Array(total);
  style.tunes.forEach((tune, ti) => {
    for (let j = 0; j < tune.beats.length; j++) beatInTune[offsets[ti] + j] = j;
  });

  let prev = new Float64Array(S + 1).fill(-Infinity);
  let cur = new Float64Array(S + 1);
  // 0 = carried on (or Computer→Computer); 1 = jumped from the best state in the same key;
  // 2 = jumped from the best state overall (changing key, or out of the Computer).
  const back: Uint8Array[] = [];
  const bestAt: number[] = [];
  const bestKeyAt: Int32Array[] = [];
  for (let b = 0; b < N; b++) {
    const t = target[b];
    const ok = b < end && !!t && beats[b].beatsInBar === 4;
    const canJump = ok && beats[b].beatInBar % 2 === 0;
    const phase = beats[b].beatInBar % 4;
    let best = -Infinity;
    let bestIdx = C;
    const bestKey = new Float64Array(12).fill(-Infinity);
    const bestKeyIdx = new Int32Array(12).fill(C);
    if (b > 0) {
      for (let x = 0; x <= S; x++) {
        const v = prev[x];
        if (v > best) {
          best = v;
          bestIdx = x;
        }
        if (x < S && v > bestKey[x % 12]) {
          bestKey[x % 12] = v;
          bestKeyIdx[x % 12] = x;
        }
      }
    } else {
      best = 0;
      bestKey.fill(0);
    }
    bestAt.push(bestIdx);
    bestKeyAt.push(bestKeyIdx);
    const bk = new Uint8Array(S + 1);
    const row = ok ? simFor(t!, b === 0 || target[b - 1]?.key !== t!.key || beats[b].beatInBar === 0) : null;
    for (let x = 0; x < S; x++) {
      if (!row) {
        cur[x] = -Infinity;
        continue;
      }
      if (!allowed[x]) {
        cur[x] = -Infinity;
        continue;
      }
      const si = (x / 12) | 0;
      const j = beatInTune[si];
      let carried = b > 0 && j > 0 ? prev[x - 12] : -Infinity;
      if (b === 0 && from && si === offsets[from.tune] + from.beat && x % 12 === from.shift) carried = 0;
      let jumped = -Infinity;
      let how = 0;
      if (canJump && j % 4 === phase) {
        // Starting a chorus somewhere new is a smaller step than breaking off mid-chorus.
        const jumpCost = b === 0 ? JUMP / 2 : JUMP;
        const sameKey = bestKey[x % 12] - jumpCost;
        const anyKey = best - jumpCost - (b > 0 && bestIdx !== C ? KEY_CHANGE : 0);
        if (sameKey >= anyKey) {
          jumped = sameKey;
          how = 1;
        } else {
          jumped = anyKey;
          how = 2;
        }
      }
      if (carried >= jumped) {
        cur[x] = carried;
        bk[x] = 0;
      } else {
        cur[x] = jumped;
        bk[x] = how;
      }
      if (cur[x] > -Infinity) cur[x] += row[x] - recentCost[si] + noise();
    }
    const stay = b > 0 ? prev[C] : 0;
    const enter = b > 0 ? best - COMPUTER_IN : -Infinity;
    if (stay >= enter) {
      cur[C] = stay + COMPUTER;
      bk[C] = 0;
    } else {
      cur[C] = enter + COMPUTER;
      bk[C] = 2;
    }
    back.push(bk);
    [prev, cur] = [cur, prev];
  }
  // Trace back.
  let x = C;
  let top = -Infinity;
  for (let k = 0; k <= S; k++)
    if (prev[k] > top) {
      top = prev[k];
      x = k;
    }
  const path: number[] = new Array(N);
  for (let b = N - 1; b >= 0; b--) {
    path[b] = x;
    if (b === 0) break;
    const how = back[b][x];
    x = how === 1 ? bestKeyAt[b][x % 12] : how === 2 ? bestAt[b] : x === C ? C : x - 12;
  }
  // Path → segments.
  const segs: Segment[] = [];
  const tuneOf = (si: number) => {
    let ti = 0;
    while (ti + 1 < offsets.length && offsets[ti + 1] <= si) ti++;
    return ti;
  };
  for (let b = 0; b < N; b++) {
    const st = path[b];
    const last = segs[segs.length - 1];
    if (st === C) {
      if (last && last.tune === -1) last.length++;
      else segs.push({ b, length: 1, tune: -1, start: 0, shift: 0 });
      continue;
    }
    const si = (st / 12) | 0;
    const ti = tuneOf(si);
    const j = si - offsets[ti];
    const shift = st % 12;
    if (last && last.tune === ti && last.shift === shift && last.start + last.length === j && back[b][st] === 0) last.length++;
    else segs.push({ b, length: 1, tune: ti, start: j, shift });
  }
  return segs;
}

/** Moves a borrowed note to fit the target chord where its quality differs from the source's:
    a chord tone becomes the same chord tone of the new chord, a held note outside the new scale
    moves to the nearest note in it, and the root on a slash chord's downbeat becomes the bass. */
function refit(midi: number, src: BeatChord, tgt: BeatChord, onBeat: boolean, held: boolean, chordStart: boolean): number {
  const iv = (((midi - tgt.root) % 12) + 12) % 12;
  if (chordStart && onBeat && iv === 0 && tgt.bass !== tgt.root) {
    const up = (tgt.bass - tgt.root + 12) % 12;
    return midi + (up > 6 ? up - 12 : up);
  }
  // A substitute chord (another root): the player's line is kept as played over theirs.
  if (src.root !== tgt.root || src.cls === tgt.cls) return midi;
  const degree = src.tones.indexOf(iv);
  if (degree > 0 && tgt.tones[degree] !== undefined) {
    let d = tgt.tones[degree] - iv;
    if (d > 6) d -= 12;
    if (d < -6) d += 12;
    return midi + d;
  }
  if (degree === -1 && (onBeat || held) && !tgt.scale.includes(iv) && !tgt.tones.includes(iv)) {
    for (const d of [-1, 1, -2, 2]) {
      const c = (iv + d + 12) % 12;
      if (tgt.scale.includes(c)) return midi + d;
    }
  }
  return midi;
}

/** Picks the octave for a passage: joined to the note before, near the player's register, in range. */
function placeOctave(notes: BassNote[], prev: number | null, median: number): BassNote[] {
  return placeOctaveInfo(notes, prev, median).notes;
}
function placeOctaveInfo(notes: BassNote[], prev: number | null, median: number): { notes: BassNote[]; octave: number; folded: number } {
  if (!notes.length) return { notes, octave: 0, folded: 0 };
  let best = notes;
  let bestExtra = 0;
  let bestCost = Infinity;
  for (const extra of [-24, -12, 0, 12, 24]) {
    const moved = notes.map((n) => ({ ...n, midi: n.midi + extra }));
    const mean = moved.reduce((s, n) => s + n.midi, 0) / moved.length;
    let cost = Math.abs(mean - median) * 0.4;
    if (prev !== null) {
      const leap = Math.abs(moved[0].midi - prev);
      cost += leap <= 7 ? leap * 0.3 : 2 + leap * 0.6;
    }
    for (const n of moved) {
      // Light: a stray note is folded back into range below, so one shouldn't move the passage.
      if (n.midi < BASS_LOW) cost += (BASS_LOW - n.midi) * 0.6;
      if (n.midi > BASS_HIGH + 5) cost += (n.midi - BASS_HIGH - 5) * 0.6;
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = moved;
      bestExtra = extra;
    }
  }
  // Fold any stray note back into the upright's range.
  let folded = 0;
  const out = best.map((n) => {
    let m = n.midi;
    while (m < BASS_LOW) m += 12;
    while (m > 60) m -= 12;
    if (m === n.midi) return n;
    folded++;
    return { ...n, midi: m };
  });
  return { notes: out, octave: bestExtra / 12, folded };
}

/** Chords over `length` beats from `from`, bar by bar: "Bb6 G-7 | C-7 F7". Bars follow `beats`
    (the chart) when given, else every 4 beats (a transcription). */
function chordsText(chords: (BeatChord | null)[], from: number, length: number, beats: PerformedBeat[] | null): string {
  const bars: string[][] = [];
  for (let k = 0; k < length; k++) {
    const b = from + k;
    const barStart = k === 0 || (beats ? beats[b]?.beatInBar === 0 : b % 4 === 0);
    if (barStart) bars.push([]);
    const bar = bars[bars.length - 1];
    const c = chords[b];
    if (barStart || c?.key !== chords[b - 1]?.key) bar.push(c ? c.key : "N.C.");
  }
  return bars.map((bar) => bar.join(" ")).join(" | ");
}

export const PHRASE_BARS = 4;

/** Cuts `length` beats from `b` into phrases of up to four bars, on the chart's bar lines. */
export function phraseCuts(beats: PerformedBeat[], b: number, length: number): [number, number][] {
  const cuts: [number, number][] = [];
  let start = 0;
  let barsIn = 0;
  for (let k = 0; k < length; k++) {
    if (k > 0 && beats[b + k]?.beatInBar === 0) {
      barsIn++;
      if (barsIn >= PHRASE_BARS) {
        cuts.push([start, k]);
        start = k;
        barsIn = 0;
      }
    } else if (k === 0 && beats[b]?.beatInBar !== 0) barsIn = -1; // a part bar first doesn't count
  }
  cuts.push([start, length]);
  return cuts;
}

const REUSE_COST = 0.6;

/** `align`, then — if it played the same passage of a transcription twice in this chorus — again
    with those beats made dearer, so a chorus doesn't repeat itself (up to three passes). */
function alignChorus(
  style: BassStyle,
  target: (BeatChord | null)[],
  beats: PerformedBeat[],
  end: number,
  recent: Set<string>,
  noise: () => number,
  from: { tune: number; beat: number; shift: number } | null,
): Segment[] {
  const extra = new Map<string, number>();
  let segs = align(style, target, beats, end, recent, noise, from, extra);
  for (let pass = 0; pass < 3; pass++) {
    const count = new Map<string, number>();
    for (const seg of segs) if (seg.tune >= 0) for (let k = 0; k < seg.length; k++) {
      const key = `${seg.tune}:${seg.start + k}`;
      count.set(key, (count.get(key) ?? 0) + 1);
    }
    let repeats = false;
    for (const [key, n] of count) if (n > 1) {
      extra.set(key, (extra.get(key) ?? 0) + REUSE_COST);
      repeats = true;
    }
    if (!repeats) break;
    segs = align(style, target, beats, end, recent, noise, from, extra);
  }
  return segs;
}

/**
 * One chorus in a modelled player's style. Same shape as `generateChorus` (which it uses to fill
 * any gaps, and for the final held note).
 */
export function generateStyledChorus(
  song: IRealSong,
  options: BassLineOptions,
  style: BassStyle,
  state: BassLineState,
  chorus: number,
  startBeat: number,
  isLast: boolean,
  harmony: BarHarmony[] = chartHarmony(song),
): { chorus: BassChorus; state: BassLineState } {
  const rng: Rng = makeRng(state.seed ^ 0x5bd1e995);
  // The Computer's own chorus, in the player's register: used wherever nothing matches.
  const fillState = chorus === 0 && state.lastNote === null ? { ...state, registerGoal: Math.max(31, Math.min(43, style.median)) } : state;
  const fill = generateChorus(song, { ...options, feel: "walking" }, fillState, chorus, startBeat, isLast, harmony);
  const beats: PerformedBeat[] = fill.chorus.beats.map((b) => ({ ...b }));
  const target = beats.map((b) => chordOfHarmony(b.harmony));
  const N = beats.length;
  // The last chorus ends with the Computer's held root, so its final bar is left to it.
  let end = N;
  if (isLast) {
    for (let k = N - 1; k >= 0; k--)
      if (beats[k].beatInBar === 0) {
        end = k;
        break;
      }
  }

  const base = TOUCH_VELOCITY[options.touch];
  const vel = (onBeat: boolean, downbeat: boolean, ghost: boolean) =>
    Math.max(0.05, Math.min(1, base + (downbeat ? 0.05 : 0) + (onBeat ? 0 : -0.06) + (ghost ? -0.3 : 0) + (rng.next() - 0.5) * 0.08));

  const out: BassNote[] = [];
  const recent = [...(state.recent ?? [])];
  let prev: number | null = state.lastNote;

  /** Appends a passage (absolute beats), first turning the note before it into an approach if it
      was leading somewhere else. */
  const phrases: BassPhrase[] = [];
  const append = (notes: BassNote[], at: number) => {
    const first = notes[0];
    const last = out[out.length - 1];
    if (first && last && Math.abs(first.beat - at) < 1e-6 && last.beat >= at - 1 - 1e-6 && !last.ghost) {
      const gap = Math.abs(last.midi - first.midi);
      if (gap > 2 && gap !== 5 && gap !== 7) {
        last.midi = first.midi + (last.midi > first.midi ? 1 : -1);
        const owner = phrases[phrases.length - 1];
        if (owner) owner.leadIn = true;
      }
    }
    out.push(...notes);
    if (notes.length) prev = notes[notes.length - 1].midi;
  };
  /** What a passage starting at `at` should join onto: the last note — or, when that note is in
      the beat just before and may become an approach to the passage, the one before it. */
  const anchor = (at: number): number | null => {
    const last = out[out.length - 1];
    if (last && !last.ghost && last.beat >= at - 1 - 1e-6 && out.length >= 2) return out[out.length - 2].midi;
    return prev;
  };
  const computerPart = (from: number, to: number) => {
    const a = startBeat + from;
    const z = startBeat + to;
    const notes = fill.chorus.notes.filter((n) => n.beat >= a - 1e-6 && n.beat < z - 1e-6).map((n) => ({ ...n }));
    append(placeOctave(notes, anchor(a), style.median), a);
    for (const [k0, k1] of phraseCuts(beats, from, to - from))
      phrases.push({ beat: a + k0, length: k1 - k0, chartChords: chordsText(target, from + k0, k1 - k0, beats), source: null, leadIn: false });
  };

  const segments = alignChorus(style, target, beats, end, new Set(recent), () => (rng.next() - 0.5) * 0.06, state.next ?? null);
  const used: string[] = [];
  for (const seg of segments) {
    if (seg.tune < 0) {
      computerPart(seg.b, seg.b + seg.length);
      continue;
    }
    const tune = style.tunes[seg.tune];
    const notes: BassNote[] = [];
    const cuts = phraseCuts(beats, seg.b, seg.length);
    const pieceOf = (offset: number) => Math.max(0, cuts.findIndex(([k0, k1]) => offset >= k0 - 1e-6 && offset < k1 - 1e-6));
    const stats = cuts.map(() => ({ refitted: 0, fitting: 0, counted: 0 }));
    for (let i = tune.firstNoteAt[seg.start]; i < tune.notes.length; i++) {
      const n = tune.notes[i];
      const offset = n.start - seg.start;
      if (offset >= seg.length - 1e-6) break;
      const k = Math.floor(offset + 1e-6);
      const src = tune.beats[seg.start + k];
      const tgt = target[seg.b + k];
      const onBeat = Math.abs(offset - k) < 1e-6;
      let midi = n.midi + seg.shift;
      if (src && tgt) {
        const chordStart = k === 0 || target[seg.b + k - 1] !== tgt;
        midi = refit(midi, { ...src, root: (src.root + seg.shift) % 12, bass: (src.bass + seg.shift) % 12 }, tgt, onBeat, n.length >= 1, chordStart);
        if (midi !== n.midi + seg.shift) stats[pieceOf(offset)].refitted++;
      }
      if (tgt && !n.ghost) {
        const iv = (((n.midi + seg.shift - tgt.root) % 12) + 12) % 12;
        const step = tune.beatNotes[seg.start + k]?.some((b) => b.pc === n.midi % 12 && b.step);
        const st = stats[pieceOf(offset)];
        st.counted++;
        if ((tgt.toneMask >> iv) & 1 || (tgt.scaleMask >> iv) & 1 || step) st.fitting++;
      }
      notes.push({
        beat: startBeat + seg.b + offset,
        length: Math.min(n.length, seg.length - offset),
        midi,
        velocity: vel(onBeat, onBeat && beats[seg.b + k].beatInBar === 0, n.ghost),
        ...(n.ghost ? { ghost: true } : {}),
      });
    }
    const placed = placeOctaveInfo(notes, anchor(startBeat + seg.b), style.median);
    append(placed.notes, startBeat + seg.b);
    // Notes folded back into range, per phrase.
    const foldedIn = cuts.map(() => 0);
    placed.notes.forEach((n, i) => {
      if (n.midi !== notes[i].midi + placed.octave * 12) foldedIn[pieceOf(n.beat - startBeat - seg.b)]++;
    });
    cuts.forEach(([k0, k1], pi) =>
      phrases.push({
        beat: startBeat + seg.b + k0,
        length: k1 - k0,
        chartChords: chordsText(target, seg.b + k0, k1 - k0, beats),
        source: {
          transcription: tune.index,
          title: tune.title,
          startBeat: seg.start + k0,
          shift: seg.shift,
          octave: placed.octave,
          sourceChords: chordsText(tune.beats, seg.start + k0, k1 - k0, null),
          fit: stats[pi].counted ? stats[pi].fitting / stats[pi].counted : 1,
          refitted: stats[pi].refitted,
          folded: foldedIn[pi],
        },
        leadIn: false,
      }),
    );
    const firstBar = Math.floor(seg.start / 4) + 1;
    const lastBar = Math.floor((seg.start + seg.length - 1) / 4) + 1;
    const label = `${tune.title}, ${firstBar === lastBar ? `bar ${firstBar}` : `bars ${firstBar}–${lastBar}`}`;
    for (let k = 0; k < seg.length; k++) {
      beats[seg.b + k].from = label;
      used.push(`${seg.tune}:${seg.start + k}`);
    }
  }
  // What this chorus used is what the next one steers away from; if it ended mid-transcription,
  // the next chorus can carry straight on from there.
  recent.splice(0, recent.length, ...used);
  const lastSeg = segments[segments.length - 1];
  const next =
    lastSeg && lastSeg.tune >= 0 && lastSeg.b + lastSeg.length === N && lastSeg.start + lastSeg.length < style.tunes[lastSeg.tune].beats.length
      ? { tune: lastSeg.tune, beat: lastSeg.start + lastSeg.length, shift: lastSeg.shift }
      : null;

  return {
    chorus: { notes: out, beats, phrases },
    state: { ...fill.state, lastNote: prev, seed: rng.seed(), recent, next },
  };
}

/** How much of a chart a player's transcriptions cover: bars the alignment plays from a
    transcription over close chords, and the longest unbroken run (in bars). */
export function styleCoverage(style: BassStyle, song: IRealSong): { bars: number; matched: number; longest: number } {
  const { beats } = performedBeats(song, chartHarmony(song), 0, false);
  const target = beats.map((b) => chordOfHarmony(b.harmony));
  const segs = align(style, target, beats, beats.length, new Set(), () => 0);
  const bars = beats.filter((b) => b.beatInBar === 0).length;
  let matched = 0;
  let longest = 0;
  for (const seg of segs) {
    if (seg.tune < 0) continue;
    const tune = style.tunes[seg.tune];
    let barsHere = 0;
    for (let k = 0; k < seg.length; k++) {
      if (beats[seg.b + k].beatInBar !== 0 || k + 4 > seg.length) continue;
      let sim = 0;
      for (let q = 0; q < 4; q++) {
        const s = tune.beats[seg.start + k + q];
        const t = target[seg.b + k + q];
        if (s && t) sim += chordSim(t, s, seg.shift);
      }
      barsHere++;
      if (sim / 4 >= 0.9) matched++;
    }
    longest = Math.max(longest, barsHere);
  }
  return { bars, matched, longest };
}

// For tests.
export const __test = { align, chordSim, beatScore, chordOfHarmony };
