/**
 * Tempo Trainer's click-scheduling engine and running state — the same plain, module-level-state
 * shape `lib/metronomeEngine.ts` already uses (and for the same reason: nothing here is tied to
 * any component's mount lifecycle, so the click keeps running — or keeps silently counting bars —
 * across a page navigation). `components/TempoTrainer.tsx` is just a view: push settings in
 * whenever they change, read the live snapshot back out via `useSyncExternalStore`.
 *
 * The one thing this tool adds on top of a plain metronome: it alternates between a stretch of
 * `onBars` audible bars and a stretch of `offBars` silent ones, looping that on/off cycle for as
 * long as it's running — a trainer for holding a tempo internally once the click disappears,
 * rather than a metronome you're meant to listen to the whole time. Reuses
 * `lib/clickEngine.ts`'s generic `startClickEngine` exactly the way `lib/metronomeEngine.ts` does
 * (one track, `getSettings`/`onBeat`); the "muted" bars aren't a second code path or a paused
 * engine — they're the *same* click track, just handed an all-zero `accents`/`subAccents` for
 * those bars, so `startClickEngine`'s own per-tick logic schedules no sound at all (an all-zero
 * `BeatLevel` already means "no click," the same as a muted beat/tick anywhere else in this app).
 * The engine keeps ticking through a silent stretch exactly as it does through an audible one —
 * necessary so bar boundaries are still detected (and `onBeat` still fires) with no gap to patch
 * over once the audible bars resume.
 */

import {
  type BeatLevel,
  type ClickEngine,
  type ClickSettings,
  startClickEngine,
} from "@/lib/clickEngine";

export interface TempoTrainerSettingsInput {
  bpm: number;
  beatsPerBar: number;
  accents: BeatLevel[];
  subdivision: number;
  subAccents: BeatLevel[];
  volume: number;
  soundId: string;
  /** How many bars play audibly before muting — always at least 1 (see `getSettingsForTick`). */
  onBars: number;
  /** How many bars stay silent before the click comes back — always at least 1. */
  offBars: number;
}

export type TempoTrainerPhase = "on" | "off";

export interface TempoTrainerSnapshot {
  running: boolean;
  /** Which stretch is currently playing — `"on"` (audible) or `"off"` (silent, no click
      scheduled at all). Starts (and idles) on `"on"`, same as a plain metronome always has been. */
  phase: TempoTrainerPhase;
  currentBeat: number | null;
  currentSub: number;
}

let settings: TempoTrainerSettingsInput = {
  bpm: 100,
  beatsPerBar: 4,
  accents: [2, 1, 1, 1],
  subdivision: 1,
  subAccents: [],
  volume: 0.8,
  soundId: "classic",
  onBars: 4,
  offBars: 4,
};

let engine: ClickEngine | null = null;
let running = false;
let phase: TempoTrainerPhase = "on";
let barsIntoPhase = 0;
let seenFirstBar = false;
let currentBeat: number | null = null;
let currentSub = 0;

function buildSnapshot(): TempoTrainerSnapshot {
  return { running, phase, currentBeat, currentSub };
}

let cachedSnapshot = buildSnapshot();
const SERVER_SNAPSHOT = cachedSnapshot;
const listeners = new Set<() => void>();

function notify() {
  cachedSnapshot = buildSnapshot();
  for (const listener of listeners) listener();
}

export function subscribeTempoTrainer(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTempoTrainerSnapshot(): TempoTrainerSnapshot {
  return cachedSnapshot;
}

export function getTempoTrainerServerSnapshot(): TempoTrainerSnapshot {
  return SERVER_SNAPSHOT;
}

/** Same "push settings in, don't notify" shape as `updateMetronomeSettings` — see that function's
    own comment for why notifying here would risk an infinite render loop. */
export function updateTempoTrainerSettings(next: TempoTrainerSettingsInput) {
  settings = next;
}

/** Called right as the click engine schedules each tick — the one place this tool differs from a
    plain metronome. `beat === 0 && sub === 0` (a new bar starting) is when it decides whether the
    *current* phase has run its full bar count and, if so, flips to the other phase — the same
    "detect a bar boundary before it affects scheduling" trick `lib/metronomeEngine.ts`'s own
    structure advance, and Random Metric Modulation's own tempo changes, already use. While the
    phase is `"off"`, every beat/subdivision level is forced to 0 (muted) regardless of the real
    `accents`/`subAccents` — the only change needed to make the stretch genuinely silent, since
    `startClickEngine` already schedules nothing for a muted level. */
function getSettingsForTick(beat: number, sub: number): ClickSettings {
  const base = settings;

  if (beat === 0 && sub === 0) {
    if (!seenFirstBar) {
      seenFirstBar = true;
    } else {
      const phaseBars = Math.max(1, Math.round(phase === "on" ? base.onBars : base.offBars));
      const barsElapsed = barsIntoPhase + 1;
      if (barsElapsed < phaseBars) {
        barsIntoPhase = barsElapsed;
      } else {
        barsIntoPhase = 0;
        phase = phase === "on" ? "off" : "on";
      }
    }
    notify();
  }

  if (phase === "off") {
    return {
      bpm: base.bpm,
      beatsPerBar: base.beatsPerBar,
      accents: base.accents.map((): BeatLevel => 0),
      subdivision: base.subdivision,
      subAccents: base.subAccents.map((): BeatLevel => 0),
      volume: base.volume,
      soundId: base.soundId,
    };
  }

  return {
    bpm: base.bpm,
    beatsPerBar: base.beatsPerBar,
    accents: base.accents,
    subdivision: base.subdivision,
    subAccents: base.subAccents,
    volume: base.volume,
    soundId: base.soundId,
  };
}

function handleBeat(beat: number, sub: number) {
  currentBeat = beat;
  currentSub = sub;
  notify();
}

export function startTempoTrainer() {
  engine?.stop();
  phase = "on";
  barsIntoPhase = 0;
  seenFirstBar = false;
  running = true;
  engine = startClickEngine([{ getSettings: getSettingsForTick, onBeat: handleBeat }]);
  notify();
}

export function stopTempoTrainer() {
  engine?.stop();
  engine = null;
  running = false;
  phase = "on";
  barsIntoPhase = 0;
  seenFirstBar = false;
  currentBeat = null;
  currentSub = 0;
  notify();
}
