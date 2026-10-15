import {
  BASS_HIGH,
  BASS_LOW,
  chartHarmony,
  makeRng,
  performedBeats,
  TOUCH_VELOCITY,
  type BarHarmony,
  type BassChorus,
  type BassLineOptions,
  type BassLineState,
  type BassNote,
  type BassPhrase,
  type PerformedBeat,
  type Rng,
} from "./bassLine";
import { chordOfHarmony, phraseCuts, transcriptionBeats, type BeatChord } from "./bassStyle";
import { measureCapacity, TICKS_PER_QUARTER, timeline, type Transcription } from "./bassTranscription";
import type { IRealSong } from "./iRealPro";

// "Learn their style": new bass lines written from what a player's transcriptions show, never
// copied from them. `learnModel` measures, with a little smoothing so a few transcriptions still
// give sensible odds:
//   - which chord role they land on at a chord change (root, 3rd, 5th, 7th, 9th, 11th, 13th,
//     chromatic) — roles, not intervals, so a habit learned over major chords carries to minor;
//   - which role each beat of the bar tends to get;
//   - how far they move between notes (−12…+12 semitones);
//   - how the last note before a change leads into it (−7…+7);
//   - how often a beat gets an eighth-note figure, a triplet skip or a ghost note;
//   - their register.
// `generateLearnedChorus` writes a chorus beat by beat: each chord change's landing note first
// (drawn from their landing habits, placed near the line and their register), then the beats in
// between, each picked at random weighted by the beat's role habits × their motion habits ×
// (before a change) their approach habits; then their rhythmic figures. A bar whose shape (rhythm
// and intervals, in any key) matches a bar of a transcription is rewritten (up to seven times),
// so it doesn't quote them.

export type Role = "root" | "3rd" | "5th" | "7th" | "9th" | "11th" | "13th" | "chromatic";
const ROLES: Role[] = ["root", "3rd", "5th", "7th", "9th", "11th", "13th", "chromatic"];

/** The role an interval (semitones above the chord root) plays in a chord. */
export function roleOf(iv: number, c: BeatChord): Role {
  if (iv === 0) return "root";
  const t = c.tones.indexOf(iv);
  if (t === 1) return "3rd";
  if (t === 2) return "5th";
  if (t === 3) return "7th";
  if ((c.scaleMask >> iv) & 1) return iv <= 3 ? "9th" : iv <= 6 ? "11th" : "13th";
  return "chromatic";
}

/** The intervals that play a role in a chord. */
function intervalsFor(role: Role, c: BeatChord): number[] {
  const out: number[] = [];
  for (let iv = 0; iv < 12; iv++) if (roleOf(iv, c) === role) out.push(iv);
  return out;
}

/** The shape of a line through one chord, not counting the approach into the next. */
export type Motif = "arpUp" | "arpDown" | "scaleUp" | "scaleDown" | "turnUp" | "turnDown" | "pair";
const MOTIFS: Motif[] = ["arpUp", "arpDown", "scaleUp", "scaleDown", "turnUp", "turnDown", "pair"];
export const MOTIF_NAMES: Record<Motif, string> = {
  arpUp: "arpeggio up",
  arpDown: "arpeggio down",
  scaleUp: "scale run up",
  scaleDown: "scale run down",
  turnUp: "up and back",
  turnDown: "down and back",
  pair: "repeated pairs",
};

/** The motif of a line through a chord, from the moves between its on-beat notes. */
function motifOf(moves: number[]): Motif {
  if (moves.some((d) => d === 0)) return "pair";
  const up = moves.every((d) => d > 0);
  const down = moves.every((d) => d < 0);
  if (up || down) return moves.some((d) => Math.abs(d) >= 3) ? (up ? "arpUp" : "arpDown") : up ? "scaleUp" : "scaleDown";
  return moves[0] > 0 ? "turnUp" : "turnDown";
}

export type StyleModel = {
  name: string;
  transcriptions: number;
  bars: number;
  /** Role counts on a chord change's first beat. */
  landing: Record<Role, number>;
  /** Role counts on each beat of the bar (not counting chord-change downbeats). */
  beat: Record<Role, number>[];
  /** Melodic motion between consecutive notes: index = semitones + 12. */
  motion: number[];
  /** Last note before a change → the change's first note: index = semitones + 7. */
  approach: number[];
  /** Per beat of the bar: share of beats with an eighth-note figure / a triplet skip. */
  eighths: number[];
  triplets: number[];
  /** Share of notes that are ghost notes. */
  ghosts: number;
  median: number;
  /** How they move through a chord: counts of each motif, by how many beats the chord lasts. */
  motifs: Record<2 | 3 | 4, Record<Motif, number>>;
  /** Their working range (10th and 90th percentile notes). */
  low: number;
  high: number;
  /** Shapes of every bar and pair of bars of the transcriptions (rhythm + intervals, any key), so
      the generator can avoid reproducing any. */
  quotes: Set<string>;
};

const emptyRoles = (prior = 0): Record<Role, number> => Object.fromEntries(ROLES.map((r) => [r, prior])) as Record<Role, number>;

/** Measures a player's habits from their transcriptions. */
export function learnModel(name: string, transcriptions: Transcription[]): StyleModel {
  // Small priors, like a textbook walking line, so sparse data still gives sensible odds.
  const landing = { ...emptyRoles(0.2), root: 2, "3rd": 0.6, "5th": 0.6 };
  const beat = [0, 1, 2, 3].map(() => ({ ...emptyRoles(0.2), root: 0.6, "3rd": 0.6, "5th": 0.6, "7th": 0.4, "9th": 0.4 }));
  const motion = Array.from({ length: 25 }, (_, i) => (Math.abs(i - 12) <= 2 && i !== 12 ? 0.6 : 0.1));
  const approach = Array.from({ length: 15 }, (_, i) => (Math.abs(i - 7) === 1 ? 0.8 : Math.abs(i - 7) === 2 ? 0.4 : 0.1));
  const beatsSeen = [0, 0, 0, 0];
  const eighthCount = [0, 0, 0, 0];
  const tripletCount = [0, 0, 0, 0];
  // Motifs, with a light textbook prior (mostly stepwise and arpeggio lines, both directions).
  const motifs: Record<2 | 3 | 4, Record<Motif, number>> = {
    2: { arpUp: 0.3, arpDown: 0.3, scaleUp: 0.4, scaleDown: 0.4, turnUp: 0.1, turnDown: 0.1, pair: 0.05 },
    3: { arpUp: 0.3, arpDown: 0.3, scaleUp: 0.4, scaleDown: 0.4, turnUp: 0.2, turnDown: 0.2, pair: 0.05 },
    4: { arpUp: 0.3, arpDown: 0.3, scaleUp: 0.4, scaleDown: 0.4, turnUp: 0.2, turnDown: 0.2, pair: 0.05 },
  };
  let ghosts = 0;
  let notesTotal = 0;
  let bars = 0;
  let used = 0;
  const pitches: number[] = [];
  const quotes = new Set<string>();

  for (const t of transcriptions) {
    if (measureCapacity(t) !== 4 * TICKS_PER_QUARTER) continue;
    used++;
    bars += t.measures.length;
    const chords = transcriptionBeats(t);
    const notes = timeline(t)
      .filter((n) => n.midi !== null)
      .map((n) => ({ start: n.start / TICKS_PER_QUARTER, length: n.ticks / TICKS_PER_QUARTER, midi: n.midi as number, ghost: n.ghost }));
    const pitched = notes.filter((n) => !n.ghost);
    notesTotal += notes.length;
    ghosts += notes.length - pitched.length;
    for (const n of pitched) pitches.push(n.midi);
    const onsetsIn = (k: number) => notes.filter((n) => n.start >= k - 1e-6 && n.start < k + 1 - 1e-6);

    for (let k = 0; k < chords.length; k++) {
      const pos = k % 4;
      beatsSeen[pos]++;
      const on = onsetsIn(k);
      const offs = on.map((n) => Math.round((n.start - k) * 12));
      if (offs.some((o) => o === 6)) eighthCount[pos]++;
      if (offs.some((o) => o === 4 || o === 8)) tripletCount[pos]++;
    }
    // Bars whose on-beat notes mostly don't fit the written chord have a misplaced chord symbol —
    // they'd teach the wrong habits, so they're left out of the harmonic counts.
    const reliable = new Set<number>();
    for (let m = 0; m < t.measures.length; m++) {
      const on = pitched.filter((n) => n.start >= m * 4 - 1e-6 && n.start < m * 4 + 4 - 1e-6 && Math.abs(n.start - Math.round(n.start)) < 1e-6);
      const fits = on.filter((n) => {
        const c = chords[Math.round(n.start)];
        return c && (c.toneMask | 1) >> ((((n.midi - c.root) % 12) + 12) % 12) & 1;
      }).length;
      if (on.length && fits / on.length >= 0.5) reliable.add(m);
    }
    // Motifs: each chord span inside a bar, from the notes on its beats.
    const onBeat = new Map<number, number>();
    for (const n of pitched) if (Math.abs(n.start - Math.round(n.start)) < 1e-6) onBeat.set(Math.round(n.start), n.midi);
    for (let k = 0; k < chords.length; k++) {
      const c = chords[k];
      if (!c || !(k % 4 === 0 || chords[k - 1]?.key !== c.key) || !reliable.has(Math.floor(k / 4))) continue;
      let e = k + 1;
      while (e < chords.length && e % 4 !== 0 && chords[e]?.key === c.key) e++;
      const len = e - k;
      if (len < 2 || len > 4) continue;
      const seq: number[] = [];
      for (let q = k; q < e; q++) {
        const m = onBeat.get(q);
        if (m === undefined) break;
        seq.push(m);
      }
      if (seq.length !== len) continue;
      // The motif is the shape before the last beat (that one leads into the next chord).
      const moves = seq.slice(1, Math.max(2, len - 1)).map((m, i) => m - seq[i]);
      motifs[len as 2 | 3 | 4][motifOf(len === 2 ? [seq[1] - seq[0]] : moves)]++;
    }
    for (let i = 0; i < pitched.length; i++) {
      const n = pitched[i];
      const k = Math.floor(n.start + 1e-6);
      const c = chords[k];
      if (!c || Math.abs(n.start - k) > 1e-6 || !reliable.has(Math.floor(k / 4))) continue;
      const role = roleOf((((n.midi - c.root) % 12) + 12) % 12, c);
      const change = k === 0 || chords[k - 1]?.key !== c.key;
      if (change) landing[role]++;
      else beat[k % 4][role]++;
      const p = pitched[i - 1];
      if (p) {
        const d = n.midi - p.midi;
        if (Math.abs(d) <= 12) motion[d + 12]++;
        if (change && Math.abs(d) <= 7 && n.start - p.start <= 1.01) approach[d + 7]++;
      }
    }
    // Two-bar fingerprints.
    // A bar's shape: where each note starts and the interval from the note before — the same in
    // any key, whatever the chord symbols say.
    const barPrint = (m: number) => {
      const inBar = pitched.filter((n) => n.start >= m * 4 - 1e-6 && n.start < m * 4 + 4 - 1e-6);
      return inBar.map((n, i) => `${Math.round((n.start - m * 4) * 12)}:${i ? n.midi - inBar[i - 1].midi : "s"}`).join(",");
    };
    for (let m = 0; m < t.measures.length; m++) {
      const one = barPrint(m);
      if (one.split(",").length >= 3) quotes.add(one); // a bar of three notes or more
      if (m + 1 < t.measures.length) quotes.add(`${one}|${barPrint(m + 1)}`);
    }
  }
  pitches.sort((a, b) => a - b);
  // A chromatic note on a new chord's downbeat is rare on purpose — and loose chord symbols in a
  // transcription (a chord in the wrong bar) inflate it — so it's capped at 4%.
  const landTotal = ROLES.reduce((sum, r) => sum + landing[r], 0);
  landing.chromatic = Math.min(landing.chromatic, (landTotal - landing.chromatic) * 0.04);
  return {
    name,
    transcriptions: used,
    bars,
    landing,
    beat,
    motion,
    approach,
    eighths: eighthCount.map((c, i) => (beatsSeen[i] ? c / beatsSeen[i] : 0.03)),
    triplets: tripletCount.map((c, i) => (beatsSeen[i] ? c / beatsSeen[i] : 0.02)),
    ghosts: notesTotal ? ghosts / notesTotal : 0.02,
    median: pitches.length ? pitches[pitches.length >> 1] : 38,
    quotes,
    motifs,
    low: pitches.length ? pitches[Math.floor(pitches.length * 0.1)] : 31,
    high: pitches.length ? pitches[Math.floor(pitches.length * 0.9)] : 48,
  };
}

const roleName = (r: Role) => (r === "chromatic" ? "a chromatic note" : `the ${r}`);
const share = (rec: Record<Role, number>, role: Role) => rec[role] / ROLES.reduce((s, r) => s + rec[r], 0);

/** Picks one of `items` with probability ∝ weight^(1/temperature). */
function sample<T>(rng: Rng, items: [T, number][], temperature = 0.8): T {
  const w = items.map(([, x]) => Math.pow(Math.max(x, 0), 1 / temperature));
  const total = w.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[0][0];
  let r = rng.next() * total;
  for (let i = 0; i < items.length; i++) {
    r -= w[i];
    if (r <= 0) return items[i][0];
  }
  return items[items.length - 1][0];
}

/** One chorus of a new line in the player's style (same shape as `generateChorus`). */
export function generateLearnedChorus(
  song: IRealSong,
  options: BassLineOptions,
  model: StyleModel,
  state: BassLineState,
  chorus: number,
  startBeat: number,
  isLast: boolean,
  harmony: BarHarmony[] = chartHarmony(song),
): { chorus: BassChorus; state: BassLineState } {
  const rng = makeRng(state.seed ^ 0x2c1b3c6d);
  const { beats } = performedBeats(song, harmony, chorus, isLast);
  const chords = beats.map((b) => chordOfHarmony(b.harmony));
  const N = beats.length;
  const low = BASS_LOW;
  const high = Math.max(BASS_HIGH, Math.min(60, model.median + 14));
  const base = TOUCH_VELOCITY[options.touch];
  const vel = (accent: number) => Math.max(0.05, Math.min(1, base + accent + (rng.next() - 0.5) * 0.08));
  let goal = state.lastNote === null ? model.median : state.registerGoal;
  let prev: number | null = state.lastNote;
  const isChange = (b: number) => !!chords[b] && (b === 0 || chords[b - 1]?.key !== chords[b]!.key);

  /** Places a landing note: one of the player's landing roles, near the line and their register. */
  const land = (b: number, from: number | null): number => {
    const c = chords[b]!;
    const role = sample(rng, ROLES.map((r) => [r, model.landing[r]] as [Role, number]));
    const ivs = intervalsFor(role, c);
    const options: [number, number][] = [];
    for (let m = low; m <= high; m++) {
      if (!ivs.includes((((m - c.root) % 12) + 12) % 12)) continue;
      const leap = from === null ? 0 : Math.abs(m - from);
      options.push([m, Math.exp(-leap / 4) * Math.exp(-Math.abs(m - goal) / 9)]);
    }
    if (!options.length) return c.root + 36 >= low ? c.root + 36 : c.root + 48;
    return sample(rng, options, 0.6);
  };

  /** The chord tones / scale notes of the chord at beat `b`, as MIDI notes in range. */
  const pool = (b: number, kind: "tones" | "scale"): number[] => {
    const c = chords[b];
    if (!c) return [];
    const mask = kind === "tones" ? c.toneMask | 1 : c.scaleMask | c.toneMask | 1;
    const out: number[] = [];
    for (let m = low; m <= high; m++) if ((mask >> ((((m - c.root) % 12) + 12) % 12)) & 1) out.push(m);
    return out;
  };
  const stepFrom = (b: number, from: number, dir: 1 | -1, kind: "tones" | "scale"): number => {
    const options = pool(b, kind).filter((m) => (dir > 0 ? m > from : m < from));
    if (!options.length) return from - dir * 2; // at the edge of the range: turn around
    return dir > 0 ? options[0] : options[options.length - 1];
  };

  /** The approach into `target` from `from`: one of the player's ways in, close to where the line is. */
  const approachNote = (from: number, target: number): number => {
    const options: [number, number][] = [];
    for (let d = -7; d <= 7; d++) {
      if (d === 0) continue;
      const m = target - d;
      if (m < low || m > high) continue;
      const smooth = Math.exp(-Math.max(0, Math.abs(m - from) - 2) / 2.5);
      options.push([m, model.approach[d + 7] * smooth * (m === from ? 0.2 : 1)]);
    }
    return options.length ? sample(rng, options, 0.6) : target - 1;
  };

  /**
   * One chord's beats [s, e): the landing note, a motif of the player's (heading toward the next
   * landing and the phrase's goal), and — if a chord follows — their approach into it.
   */
  const realise = (s: number, e: number, landing: number, target: number | null) => {
    const len = e - s;
    line[s] = landing;
    if (len === 1) return;
    const key = Math.min(4, Math.max(2, len)) as 2 | 3 | 4;
    // Which way to go: toward the next landing if it's far, else toward the phrase's goal.
    const aim = target !== null && Math.abs(target - landing) > 5 ? target : goal;
    const upWeight = aim > landing + 2 ? 3 : aim < landing - 2 ? 1 / 3 : 1;
    const motif = sample(
      rng,
      MOTIFS.map((m) => [m, model.motifs[key][m] * (m.endsWith("Up") ? upWeight : m.endsWith("Down") ? 1 / upWeight : 0.5)] as [Motif, number]),
      0.7,
    );
    const inner = target !== null ? len - 2 : len - 1; // beats after the landing, before the approach
    let cur = landing;
    for (let q = 1; q <= inner; q++) {
      const b = s + q;
      let next: number;
      switch (motif) {
        case "arpUp":
          next = stepFrom(b, cur, 1, "tones");
          break;
        case "arpDown":
          next = stepFrom(b, cur, -1, "tones");
          break;
        case "scaleUp":
          next = stepFrom(b, cur, 1, "scale");
          break;
        case "scaleDown":
          next = stepFrom(b, cur, -1, "scale");
          break;
        case "turnUp":
          next = q === 1 ? stepFrom(b, cur, 1, "tones") : stepFrom(b, cur, -1, "scale");
          break;
        case "turnDown":
          next = q === 1 ? stepFrom(b, cur, -1, "tones") : stepFrom(b, cur, 1, "scale");
          break;
        default:
          next = q % 2 === 1 ? cur : stepFrom(b, cur, aim >= cur ? 1 : -1, "tones");
      }
      // The strong beat of a 4-beat chord (beat 3) wants a chord tone.
      if (beats[b].beatInBar === 2) {
        const tones = pool(b, "tones");
        if (tones.length && !tones.includes(next)) next = tones.reduce((best, m) => (Math.abs(m - next) < Math.abs(best - next) ? m : best), tones[0]);
      }
      line[b] = next;
      cur = next;
    }
    if (target !== null) line[e - 1] = approachNote(cur, target);
  };

  // Phrases in arcs: every two bars the line heads somewhere else in the player's range — up, then
  // back down — so it rises and falls instead of wandering.
  const arcLow = Math.max(low + 2, model.low);
  const arcHigh = Math.min(high - 2, Math.max(model.high, arcLow + 7));
  let rising = (state.lastNote ?? model.median) < (arcLow + arcHigh) / 2;

  // Bar by bar: every chord's landing (planned a chord ahead so the line can lead into it), its
  // motif and approach — rewriting a bar whose shape matches one of the player's bars.
  const line: (number | null)[] = new Array(N).fill(null);
  const barStarts: number[] = [];
  beats.forEach((b, i) => (b.beatInBar === 0 || i === 0) && barStarts.push(i));
  barStarts.push(N);
  const fingerprint = (from: number, to: number) => {
    const out: string[] = [];
    let last: number | null = null;
    for (let b = from; b < to; b++) {
      const m = line[b];
      if (m === null) continue;
      out.push(`${(b - from) * 12}:${last === null ? "s" : m - last}`);
      last = m;
    }
    return out.join(",");
  };
  let rewrites = 0;
  const planned = new Map<number, number>();
  for (let bi = 0; bi + 1 < barStarts.length; bi++) {
    const a = barStarts[bi];
    const z = barStarts[bi + 1];
    if (bi % 2 === 0) {
      goal = rising ? arcHigh - Math.round(rng.next() * 3) : arcLow + Math.round(rng.next() * 3);
      rising = !rising;
    }
    const cuts = [a];
    for (let b = a + 1; b < z; b++) if (isChange(b)) cuts.push(b);
    cuts.push(z);
    for (let attempt = 0; attempt < 8; attempt++) {
      let p = prev;
      for (let ci = 0; ci + 1 < cuts.length; ci++) {
        const s0 = cuts[ci];
        const e0 = cuts[ci + 1];
        if (!chords[s0]) {
          for (let b = s0; b < e0; b++) line[b] = null;
          continue;
        }
        const landing = planned.get(s0) ?? land(s0, p);
        planned.delete(s0);
        let target: number | null = null;
        if (e0 < N && chords[e0]) {
          target = land(e0, landing);
          planned.set(e0, target);
        }
        realise(s0, e0, landing, target);
        p = line[e0 - 1] ?? landing;
      }
      const thisBar = fingerprint(a, z);
      const prevBar = bi > 0 ? fingerprint(barStarts[bi - 1], a) : null;
      if (!model.quotes.has(thisBar) && (prevBar === null || !model.quotes.has(`${prevBar}|${thisBar}`))) break;
      rewrites++;
    }
    for (let b = z - 1; b >= a; b--)
      if (line[b] !== null) {
        prev = line[b];
        break;
      }
  }

  // Notes, with the player's rhythmic figures.
  const notes: BassNote[] = [];
  for (let b = 0; b < N; b++) {
    const m = line[b];
    if (m === null) continue;
    const pos = beats[b].beatInBar % 4;
    const next = b + 1 < N ? line[b + 1] : null;
    const at = startBeat + b;
    const lastBeat = isLast && b === N - 1;
    if (lastBeat) {
      notes.push({ beat: at, length: 4, midi: m, velocity: vel(0.04) });
      continue;
    }
    const roll = rng.next();
    if (next !== null && roll < model.triplets[pos]) {
      notes.push({ beat: at, length: 2 / 3, midi: m, velocity: vel(pos === 0 ? 0.05 : 0) });
      notes.push({ beat: at + 2 / 3, length: 1 / 3, midi: m, velocity: vel(-0.35), ghost: true });
    } else if (next !== null && roll < model.triplets[pos] + model.eighths[pos]) {
      // An eighth-note figure: a passing note toward the next beat, or a ghosted repeat.
      const d = next - m;
      const passing = Math.abs(d) >= 2 ? m + Math.sign(d) * (Math.abs(d) >= 3 ? 2 : 1) : null;
      notes.push({ beat: at, length: 0.5, midi: m, velocity: vel(pos === 0 ? 0.05 : 0) });
      if (passing !== null && rng.next() > model.ghosts * 3) notes.push({ beat: at + 0.5, length: 0.5, midi: passing, velocity: vel(-0.08) });
      else notes.push({ beat: at + 0.5, length: 0.5, midi: m, velocity: vel(-0.3), ghost: true });
    } else notes.push({ beat: at, length: 1, midi: m, velocity: vel(pos === 0 ? 0.05 : 0) });
  }

  // Phrases, each with what it did and the habits behind it.
  const phrases: BassPhrase[] = phraseCuts(beats, 0, N).map(([k0, k1]) => {
    let changes = 0;
    const landed = emptyRoles();
    const approaches: Record<string, number> = {};
    let figures = 0;
    for (let b = k0; b < k1; b++) {
      const m = line[b];
      const c = chords[b];
      if (m === null || !c) continue;
      if (isChange(b)) {
        changes++;
        landed[roleOf((((m - c.root) % 12) + 12) % 12, c)]++;
        const p = b > 0 ? line[b - 1] : null;
        if (p !== null) {
          const d = m - p;
          const name = d === 1 ? "a half step below" : d === -1 ? "a half step above" : d === 2 ? "a whole step below" : d === -2 ? "a whole step above" : Math.abs(d) === 5 || Math.abs(d) === 7 ? "a 4th or 5th away" : d === 0 ? "the same note" : "a leap";
          approaches[name] = (approaches[name] ?? 0) + 1;
        }
      }
    }
    for (const n of notes) if (n.beat >= startBeat + k0 && n.beat < startBeat + k1 && Math.abs(n.beat - Math.round(n.beat)) > 1e-6) figures++;
    const topLanding = ROLES.filter((r) => landed[r] > 0).sort((a, b) => landed[b] - landed[a]);
    const playerLanding = ROLES.slice().sort((a, b) => model.landing[b] - model.landing[a]).slice(0, 3);
    const pct = (x: number) => `${Math.round(x * 100)}%`;
    const points: string[] = [];
    if (changes)
      points.push(
        `Lands on ${topLanding.map((r) => `${roleName(r)} ×${landed[r]}`).join(", ")} at ${changes} chord change${changes === 1 ? "" : "s"} — ${model.name} lands on ${playerLanding.map((r) => `${roleName(r)} ${pct(share(model.landing, r))}`).join(", ")}.`,
      );
    const appr = Object.entries(approaches).sort((a, b) => b[1] - a[1]);
    if (appr.length) {
      const fav = model.approach.map((v, i) => [i - 7, v] as [number, number]).sort((a, b) => b[1] - a[1])[0][0];
      const favName = fav === 1 ? "a half step below" : fav === -1 ? "a half step above" : fav === 2 ? "a whole step below" : fav === -2 ? "a whole step above" : `${Math.abs(fav)} semitones ${fav > 0 ? "below" : "above"}`;
      points.push(`Leads into chords from ${appr.map(([n, c]) => `${n} ×${c}`).join(", ")} — ${model.name}'s most common way in is from ${favName}.`);
    }
    const fav = MOTIFS.slice().sort((x, y) => model.motifs[4][y] - model.motifs[4][x]).slice(0, 2);
    points.push(
      `Through each chord: ${model.name}'s shapes — ${fav.map((m) => MOTIF_NAMES[m]).join(" and ")} most — heading up or down so the line rises and falls in two-bar arcs, with a chord tone on beat 3.`,
    );
    if (figures) points.push(`${figures} eighth-note or triplet figure${figures === 1 ? "" : "s"} — ${model.name} adds one on about ${pct((model.eighths.reduce((a, b) => a + b, 0) + model.triplets.reduce((a, b) => a + b, 0)) / 4)} of beats.`);
    points.push(`Written new — not copied from any transcription${rewrites ? "; bars that came out matching two of theirs were rewritten" : ""}.`);
    return { beat: startBeat + k0, length: k1 - k0, chartChords: "", source: null, leadIn: false, learned: { player: model.name, points } };
  });
  // The chart's chords on each phrase, bar by bar.
  for (const ph of phrases) {
    const k0 = ph.beat - startBeat;
    const bars: string[][] = [];
    for (let k = k0; k < k0 + ph.length; k++) {
      if (k === k0 || beats[k].beatInBar === 0) bars.push([]);
      const c = chords[k];
      if (k === k0 || beats[k].beatInBar === 0 || c?.key !== chords[k - 1]?.key) bars[bars.length - 1].push(c ? c.key : "N.C.");
    }
    ph.chartChords = bars.map((b) => b.join(" ")).join(" | ");
  }

  for (const b of beats) (b as PerformedBeat).from = undefined;
  const lastNote = [...notes].reverse().find((n) => !n.ghost)?.midi ?? prev;
  return {
    chorus: { notes, beats, phrases },
    state: { ...state, lastNote, registerGoal: goal, seed: rng.seed() },
  };
}
