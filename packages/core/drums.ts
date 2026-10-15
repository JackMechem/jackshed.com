import { makeRng, type PerformedBeat } from "./bassLine";

// A jazz drummer under Bass Genius, swinging. Pure pattern writing — the web engine schedules the
// hits on its swung clock and plays them on the sampled kit (Virtuosity Drums, played with sticks).
// Everything a player might want to tune is in `DrumConfig` (the "Drum settings" dialog).
//
// The ride keeps time — mostly "spang, spang-a-lang", now and then plain quarters or
// "spang-a-lang-a-lang-spang", a figure often kept for two bars — its skip notes swung hard and
// drifting the way a drummer's do (the engine places them; see `skip` / `swing`), each figure
// falling away in level (spang > a > lang, the a and lang laid back a hair), swelling and easing
// over 4-bar phrases; hi-hat foot on 2 and 4; the bass drum feathered under every beat. With
// `comping`: snare chatter on the swung "and"s, a setup on the last "and" before each section, and
// the ride crashed (plus a little crash cymbal and a kick) on each section's downbeat.

export type DrumKit = "sticks";
export type DrumVoice = "ride" | "bell" | "pedal" | "kick" | "snare" | "crash" | "stir" | "tap";

export type DrumHit = {
  /** Performance beats. For a skip note (`skip`), the whole beat it belongs to — the engine places
      it at its swing point, plus `swing`. */
  beat: number;
  voice: DrumVoice;
  /** 0–1. */
  velocity: number;
  /** For sweeps: how long it lasts, in beats. */
  length?: number;
  /** A swung skip note (the "and"), placed by the engine at the drummer's swing for the tempo. */
  skip?: boolean;
  /** How much later (+) or earlier (−) than that swing point this one falls, in beats. */
  swing?: number;
  /** Which recording to use, as a velocity (defaults to `velocity`): lets two hits share a tone
      while their levels differ — the "a" and "lang" of a spang-a-lang. */
  tone?: number;
  /** Laid back: played this many seconds behind where it falls. */
  late?: number;
};

/** Everything about how the drummer plays. Levels are 0–1 (how hard), times as noted. */
export type DrumConfig = {
  // Swing (the engine reads these live)
  /** Where the ride's skip note falls at medium tempos, as a fraction of the beat (0.5 straight,
      0.67 a triplet). */
  swing: number;
  /** Whether the swing evens out as the tempo gets fast, the way drummers' does. */
  swingEases: boolean;
  /** How far the swing wanders from bar to bar (fraction of a beat). */
  swingDrift: number;
  /** Note-to-note swing variation (fraction of a beat). */
  swingJitter: number;
  /** How far the "a" and "lang" sit behind the time, in milliseconds. */
  layBackMs: number;
  /** Timing looseness, ± milliseconds, shared by everything struck together. */
  timingMs: number;
  // Ride figures (relative weights)
  figSpangALang: number;
  figQuarters: number;
  figALangALang: number;
  /** Chance a figure is kept for the next bar. */
  keepFigure: number;
  // Ride dynamics
  spang: number;
  a: number;
  lang: number;
  /** Plain quarter notes on 2 and 4, and on 1 and 3. */
  quarterBack: number;
  quarterOther: number;
  /** How much the ride swells and eases over a 4-bar phrase (level). */
  phraseSwell: number;
  /** Random level variation on each hit. */
  levelJitter: number;
  // Hi-hat and kick
  hihat: boolean;
  hihatLevel: number;
  kick: boolean;
  kickLevel: number;
  // Comping (when "With comping" is on)
  /** Snare hits per bar, on average. */
  snareDensity: number;
  ghostLevel: number;
  /** Chance a snare hit is a firm accent rather than a ghost note. */
  accentChance: number;
  accentLevel: number;
  setups: boolean;
  setupLevel: number;
  sectionCrashes: boolean;
  rideCrashLevel: number;
  crashLevel: number;
  /** Chance per bar of a lone kick "bomb". */
  bombChance: number;
};

export const DEFAULT_DRUM_CONFIG: DrumConfig = {
  swing: 0.69,
  swingEases: true,
  swingDrift: 0.06,
  swingJitter: 0.03,
  layBackMs: 15,
  timingMs: 5,
  figSpangALang: 0.88,
  figQuarters: 0.05,
  figALangALang: 0.07,
  keepFigure: 0.45,
  spang: 0.64,
  a: 0.38,
  lang: 0.35,
  quarterBack: 0.56,
  quarterOther: 0.49,
  phraseSwell: 0.05,
  levelJitter: 0.03,
  hihat: true,
  hihatLevel: 0.55,
  kick: true,
  kickLevel: 0.14,
  snareDensity: 1,
  ghostLevel: 0.2,
  accentChance: 0.18,
  accentLevel: 0.45,
  setups: true,
  setupLevel: 0.52,
  sectionCrashes: true,
  rideCrashLevel: 0.92,
  crashLevel: 0.32,
  bombChance: 0.05,
};

/** A stored config made whole (missing or wrong-typed fields take their defaults). */
export function drumConfigOf(raw: unknown): DrumConfig {
  const out = { ...DEFAULT_DRUM_CONFIG };
  if (raw && typeof raw === "object")
    for (const k of Object.keys(out) as (keyof DrumConfig)[]) {
      const v = (raw as Record<string, unknown>)[k];
      if (typeof v === typeof out[k]) (out as Record<string, unknown>)[k] = v;
    }
  return out;
}

/** Where the ride's skip note falls at `bpm`: the configured swing, easing toward a lighter swing
    as it gets fast (if set). `straight` (the Swing setting) is straight. */
export function drumSkipPoint(config: DrumConfig, bpm: number, straight = false): number {
  if (straight) return 0.5;
  if (!config.swingEases) return config.swing;
  const fast = Math.max(0, Math.min(1, (bpm - 150) / 150));
  return config.swing - (config.swing - Math.max(0.5, config.swing - 0.09)) * fast;
}

/** The ride's figure for one beat: "q" a quarter, "s" a quarter and a swung skip note after it. */
type Cell = "q" | "s";

function figures(len: number, c: DrumConfig): [Cell[], number][] {
  if (len === 4)
    return [
      [["q", "s", "q", "s"], c.figSpangALang], // spang, spang-a-lang, spang-a-lang
      [["q", "q", "q", "q"], c.figQuarters], // spang spang spang spang
      [["q", "s", "s", "q"], c.figALangALang], // spang-a-lang-a-lang-spang
    ];
  if (len === 3)
    return [
      [["q", "q", "s"], c.figSpangALang],
      [["q", "q", "q"], c.figQuarters],
      [["q", "s", "q"], c.figALangALang],
    ];
  return [[Array.from({ length: len }, (_, k) => (k % 2 ? "s" : "q")) as Cell[], 1]];
}

/** The drums for one chorus (`beats` as performed, starting at performance beat `startBeat`). */
export function drumChorus(
  beats: PerformedBeat[],
  startBeat: number,
  kit: DrumKit,
  seed: number,
  opts: {
    chorus: number;
    isLast: boolean;
    /** Comping: snare chatter, setups into sections and the ride crashed to mark them. */
    comping?: boolean;
    /** Written bars (indexes into the chart) that start a section (`*A`, `*B`…). */
    sectionBars?: Set<number>;
    config?: DrumConfig;
  },
): DrumHit[] {
  void kit;
  const c = opts.config ?? DEFAULT_DRUM_CONFIG;
  const rng = makeRng(seed);
  const hits: DrumHit[] = [];
  const clamp = (x: number) => Math.max(0.02, Math.min(1, x));
  const v = (base: number, spread = c.levelJitter * 2.5) => clamp(base + (rng.next() - 0.5) * spread);
  const bars: { b: number; len: number }[] = [];
  beats.forEach((bt, i) => (bt.beatInBar === 0 || i === 0) && bars.push({ b: i, len: bt.beatsInBar }));
  const lastBar = bars.length - 1;
  const layBack = c.layBackMs / 1000;
  const pickFigure = (len: number): Cell[] => {
    const table = figures(len, c);
    const total = table.reduce((t, [, w]) => t + Math.max(0, w), 0);
    if (total <= 0) return table[0][0];
    let r = rng.next() * total;
    return (table.find(([, w]) => (r -= Math.max(0, w)) <= 0) ?? table[0])[0];
  };
  // Where sections start (by position in this chorus): the chart's own section marks, else every
  // 8 bars; the top of the chorus counts too.
  const marked = opts.sectionBars?.size
    ? new Set(bars.map((bar, bi) => (opts.sectionBars!.has(beats[bar.b].bar) ? bi : -1)).filter((bi) => bi >= 0))
    : new Set(bars.map((_, bi) => (bi % 8 === 0 ? bi : -1)).filter((bi) => bi >= 0));
  marked.add(0);

  let drift = 0;
  // Whether the beat before this one had a skip note — then this beat is the "lang".
  let afterSkip = false;
  // The swell of the bar the last skip was in: a "lang" over the bar line belongs to its figure.
  let skipSwell = 0;
  let figure: Cell[] | null = null;
  let figureLen = 0;

  bars.forEach((bar, bi) => {
    const at = startBeat + bar.b;
    const len = bar.len;
    if (opts.isLast && bi === lastBar) {
      // The last note: just the ride, with a soft kick under it.
      hits.push({ beat: at, voice: "ride", velocity: v(0.6) });
      if (c.kick) hits.push({ beat: at, voice: "kick", velocity: v(0.3) });
      return;
    }
    const back = (k: number) => (len === 3 ? k === 1 || k === 2 : k % 2 === 1);
    drift = Math.max(-c.swingDrift, Math.min(c.swingDrift, drift * 0.7 + (rng.next() - 0.5) * c.swingDrift));
    if (!figure || figureLen !== len || rng.next() >= c.keepFigure) figure = pickFigure(len);
    figureLen = len;
    // The phrase swell: up through a 4-bar phrase, easing back at its end.
    const swell = c.phraseSwell * Math.sin(((bi % 4) + 0.5) * (Math.PI / 4));
    // The "a" and "lang" are one stroke falling away: one recording (tone), the lang a hair quieter.
    const fallTone = 0.45;

    for (let k = 0; k < len; k++) {
      const t = at + k;
      const cell = figure[k];
      const wasLang = afterSkip;
      // A "lang" stays soft even when another skip follows it, so the figure keeps falling away.
      const level = afterSkip ? c.lang + skipSwell : (cell === "s" ? c.spang : back(k) ? c.quarterBack : c.quarterOther) + swell;
      hits.push({ beat: t, voice: "ride", velocity: v(level, afterSkip ? c.levelJitter * 0.6 : undefined), ...(afterSkip ? { tone: fallTone, late: layBack } : {}) });
      if (cell === "s")
        hits.push({
          beat: t,
          voice: "ride",
          velocity: v(c.a + swell, c.levelJitter * 0.6),
          tone: fallTone,
          skip: true,
          swing: drift + (rng.next() - 0.5) * c.swingJitter,
          late: layBack,
        });
      afterSkip = cell === "s";
      if (afterSkip) skipSwell = swell;
      if (c.hihat && back(k)) hits.push({ beat: t, voice: "pedal", velocity: v(c.hihatLevel) });
      // Feathered bass drum: felt more than heard (on a "lang" it sits back with the ride).
      if (c.kick) hits.push({ beat: t, voice: "kick", velocity: v(c.kickLevel, 0.04), ...(wasLang ? { late: layBack } : {}) });
    }

    if (opts.comping) {
      const sectionStart = marked.has(bi) && !(bi === 0 && opts.chorus === 0);
      const setsUp = c.setups && marked.has(bi + 1) && bi + 1 <= lastBar;
      // Crash the ride on a section's downbeat (a big ride hit with a little crash under it) and
      // drop a bomb on the kick — right on top, not laid back.
      if (sectionStart && c.sectionCrashes) {
        const down = hits.find((h) => h.beat === at && h.voice === "ride" && !h.skip);
        if (down) {
          down.velocity = v(c.rideCrashLevel, 0.04);
          down.tone = 0.85;
          delete down.late;
        }
        for (const h of hits) if (h.beat === at && h.voice === "kick" && !h.skip) delete h.late;
        if (c.crashLevel > 0) hits.push({ beat: at, voice: "crash", velocity: v(c.crashLevel, 0.06) });
        hits.push({ beat: at, voice: "kick", velocity: v(0.5, 0.06) });
      }
      // Left-hand chatter on the swung "and"s: mostly ghost notes, now and then a firmer one;
      // never on the beat a setup takes.
      const want = c.snareDensity * (setsUp ? 0.6 : 1);
      const n = Math.min(len, Math.floor(want) + (rng.next() < want - Math.floor(want) ? 1 : 0));
      const used = new Set<number>();
      for (let i = 0; i < n * 3 && used.size < n; i++) {
        const k = Math.floor(rng.next() * len);
        if (used.has(k) || (setsUp && k === len - 1)) continue;
        used.add(k);
        hits.push({ beat: at + k, voice: "snare", velocity: v(rng.next() < c.accentChance ? c.accentLevel : c.ghostLevel, 0.08), skip: true, swing: drift });
      }
      // Setting up the next section: snare and kick on the last "and".
      if (setsUp) {
        hits.push({ beat: at + len - 1, voice: "snare", velocity: v(c.setupLevel, 0.06), skip: true, swing: drift });
        hits.push({ beat: at + len - 1, voice: "kick", velocity: v(c.setupLevel * 0.8, 0.06), skip: true, swing: drift });
      }
      // The odd bomb on its own.
      if (!sectionStart && !setsUp && rng.next() < c.bombChance) hits.push({ beat: at + 1, voice: "kick", velocity: v(0.42), skip: true, swing: drift });
    }
  });
  return hits.sort((a, b) => a.beat - b.beat);
}
