import { makeRng, type PerformedBeat } from "./bassLine";
import { chordOfHarmony, type BeatChord } from "./bassStyle";

// Chords under the bass: a piano or Rhodes playing the changes the way a jazz pianist does with a
// bass player. Each chord is struck once and held until the next one — on the beat, or (in the
// varied style) sometimes pushed early onto the "and" before it or laid back to the "and" after,
// with long chords struck again partway through. Voicings are rootless (the bass has the root):
// the chord's 3rd, 7th and colour notes, tried in every inversion and as drop-2 spreads, and the
// one that moves least from the last chord wins — keeping common tones, the top note moving by
// step like a melody, nothing muddy low down.

/** "comp": held chords with pushes and laid-back hits; "sustain": held chords, always on the beat. */
export type CompStyle = "comp" | "sustain";

export type CompEvent = {
  /** Start, in performance beats, and length in beats (both swung by the player). */
  beat: number;
  length: number;
  midis: number[];
  /** 0–1. */
  velocity: number;
};

const BOTTOM_LOW = 50; // D3 — a voicing's lowest note stays between here and BOTTOM_HIGH,
const BOTTOM_HIGH = 60; // C4   clear of the walking bass below
const TOP_HIGH = 74; // D5

/** The four notes of a rootless voicing as pitch classes, in "A" order — 3rd, 5th (13th on a
    dominant, ♭13 where the scale has it), 7th (or 6th), 9th (as the scale allows). */
function voicingTones(c: BeatChord): number[] {
  const has = (iv: number) => ((c.scaleMask | c.toneMask) >> iv) & 1;
  const third = c.tones[1] ?? 4;
  const fifth = c.tones[2] ?? 7;
  const seventh = c.tones[3] ?? (has(9) ? 9 : has(11) ? 11 : 10);
  if (c.cls === "dim" || c.cls === "hdim") return [third, fifth, seventh, 12].map((iv) => (c.root + iv) % 12);
  const ninth = has(2) ? 2 : has(1) ? 1 : has(3) && third !== 3 ? 3 : 2;
  let colour = fifth;
  if (c.cls === "dom" && fifth === 7 && has(9)) colour = 9; // 13th on an unaltered dominant
  else if (c.cls === "dom" && has(8)) colour = 8; // ♭13
  return [third, colour, seventh, ninth].map((iv) => (c.root + iv) % 12);
}

/** The voicing's A and B forms (A: 3-5-7-9 from the 3rd up; B: 7-9-3-5 from the 7th up) in close
    position and as drop-2 spreads — always a guide tone (3rd or 7th) at the bottom, the way a
    pianist's left hand voices them — at every height in range. */
function candidates(c: BeatChord): number[][] {
  const [third, colour, seventh, ninth] = voicingTones(c);
  const forms = [
    [third, colour, seventh, ninth],
    [seventh, ninth, third, colour],
  ];
  const out: number[][] = [];
  for (const order of forms)
    for (let base = BOTTOM_LOW - 12; base <= BOTTOM_HIGH; base++) {
      if (base % 12 !== order[0]) continue;
      const close = [base];
      for (const pc of order.slice(1)) {
        let m = close[close.length - 1] + 1;
        while (m % 12 !== pc) m++;
        close.push(m);
      }
      // Drop 2: the second note from the top goes down an octave (its bottom is then the other
      // guide tone).
      const drop = [...close];
      drop[2] -= 12;
      drop.sort((x, y) => x - y);
      for (const v of [close, drop]) if (v[0] >= BOTTOM_LOW && v[0] <= BOTTOM_HIGH && v[3] <= TOP_HIGH) out.push(v);
    }
  return out.filter((v) => !muddy(v));
}

/** Close intervals low down sound muddy (a 2nd or 3rd below about E3/G3). */
function muddy(v: number[]): boolean {
  for (let i = 1; i < v.length; i++) {
    const gap = v[i] - v[i - 1];
    if (v[i - 1] < 52 && gap < 3) return true;
    if (v[i - 1] < 48 && gap < 5) return true;
  }
  return false;
}

/** The voicing of `c` that leads best from `prev`: least total movement, common tones held, the
    top note moving by step, staying around the middle of the range. */
export function voiceChord(c: BeatChord, prev: number[] | null, rng?: () => number): number[] {
  const options = candidates(c);
  if (!options.length) return [c.root + 48, c.root + 52, c.root + 58].map((m) => m);
  const centre = 60;
  const cost = (v: number[]) => {
    const mid = v.reduce((a, b) => a + b, 0) / v.length;
    let k = Math.abs(mid - centre) * 0.25;
    if (prev) {
      // Each voice to the nearest note of the last chord.
      for (const m of v) k += Math.min(...prev.map((p) => Math.abs(p - m)));
      const topMove = Math.abs(v[v.length - 1] - prev[prev.length - 1]);
      k += topMove === 0 ? 0.5 : topMove <= 2 ? 0 : topMove * 0.6; // a melodic top line
      if (v.every((m, i) => m - prev[i] === v[0] - prev[0]) && v[0] !== prev[0]) k += 3; // all parallel: lifeless
    }
    return k + (rng ? rng() * 1.2 : 0);
  };
  return options.reduce((best, v) => (cost(v) < cost(best) ? v : best));
}

/** The chords for one chorus (`beats` as performed, starting at performance beat `startBeat`). */
export function compChorus(beats: PerformedBeat[], startBeat: number, style: CompStyle, seed: number, prevVoicing: number[] | null): { events: CompEvent[]; last: number[] | null } {
  const rng = makeRng(seed);
  const chords = beats.map((b) => chordOfHarmony(b.harmony));
  // Chord spans: one per change (a chord held over the bar line is one span).
  type Span = { b: number; len: number; c: BeatChord };
  const spans: Span[] = [];
  for (let b = 0; b < beats.length; b++) {
    const c = chords[b];
    if (!c) continue;
    const last = spans[spans.length - 1];
    if (last && last.b + last.len === b && last.c.key === c.key) last.len++;
    else spans.push({ b, len: 1, c });
  }

  // Where each span's chord is struck (beats from its downbeat): on it, pushed onto the "and"
  // before, or laid back to the "and" after.
  const onsets = spans.map((sp, i) => {
    if (style === "sustain") return 0;
    const before = spans[i - 1];
    const r = rng.next();
    if (i > 0 && before && before.b + before.len === sp.b && before.len >= 2 && r < 0.15) return -0.5;
    if (sp.len >= 2 && r > 0.9) return 0.5;
    if (sp.len >= 4 && r > 0.975) return 1;
    return 0;
  });

  const events: CompEvent[] = [];
  let prev = prevVoicing;
  const vel = (accent = 0) => Math.max(0.15, Math.min(0.9, 0.4 + accent + (rng.next() - 0.5) * 0.1));
  spans.forEach((sp, i) => {
    const start = sp.b + onsets[i];
    const next = spans[i + 1];
    // Until the next chord comes in (or the end of this one).
    const end = next && next.b === sp.b + sp.len ? next.b + onsets[i + 1] : sp.b + sp.len;
    const v = voiceChord(sp.c, prev, style === "comp" ? () => rng.next() : undefined);
    prev = v;
    const accent = onsets[i] !== 0 ? 0.06 : 0.02;
    if (style === "sustain") {
      events.push({ beat: startBeat + start, length: Math.max(0.25, end - start - 0.06), midis: v, velocity: vel(accent) });
      return;
    }
    // A comping figure for the chord, by how long it lasts — held, half-held with space after, a
    // short stab, a Charleston (stab, then the "and" of 2), or two hits — so the chords breathe.
    const full = end - start;
    // A long chord gets struck again about a bar in: the first figure stops before that.
    const again = full >= 7 ? 4 - (rng.next() < 0.5 ? 0 : 0.5) : null;
    const room = again ?? full;
    const hit = (o: number, len: number, a = 0) => {
      const l = Math.min(len, room - o - 0.08);
      if (o < room - 0.2 && l >= 0.2) events.push({ beat: startBeat + start + o, length: l, midis: v, velocity: vel(accent + a) });
    };
    // A chord lasting a bar or more mostly rings: held, or figures whose last hit rings on; stabs
    // are kept for the quicker changes.
    const long = full >= 4;
    const figures: [string, number][] = long
      ? [
          ["hold", 0.5],
          ["half", 0.22],
          ["stab", 0.03],
          ["charleston", 0.15],
          ["twoHits", 0.1],
        ]
      : [
          ["hold", 0.22],
          ["half", 0.24],
          ["stab", 0.2],
          ["charleston", room >= 2.5 ? 0.18 : 0],
          ["twoHits", room >= 3.5 ? 0.16 : 0],
        ];
    const total = figures.reduce((t, [, w]) => t + w, 0);
    let r = rng.next() * total;
    const figure = figures.find(([, w]) => (r -= w) <= 0)?.[0] ?? "half";
    const stab = 0.4 + rng.next() * 0.25;
    switch (figure) {
      case "hold":
        hit(0, room - 0.06);
        break;
      case "half":
        hit(0, long ? Math.max(2, room * (0.55 + rng.next() * 0.25)) : Math.max(0.8, Math.min(2, room / 2)));
        break;
      case "stab":
        hit(0, stab, 0.04);
        break;
      case "charleston":
        hit(0, long ? 0.9 : stab, 0.04);
        hit(1.5, long ? room - 1.5 - 0.06 : Math.min(1.5, room - 1.5) * (0.6 + rng.next() * 0.3), -0.02);
        break;
      default: {
        hit(0, long ? 1.4 : stab, 0.04);
        const o = rng.next() < 0.5 ? 2.5 : 3;
        hit(o, long ? room - o - 0.06 : 0.5 + rng.next() * 0.5, -0.02);
      }
    }
    if (again !== null) {
      const v2 = voiceChord(sp.c, v, () => rng.next() * 2);
      prev = v2;
      const rest = full - again - 0.08;
      events.push({ beat: startBeat + start + again, length: rng.next() < 0.25 ? Math.min(2, rest) : rest, midis: v2, velocity: vel(-0.02) });
    }
  });
  return { events, last: prev };
}
