/**
 * Polyrhythm Metric Modulation Metronome's actual click-scheduling engine, modulation planning,
 * and log — moved out of `components/RandomMetricModulation.tsx` into this plain module, the
 * same shape `lib/metronomeEngine.ts` uses (see that file's own doc comment for *why*: a
 * component's state doesn't survive navigating away from its page, but a plain module's does,
 * since nothing here is tied to any component's mount lifecycle at all). The component is now
 * just a view: it reads this module's snapshot via `useSyncExternalStore` and pushes its own
 * synced, live-editable settings (meter, sound) into it the same way it used to push them into a
 * local `useRef`. Settings that only apply *before* a run starts (ratios, minBarsPerModulation,
 * returnToOriginal, ...) are passed once, to `start()`, exactly like the component's own UI
 * already disables those controls once `running`.
 */

import {
  type BeatLevel,
  type ClickEngine,
  type ClickTrack,
  startClickEngine,
} from "@/lib/clickEngine";
import { type Phase, planModulation } from "@/lib/metricModulation";

export type LogEntry = { id: number; from: number; to: number; label: string };

export interface MetricModLiveSettings {
  beatsPerBar: number;
  accents: BeatLevel[];
  subdivision: number;
  subAccents: BeatLevel[];
  volume: number;
  soundId: string;
  referenceMuted: boolean;
  referenceSoundId: string;
}

export interface MetricModStartParams {
  bpm: number;
  returnToOriginal: boolean;
  enabledRatios: string[];
  avoidRepeat: boolean;
  matchToRealignment: boolean;
  minBarsPerModulation: number;
  playOriginalTempo: boolean;
}

export interface MetricModSnapshot {
  running: boolean;
  currentBeat: number | null;
  currentSub: number;
  referenceBeat: number | null;
  referenceBpmDisplay: number;
  preciseBpmDisplay: number;
  barsIntoInterval: number;
  effectiveBars: number;
  lastModulation: LogEntry | null;
  nextPreview: {
    toBpm: number;
    label: string;
    barsToRealign: number | null;
    quarterEquivalent: string | null;
  } | null;
  log: LogEntry[];
  playingReference: boolean;
  returnToOriginal: boolean;
  /** What `BeatIndicator` should show right now — mirrors the live meter settings, exposed here
      so a Dock preview can render the same thing without needing its own access to this tool's
      synced settings. */
  accents: BeatLevel[];
  subdivision: number;
  subAccents: BeatLevel[];
}

let live: MetricModLiveSettings = {
  beatsPerBar: 4,
  accents: [2, 1, 1, 1],
  subdivision: 1,
  subAccents: [],
  volume: 0.8,
  soundId: "classic",
  referenceMuted: false,
  referenceSoundId: "wood",
};

let engine: ClickEngine | null = null;
let running = false;
let currentBeat: number | null = null;
let currentSub = 0;
let referenceBeat: number | null = null;
let referenceBpmDisplay = 100;
let preciseBpmDisplay = 100;
let barsIntoInterval = 0;
let effectiveBars = 4;
let lastModulation: LogEntry | null = null;
let nextPreview: MetricModSnapshot["nextPreview"] = null;
let log: LogEntry[] = [];
let playingReference = false;
let returnToOriginal = false;

// Mutable scheduling state, read/written from inside `getSettings`, which runs off the click
// engine's own scheduler tick, not a render.
let schedulingBpm = 100;
let barsSinceMod = 0;
let effectiveBarsCount = 4;
let seenFirstBeat = false;
let lastRatioId: string | null = null;
let originalBpm = 100;
let referenceBpm = 100;
let phase: Phase = "home";
let upcoming: ReturnType<typeof planModulation> | null = null;
let logIdCounter = 0;
let avoidRepeat = true;
let enabledRatios: string[] = [];
let matchToRealignment = false;
let minBarsPerModulation = 4;

function buildSnapshot(): MetricModSnapshot {
  return {
    running,
    currentBeat,
    currentSub,
    referenceBeat,
    referenceBpmDisplay,
    preciseBpmDisplay,
    barsIntoInterval,
    effectiveBars,
    lastModulation,
    nextPreview,
    log,
    playingReference,
    returnToOriginal,
    accents: live.accents,
    subdivision: live.subdivision,
    subAccents: live.subAccents,
  };
}

let cachedSnapshot = buildSnapshot();
const SERVER_SNAPSHOT = cachedSnapshot;
const listeners = new Set<() => void>();

function notify() {
  cachedSnapshot = buildSnapshot();
  for (const listener of listeners) listener();
}

export function subscribeMetricMod(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMetricModSnapshot(): MetricModSnapshot {
  return cachedSnapshot;
}

export function getMetricModServerSnapshot(): MetricModSnapshot {
  return SERVER_SNAPSHOT;
}

/** Called from the component whenever its live-editable (while running) synced settings change —
    meter and sound. Deliberately doesn't `notify()` — see `lib/metronomeEngine.ts`'s
    `updateMetronomeSettings`, which documents exactly why: the component never reads these
    fields back out of this snapshot, and notifying here reliably causes an infinite render loop
    (the component's own `accents`/`subAccents` are freshly computed arrays every render). */
export function updateMetricModLiveSettings(next: MetricModLiveSettings) {
  live = next;
}

function referenceSettings() {
  return {
    bpm: referenceBpm,
    beatsPerBar: live.beatsPerBar,
    accents: live.accents,
    subdivision: 1,
    subAccents: [] as BeatLevel[],
    volume: live.referenceMuted ? 0 : live.volume,
    soundId: live.referenceSoundId,
  };
}

function mainSettings() {
  return {
    bpm: schedulingBpm,
    beatsPerBar: live.beatsPerBar,
    accents: live.accents,
    subdivision: live.subdivision,
    subAccents: live.subAccents,
    volume: live.volume,
    soundId: live.soundId,
  };
}

function queueNext(fromBpm: number) {
  const plan = planModulation(
    fromBpm,
    originalBpm,
    returnToOriginal,
    phase,
    enabledRatios,
    avoidRepeat ? lastRatioId : null,
  );
  upcoming = plan;
  nextPreview = {
    toBpm: plan.toBpm,
    label: plan.label,
    barsToRealign: plan.barsToRealign,
    quarterEquivalent: plan.quarterEquivalent,
  };
}

/** Called by the click engine right as it schedules each beat — including, crucially, before it
    computes the gap to the *next* beat, so the very first interval after the bar line already
    reflects the new tempo instead of lagging a beat behind. */
function getSettingsForTick(beat: number, sub: number) {
  if (beat === 0 && sub === 0) {
    if (!seenFirstBeat) {
      seenFirstBeat = true;
    } else {
      const barsElapsed = barsSinceMod + 1;
      if (barsElapsed < effectiveBarsCount) {
        barsSinceMod = barsElapsed;
        barsIntoInterval = barsElapsed;
      } else {
        barsSinceMod = 0;
        barsIntoInterval = 0;
        const plan =
          upcoming ??
          planModulation(
            schedulingBpm,
            originalBpm,
            returnToOriginal,
            phase,
            enabledRatios,
            avoidRepeat ? lastRatioId : null,
          );
        const fromBpm = schedulingBpm;
        schedulingBpm = plan.toBpm;
        preciseBpmDisplay = plan.toBpm;
        if (plan.modulationId) lastRatioId = plan.modulationId;
        phase = plan.nextPhase;
        const nextBars =
          matchToRealignment && plan.barsToRealign !== null
            ? Math.max(plan.barsToRealign, minBarsPerModulation)
            : minBarsPerModulation;
        effectiveBarsCount = nextBars;
        effectiveBars = nextBars;
        if (!returnToOriginal) {
          referenceBpm = fromBpm;
          referenceBpmDisplay = fromBpm;
        }
        logIdCounter++;
        const entry: LogEntry = { id: logIdCounter, from: fromBpm, to: plan.toBpm, label: plan.label };
        lastModulation = entry;
        log = [...log, entry].slice(-50);
        queueNext(plan.toBpm);
      }
    }
    notify();
  }
  return mainSettings();
}

export function startMetricMod(params: MetricModStartParams) {
  engine?.stop();
  barsSinceMod = 0;
  seenFirstBeat = false;
  lastRatioId = null;
  schedulingBpm = params.bpm;
  preciseBpmDisplay = params.bpm;
  originalBpm = params.bpm;
  referenceBpm = params.bpm;
  referenceBpmDisplay = params.bpm;
  phase = "home";
  avoidRepeat = params.avoidRepeat;
  enabledRatios = params.enabledRatios;
  matchToRealignment = params.matchToRealignment;
  minBarsPerModulation = params.minBarsPerModulation;
  returnToOriginal = params.returnToOriginal;
  effectiveBarsCount = minBarsPerModulation;
  effectiveBars = minBarsPerModulation;
  barsIntoInterval = 0;
  lastModulation = null;
  log = [];
  queueNext(params.bpm);

  // Both tracks run off the same scheduler tick (see `startClickEngine`), so the reference click
  // can only drift from the main one by its own intentional tempo difference — never from
  // browser timer jitter nudging one track's schedule but not the other's.
  const tracks: ClickTrack[] = [
    {
      getSettings: getSettingsForTick,
      onBeat: (beat, sub) => {
        currentBeat = beat;
        currentSub = sub;
        notify();
      },
    },
  ];
  playingReference = params.playOriginalTempo;
  if (params.playOriginalTempo) {
    tracks.push({
      getSettings: referenceSettings,
      onBeat: (beat) => {
        referenceBeat = beat;
        notify();
      },
    });
  }
  running = true;
  engine = startClickEngine(tracks);
  notify();
}

export function clearMetricModLog() {
  log = [];
  notify();
}

export function stopMetricMod() {
  engine?.stop();
  engine = null;
  running = false;
  currentBeat = null;
  currentSub = 0;
  referenceBeat = null;
  notify();
}
