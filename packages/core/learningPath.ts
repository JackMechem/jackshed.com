// Learning paths for the ear-training tools: an ordered list of levels per tool, each adding new
// material on top of everything before it. Pure data + helpers, no imports, so the Convex backend
// can summarize a user's progress for their public profile without pulling in the audio/chord
// libraries.

export type LearningTrack = "interval" | "chord" | "progression";

export type LearningLevel = {
  /** Stable id — progress is stored by this, so levels can be reordered or added later. */
  id: string;
  title: string;
  /** Item ids this level introduces (interval / chord quality / progression ids). */
  newItems: string[];
  /** Interval levels only: which directions to play, and whether to play both notes together. */
  directions?: (1 | -1)[];
  harmonic?: boolean;
};

export const LEARNING_TRACKS: { id: LearningTrack; label: string; href: string; noun: string }[] = [
  { id: "interval", label: "Guess the Interval", href: "/guess-the-interval", noun: "intervals" },
  { id: "chord", label: "Guess the Chord", href: "/guess-the-chord", noun: "chords" },
  { id: "progression", label: "Guess the Progression", href: "/guess-the-progression", noun: "progressions" },
];

export const LEARNING_LEVELS: Record<LearningTrack, LearningLevel[]> = {
  interval: [
    { id: "i-p5-p8", title: "Perfect 5th & Octave", newItems: ["P5", "P8"] },
    { id: "i-p4", title: "Perfect 4th", newItems: ["P4"] },
    { id: "i-M3", title: "Major 3rd", newItems: ["M3"] },
    { id: "i-m3", title: "Minor 3rd", newItems: ["m3"] },
    { id: "i-M2", title: "Major 2nd", newItems: ["M2"] },
    { id: "i-m2", title: "Minor 2nd", newItems: ["m2"] },
    { id: "i-M6", title: "Major 6th", newItems: ["M6"] },
    { id: "i-m6", title: "Minor 6th", newItems: ["m6"] },
    { id: "i-m7", title: "Minor 7th", newItems: ["m7"] },
    { id: "i-M7", title: "Major 7th", newItems: ["M7"] },
    { id: "i-TT", title: "Tritone", newItems: ["TT"] },
    { id: "i-desc", title: "Going down", newItems: [], directions: [1, -1] },
    { id: "i-harmonic", title: "Both notes together", newItems: [], directions: [1], harmonic: true },
  ],
  chord: [
    { id: "c-maj-min", title: "Major & minor", newItems: ["maj", "min"] },
    { id: "c-dim", title: "Diminished", newItems: ["dim"] },
    { id: "c-aug", title: "Augmented", newItems: ["aug"] },
    { id: "c-sus", title: "Sus4 & sus2", newItems: ["sus4", "sus2"] },
    { id: "c-dom7", title: "Dominant 7", newItems: ["dom7"] },
    { id: "c-maj7", title: "Major 7", newItems: ["maj7"] },
    { id: "c-min7", title: "Minor 7", newItems: ["min7"] },
    { id: "c-min7b5", title: "Half-diminished", newItems: ["min7b5"] },
    { id: "c-dim7", title: "Diminished 7", newItems: ["dim7"] },
    { id: "c-sixths", title: "Sixth chords", newItems: ["six", "min6"] },
    { id: "c-7sus", title: "7sus4 & minor-major 7", newItems: ["dom7sus4", "minMaj7"] },
    { id: "c-ninths", title: "Ninths", newItems: ["nine", "min9", "maj9"] },
    { id: "c-altered", title: "Altered dominants", newItems: ["dom7flat9", "dom7sharp9", "dom7sharp5"] },
    { id: "c-ext", title: "11ths & 13ths", newItems: ["eleven", "min11", "thirteen"] },
  ],
  progression: [
    { id: "p-cadence", title: "I–IV–V–I", newItems: ["I-IV-V-I", "I-IV-I"] },
    { id: "p-axis", title: "I–V–vi–IV", newItems: ["I-V-vi-IV"] },
    { id: "p-50s", title: "The '50s progression", newItems: ["I-vi-IV-V"] },
    { id: "p-vi-IV", title: "vi–IV–I–V", newItems: ["vi-IV-I-V"] },
    { id: "p-deceptive", title: "The deceptive cadence", newItems: ["I-IV-V-vi", "I-IV-V"] },
    { id: "p-mixo", title: "♭VII borrowing", newItems: ["I-bVII-IV"] },
    { id: "p-minor", title: "Minor keys", newItems: ["i-iv-V-i"] },
    { id: "p-andalusian", title: "The Andalusian cadence", newItems: ["andalusian"] },
    { id: "p-aeolian", title: "Aeolian loops", newItems: ["i-bVII-bVI-bVII", "i-bVI-bIII-bVII"] },
    { id: "p-251", title: "ii–V–I", newItems: ["ii-V-I"] },
    { id: "p-turnaround", title: "I–vi–ii–V", newItems: ["I-vi-ii-V", "vi-ii-V-I"] },
    { id: "p-minor-251", title: "Minor ii–V–i", newItems: ["ii-V-i"] },
    { id: "p-iii-vi", title: "iii–vi–ii–V", newItems: ["iii-vi-ii-V", "I-VI7-ii-V"] },
    { id: "p-subs", title: "Tritone & backdoor subs", newItems: ["ii-bII-I", "iv-bVII-I"] },
    { id: "p-blues", title: "The blues", newItems: ["blues", "blues-turnaround"] },
    {
      id: "p-everything",
      title: "Everything else",
      newItems: ["canon", "IV-V-iii-vi", "I-IV-vi-V", "iii-VI-ii-V-I", "I-#io-ii-V", "ladybird", "minor-turnaround"],
    },
  ],
};

/** Rounds in one level attempt. */
export const LEVEL_ROUNDS = 10;
/** Score (0-1) needed to pass a level. */
export const PASS_SCORE = 0.8;

export type LevelProgress = { best: number; passedAt: number | null };
export type TrackProgress = Record<string, LevelProgress>;
export type LearningProgress = Record<LearningTrack, TrackProgress>;

export const LEARNING_KEY = "jam-practice-ear-training-path";
export const DEFAULT_LEARNING_PROGRESS: LearningProgress = {
  interval: {},
  chord: {},
  progression: {},
};

/** ★ at a pass, ★★ at 90%, ★★★ for a perfect run. */
export function starsFor(score: number): number {
  if (score >= 1) return 3;
  if (score >= 0.9) return 2;
  return score >= PASS_SCORE ? 1 : 0;
}

function levelEntry(progress: TrackProgress | undefined, id: string): LevelProgress | undefined {
  const entry = progress?.[id];
  return entry && typeof entry.best === "number" ? entry : undefined;
}

export function isPassed(progress: TrackProgress | undefined, id: string): boolean {
  return !!levelEntry(progress, id)?.passedAt;
}

/** Index of the first level not yet passed (levels.length once every one is). Levels unlock in
    order, so this is also the furthest one you can play. */
export function currentLevelIndex(track: LearningTrack, progress: TrackProgress | undefined): number {
  const levels = LEARNING_LEVELS[track];
  const i = levels.findIndex((l) => !isPassed(progress, l.id));
  return i === -1 ? levels.length : i;
}

export function levelStars(progress: TrackProgress | undefined, id: string): number {
  const entry = levelEntry(progress, id);
  return entry ? starsFor(entry.best) : 0;
}

/** Every item unlocked up to and including level `index`. */
export function cumulativeItems(track: LearningTrack, index: number): string[] {
  return LEARNING_LEVELS[track].slice(0, index + 1).flatMap((l) => l.newItems);
}

/** The items for one attempt at level `index`: about half the rounds on what's new, the rest
    reviewing everything so far, shuffled. A level with nothing new (e.g. "Going down") is all
    review. */
export function levelQueue(track: LearningTrack, index: number, count = LEVEL_ROUNDS): string[] {
  const level = LEARNING_LEVELS[track][index];
  const all = cumulativeItems(track, index);
  const fresh = level.newItems.length && all.length > level.newItems.length ? level.newItems : [];
  const picks: string[] = [];
  for (let i = 0; i < count; i++) {
    const from = fresh.length && i % 2 === 0 ? fresh : all;
    picks.push(from[Math.floor(Math.random() * from.length)]);
  }
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [picks[i], picks[j]] = [picks[j], picks[i]];
  }
  return picks;
}

/** The newest interval-direction/harmonic setting in effect at level `index`. */
export function intervalLevelOptions(index: number): { directions: (1 | -1)[]; harmonic: boolean } {
  let directions: (1 | -1)[] = [1];
  let harmonic = false;
  for (const level of LEARNING_LEVELS.interval.slice(0, index + 1)) {
    if (level.directions) directions = level.directions;
    if (level.harmonic !== undefined) harmonic = level.harmonic;
  }
  return { directions, harmonic };
}

export type TrackSummary = { passed: number; total: number; stars: number; maxStars: number; current: string | null };

/** Levels passed, stars earned and the level being worked on, for the dashboard and profiles. */
export function summarizeTrack(track: LearningTrack, progress: TrackProgress | undefined): TrackSummary {
  const levels = LEARNING_LEVELS[track];
  const passed = levels.filter((l) => isPassed(progress, l.id)).length;
  const stars = levels.reduce((sum, l) => sum + levelStars(progress, l.id), 0);
  const index = currentLevelIndex(track, progress);
  return {
    passed,
    total: levels.length,
    stars,
    maxStars: levels.length * 3,
    current: index < levels.length ? levels[index].title : null,
  };
}

/** Summaries of all three tracks from a raw stored value (anything — it's read from storage). */
export function summarizeLearning(raw: unknown): Record<LearningTrack, TrackSummary> {
  const value = raw && typeof raw === "object" ? (raw as Partial<LearningProgress>) : {};
  const pick = (t: LearningTrack) => {
    const p = value[t];
    return p && typeof p === "object" ? p : {};
  };
  return {
    interval: summarizeTrack("interval", pick("interval")),
    chord: summarizeTrack("chord", pick("chord")),
    progression: summarizeTrack("progression", pick("progression")),
  };
}
