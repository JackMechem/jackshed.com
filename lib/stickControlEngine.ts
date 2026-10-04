/**
 * Stick Control's click-scheduling/playback engine — a plain module with no React, the same shape
 * `lib/metronomeEngine.ts` and `lib/metricModulationEngine.ts` already use so a tool's audio keeps
 * running across page navigation (nothing here is tied to any component's mount lifecycle).
 * `components/StickControl.tsx` is just a view: push settings in whenever they change, read the
 * live snapshot back out via `useSyncExternalStore`.
 *
 * Unlike those two, this doesn't go through `lib/clickEngine.ts`'s generic `startClickEngine` —
 * that engine's `ClickSettings` only knows "which beat/sub am I on," not "which hand is this
 * stroke, and which repeat of the 4-bar phrase am I on, and should I count off first" — all of
 * which this tool needs for the "distinct click per hand" option and for knowing when a repeat
 * count (or the whole exercise) is finished. So this is its own small scheduler, built the same
 * way (a single `setInterval` lookahead loop, borrowing `clickEngine.ts`'s own `scheduleClick`
 * helper and `CLICK_SOUNDS` palette) but with its own tick semantics.
 *
 * Timeline model: a count-off (only before the *first* repeat — one count-off happens once, at
 * the start, not before every loop back to bar 1) of plain beat clicks, then `repeats` passes
 * through the current pattern's bars, walked one *cell* at a time rather than through uniform
 * fixed-duration "slots" — a roll segment's cells are played at double speed (see
 * `lib/stickControl.ts`'s own `NoteCell`), so a bar's cells no longer all take the same amount of
 * time the way they did before that was added, and the schedule has to be built cell-by-cell to
 * reflect that rather than by dividing a bar into equal slots.
 */

import { CLICK_SOUNDS, scheduleClick } from "@/lib/clickEngine";
import { getAudioContext } from "@/lib/metronome";
import { type GeneratedPattern, type Hand, generatePattern } from "@/lib/stickControl";

export type ClickMode = "pulse" | "everyNote" | "byHand";

export interface StickControlSettings {
  bpm: number;
  volume: number;
  soundId: string;
  clickMode: ClickMode;
  countOffBars: number;
  repeats: number;
  autoAdvance: boolean;
}

export type StickControlPhase = "idle" | "countoff" | "playing";

export interface StickControlSnapshot {
  running: boolean;
  pattern: GeneratedPattern | null;
  /** The pattern that will play once this one finishes — precomputed ahead of time (not just
      derived at render time) specifically so it can be generated to start on whichever hand the
      current pattern's own last stroke didn't just end on; see `promoteNextPattern` below. Shown
      in the UI as a preview below the current pattern. */
  nextPattern: GeneratedPattern | null;
  phase: StickControlPhase;
  currentBarIndex: number | null;
  currentRepeat: number;
}

let settings: StickControlSettings = {
  bpm: 100,
  volume: 0.8,
  soundId: "classic",
  clickMode: "pulse",
  countOffBars: 1,
  repeats: 20,
  autoAdvance: false,
};

let pattern: GeneratedPattern | null = null;
let nextPattern: GeneratedPattern | null = null;
let running = false;
let phase: StickControlPhase = "idle";
let currentBarIndex: number | null = null;
let currentRepeat = 0;

let timerId: ReturnType<typeof setInterval> | null = null;
const timeouts = new Set<ReturnType<typeof setTimeout>>();

const SCHEDULER_INTERVAL_MS = 25;
const LOOKAHEAD_SEC = 0.12;

function buildSnapshot(): StickControlSnapshot {
  return { running, pattern, nextPattern, phase, currentBarIndex, currentRepeat };
}

let cachedSnapshot = buildSnapshot();
const SERVER_SNAPSHOT = cachedSnapshot;
const listeners = new Set<() => void>();

function notify() {
  cachedSnapshot = buildSnapshot();
  for (const listener of listeners) listener();
}

export function subscribeStickControl(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStickControlSnapshot(): StickControlSnapshot {
  return cachedSnapshot;
}

export function getStickControlServerSnapshot(): StickControlSnapshot {
  return SERVER_SNAPSHOT;
}

/** Same "push settings in, don't notify" shape as `updateMetronomeSettings` — the component
    already re-renders from its own synced settings, and notifying here on every render would
    risk the same infinite-loop class of bug that function's own doc comment describes. */
export function updateStickControlSettings(next: StickControlSettings) {
  settings = next;
}

/** The hand the very last stroke of a pattern (its last bar's last cell) actually ends on — what
    the *next* pattern's own first stroke has to be the opposite of (see `promoteNextPattern`
    below). */
function endHand(p: GeneratedPattern): Hand {
  const lastBar = p.bars[p.bars.length - 1];
  return lastBar[lastBar.length - 1].hand;
}

/** Generates a completely fresh pattern (and a fresh upcoming preview to match), with no
    continuity constraint against whatever was playing before — used only for the very first idle
    preview, before anything has ever played (the one call site, in `components/StickControl.tsx`,
    is a mount-only effect now that nothing about the pattern's own shape is configurable anymore).
    The "New pattern" button and auto-advance instead call
    `advanceStickControlPattern`/`promoteNextPattern`, which keep the hand-continuity chain between
    consecutive patterns intact rather than resetting it — see that function's own comment. Safe to
    call whether or not anything is currently running. */
export function regenerateStickControlPattern() {
  pattern = generatePattern();
  nextPattern = generatePattern(endHand(pattern));
  if (running) beginScheduling();
  notify();
}

function stopInterval() {
  if (timerId !== null) clearInterval(timerId);
  timerId = null;
  for (const t of timeouts) clearTimeout(t);
  timeouts.clear();
}

/** Reads the module-level `pattern`, generating one first if there somehow isn't one yet (and
    likewise `nextPattern`, the precomputed upcoming preview — see `promoteNextPattern` below). A
    plain function (rather than inlining the null-checks) so the scheduling closure below — which
    TypeScript can't narrow the mutable module-level `let`s through, since they might in principle
    be reassigned before the closure runs — can get a non-null value back by type. */
function currentPattern(): GeneratedPattern {
  if (!pattern) pattern = generatePattern();
  if (!nextPattern) nextPattern = generatePattern(endHand(pattern));
  return pattern;
}

/** Shared by the exported `advanceStickControlPattern` and auto-advance inside the scheduler
    below: promotes the already-precomputed `nextPattern` — built, the last time this or
    `regenerateStickControlPattern` ran, to start on whichever hand the *current* pattern's own
    last stroke didn't just end on (per a direct request: "make sure the next pattern is always
    starting with a sticking opposite to what the previous ended with") — into the new current
    pattern, then precomputes a fresh `nextPattern` from *that* pattern's own ending hand, so the
    chain keeps extending one step ahead no matter how many times this runs. */
function promoteNextPattern() {
  const base = currentPattern();
  pattern = nextPattern ?? generatePattern(endHand(base));
  nextPattern = generatePattern(endHand(pattern));
}

/** Advances to the next pattern in the continuity chain — see `promoteNextPattern`'s own comment.
    Used by the "New pattern" button; auto-advance (inside the scheduler below) calls the same
    shared helper directly once a repeat count finishes, rather than through this export. Safe to
    call whether or not anything is currently running, same as `regenerateStickControlPattern`. */
export function advanceStickControlPattern() {
  promoteNextPattern();
  if (running) beginScheduling();
  notify();
}

function beginScheduling() {
  stopInterval();
  const seedPattern = currentPattern();
  const ctx = getAudioContext();
  if (ctx.state === "suspended") void ctx.resume();

  const beatsPerBar = seedPattern.beatsPerBar;
  const subdivision = seedPattern.subdivision;
  const countOffBeats = Math.max(0, Math.round(settings.countOffBars)) * beatsPerBar;

  let countOffLeft = countOffBeats;
  let repeatIndex = 0;
  let barIndex = 0;
  let cellIndex = 0;
  // Accumulated time *within the current bar*, in normal-cell units (a `fast` cell — a roll
  // segment, played at double speed — contributes 0.5, everything else 1) — this is what detects
  // "a new beat just started" (whenever it sits on a whole multiple of `subdivision`) without
  // assuming every cell in the bar takes the same amount of time, which no longer holds once a
  // bar has a roll segment in it.
  let timeInBar = 0;
  let nextTime = ctx.currentTime + 0.06;
  let stopRequested = false;

  timerId = setInterval(() => {
    while (!stopRequested && nextTime < ctx.currentTime + LOOKAHEAD_SEC) {
      const bpm = Math.max(1, settings.bpm);
      const beatDuration = 60 / bpm;
      const sound = CLICK_SOUNDS.find((c) => c.id === settings.soundId) ?? CLICK_SOUNDS[0];
      const vol = settings.volume * sound.gain;

      let shownPhase: StickControlPhase;
      let shownBar: number | null = null;
      let shownRepeat = repeatIndex + 1;
      let cellDuration: number;

      if (countOffLeft > 0) {
        shownPhase = "countoff";
        shownRepeat = 0;
        const beatIndex = countOffBeats - countOffLeft;
        const accent = beatIndex % beatsPerBar === 0;
        scheduleClick(
          ctx,
          nextTime,
          sound.wave,
          accent ? sound.accentFreq : sound.normalFreq,
          (accent ? 0.9 : 0.55) * vol,
          sound.length,
        );
        cellDuration = beatDuration;
        countOffLeft--;
      } else {
        shownPhase = "playing";
        shownBar = barIndex;
        const bar = currentPattern().bars[barIndex] ?? [];
        const thisCell = bar[cellIndex];
        const hand: Hand = thisCell?.hand ?? "R";
        const fast = thisCell?.fast ?? false;
        cellDuration = (beatDuration / subdivision) * (fast ? 0.5 : 1);
        const isBeatStart = Math.abs(timeInBar % subdivision) < 1e-6;
        const isBarStart = cellIndex === 0;

        if (settings.clickMode === "pulse") {
          if (isBeatStart) {
            scheduleClick(
              ctx,
              nextTime,
              sound.wave,
              isBarStart ? sound.accentFreq : sound.normalFreq,
              (isBarStart ? 0.9 : 0.55) * vol,
              sound.length,
            );
          }
        } else if (settings.clickMode === "byHand") {
          scheduleClick(
            ctx,
            nextTime,
            sound.wave,
            hand === "R" ? sound.accentFreq : sound.subFreq,
            (isBarStart ? 0.85 : 0.5) * vol,
            sound.length * (fast ? 0.6 : isBeatStart ? 1 : 0.75),
          );
        } else {
          // "everyNote": plain 3-tier click, same loudness/pitch tiers the regular metronome's
          // own subdivision clicks use, just applied to every stroke of the pattern.
          if (isBarStart) {
            scheduleClick(ctx, nextTime, sound.wave, sound.accentFreq, 0.9 * vol, sound.length);
          } else if (isBeatStart) {
            scheduleClick(ctx, nextTime, sound.wave, sound.normalFreq, 0.55 * vol, sound.length);
          } else {
            scheduleClick(ctx, nextTime, sound.wave, sound.subFreq, 0.25 * vol, sound.length * 0.6);
          }
        }
      }

      const delayMs = Math.max(0, (nextTime - ctx.currentTime) * 1000);
      const capturedPhase = shownPhase;
      const capturedBar = shownBar;
      const capturedRepeat = shownRepeat;
      const t = setTimeout(() => {
        timeouts.delete(t);
        phase = capturedPhase;
        currentBarIndex = capturedBar;
        currentRepeat = capturedRepeat;
        notify();
      }, delayMs);
      timeouts.add(t);

      nextTime += cellDuration;

      // Count-off ticks advance only the count-off counter (already decremented above) — the
      // pattern's own bar/cell position doesn't move until count-off is actually finished.
      if (shownPhase === "countoff") continue;

      const bar = currentPattern().bars[barIndex] ?? [];
      const playedCell = bar[cellIndex];
      timeInBar += playedCell?.fast ? 0.5 : 1;
      cellIndex++;
      if (cellIndex >= bar.length) {
        cellIndex = 0;
        timeInBar = 0;
        barIndex++;
        if (barIndex >= currentPattern().bars.length) {
          barIndex = 0;
          repeatIndex++;
          if (repeatIndex >= Math.max(1, Math.round(settings.repeats))) {
            if (settings.autoAdvance) {
              promoteNextPattern();
              repeatIndex = 0;
              notify();
            } else {
              // The exercise is done: stop taking any further cells *this tick* (and clear the
              // interval right away, below) so a slower-firing final `setTimeout` can't race a
              // later tick into scheduling one more repeat's worth of clicks before it fires.
              stopRequested = true;
              const stopDelayMs = delayMs;
              const t = setTimeout(() => stopStickControl(), stopDelayMs);
              timeouts.add(t);
            }
          }
        }
      }
    }
    if (stopRequested && timerId !== null) {
      clearInterval(timerId);
      timerId = null;
    }
  }, SCHEDULER_INTERVAL_MS);
}

export function startStickControl() {
  running = true;
  beginScheduling();
  notify();
}

export function stopStickControl() {
  stopInterval();
  running = false;
  phase = "idle";
  currentBarIndex = null;
  currentRepeat = 0;
  notify();
}
