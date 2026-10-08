import type { BeatLevel, ClickSettings } from '@jam-practice/core/clickSounds';
import { type Phase, planModulation } from '@jam-practice/core/metricModulation';

import { type ClickEngineHandle, type ClickTrack, startClickEngine } from '@/lib/metronomeClickEngine';

/**
 * The native sibling of `apps/web/lib/metricModulationEngine.ts` — same plain-module shape as
 * `metronomeEngine.ts` (running state lives here, not in the screen, so leaving the screen doesn't
 * stop a run), same modulation planning (`@jam-practice/core/metricModulation`), and the same
 * two-tracks-on-one-scheduler trick for the "previous tempo" reference click: both tracks are
 * scheduled off one `startClickEngine` call, so the reference can only differ from the main click
 * by its intended tempo, never by scheduler drift.
 *
 * Settings split the same way web's do: meter/sound are live-editable mid-run
 * (`updateMetricModLiveSettings`), everything that shapes the modulation plan is passed once to
 * `startMetricMod` (the screen disables those controls while running).
 */

export type LogEntry = { id: number; from: number; to: number; label: string };

export type MetricModLiveSettings = {
  beatsPerBar: number;
  accents: BeatLevel[];
  subdivision: number;
  subAccents: BeatLevel[];
  volume: number;
  soundId: string;
  referenceMuted: boolean;
  referenceSoundId: string;
};

export type MetricModStartParams = {
  bpm: number;
  returnToOriginal: boolean;
  enabledRatios: string[];
  avoidRepeat: boolean;
  matchToRealignment: boolean;
  minBarsPerModulation: number;
  playOriginalTempo: boolean;
};

export type MetricModSnapshot = {
  running: boolean;
  currentBeat: number | null;
  currentSub: number;
  referenceBeat: number | null;
  referenceBpm: number;
  bpm: number;
  barsIntoInterval: number;
  effectiveBars: number;
  lastModulation: LogEntry | null;
  nextPreview: { toBpm: number; label: string } | null;
  log: LogEntry[];
  playingReference: boolean;
  returnToOriginal: boolean;
};

let live: MetricModLiveSettings = {
  beatsPerBar: 4,
  accents: [2, 1, 1, 1],
  subdivision: 1,
  subAccents: [],
  volume: 0.8,
  soundId: 'classic',
  referenceMuted: false,
  referenceSoundId: 'wood',
};

let snapshot: MetricModSnapshot = {
  running: false,
  currentBeat: null,
  currentSub: 0,
  referenceBeat: null,
  referenceBpm: 100,
  bpm: 100,
  barsIntoInterval: 0,
  effectiveBars: 4,
  lastModulation: null,
  nextPreview: null,
  log: [],
  playingReference: false,
  returnToOriginal: false,
};

// Scheduling state, read/written from inside `getSettingsForTick` (the click engine's own tick).
let engineHandle: ClickEngineHandle | null = null;
let schedulingBpm = 100;
let referenceBpm = 100;
let originalBpm = 100;
let barsSinceMod = 0;
let effectiveBarsCount = 4;
let seenFirstBeat = false;
let lastRatioId: string | null = null;
let phase: Phase = 'home';
let upcoming: ReturnType<typeof planModulation> | null = null;
let logIdCounter = 0;
let params: MetricModStartParams = {
  bpm: 100,
  returnToOriginal: false,
  enabledRatios: [],
  avoidRepeat: true,
  matchToRealignment: false,
  minBarsPerModulation: 4,
  playOriginalTempo: false,
};

const listeners = new Set<() => void>();

function setSnapshot(patch: Partial<MetricModSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

export function subscribeMetricMod(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMetricModSnapshot(): MetricModSnapshot {
  return snapshot;
}

/** Deliberately doesn't notify — the screen never reads these back out of the snapshot, and its
    `accents`/`subAccents` are fresh arrays every render, so notifying would loop (same reasoning as
    `metronomeEngine.ts`'s `updateMetronomeSettings`). */
export function updateMetricModLiveSettings(next: MetricModLiveSettings) {
  live = next;
}

function planNext(fromBpm: number) {
  return planModulation(
    fromBpm,
    originalBpm,
    params.returnToOriginal,
    phase,
    params.enabledRatios,
    params.avoidRepeat ? lastRatioId : null,
  );
}

function mainSettings(): ClickSettings {
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

function referenceSettings(): ClickSettings {
  return {
    bpm: referenceBpm,
    beatsPerBar: live.beatsPerBar,
    accents: live.accents,
    subdivision: 1,
    subAccents: [],
    volume: live.referenceMuted ? 0 : live.volume,
    soundId: live.referenceSoundId,
  };
}

/** Runs right before each tick is scheduled — including before the gap to the *next* beat is
    computed — so a modulation lands exactly on the bar line rather than a beat late. */
function getSettingsForTick(beat: number, sub: number): ClickSettings {
  if (beat !== 0 || sub !== 0) return mainSettings();

  if (!seenFirstBeat) {
    seenFirstBeat = true;
    return mainSettings();
  }

  const barsElapsed = barsSinceMod + 1;
  if (barsElapsed < effectiveBarsCount) {
    barsSinceMod = barsElapsed;
    setSnapshot({ barsIntoInterval: barsElapsed });
    return mainSettings();
  }

  barsSinceMod = 0;
  const plan = upcoming ?? planNext(schedulingBpm);
  const fromBpm = schedulingBpm;
  schedulingBpm = plan.toBpm;
  if (plan.modulationId) lastRatioId = plan.modulationId;
  phase = plan.nextPhase;
  effectiveBarsCount =
    params.matchToRealignment && plan.barsToRealign !== null
      ? Math.max(plan.barsToRealign, params.minBarsPerModulation)
      : params.minBarsPerModulation;
  if (!params.returnToOriginal) referenceBpm = fromBpm;

  logIdCounter++;
  const entry: LogEntry = { id: logIdCounter, from: fromBpm, to: plan.toBpm, label: plan.label };
  upcoming = planNext(plan.toBpm);
  setSnapshot({
    bpm: plan.toBpm,
    referenceBpm,
    barsIntoInterval: 0,
    effectiveBars: effectiveBarsCount,
    lastModulation: entry,
    log: [...snapshot.log, entry].slice(-50),
    nextPreview: { toBpm: upcoming.toBpm, label: upcoming.label },
  });
  return mainSettings();
}

export function startMetricMod(next: MetricModStartParams) {
  engineHandle?.stop();
  params = next;
  schedulingBpm = next.bpm;
  referenceBpm = next.bpm;
  originalBpm = next.bpm;
  barsSinceMod = 0;
  seenFirstBeat = false;
  lastRatioId = null;
  phase = 'home';
  effectiveBarsCount = next.minBarsPerModulation;
  upcoming = planNext(next.bpm);

  setSnapshot({
    running: true,
    currentBeat: null,
    currentSub: 0,
    referenceBeat: null,
    bpm: next.bpm,
    referenceBpm: next.bpm,
    barsIntoInterval: 0,
    effectiveBars: effectiveBarsCount,
    lastModulation: null,
    nextPreview: { toBpm: upcoming.toBpm, label: upcoming.label },
    log: [],
    playingReference: next.playOriginalTempo,
    returnToOriginal: next.returnToOriginal,
  });

  const tracks: ClickTrack[] = [
    {
      getSettings: getSettingsForTick,
      onBeat: (beat, sub) => setSnapshot({ currentBeat: beat, currentSub: sub }),
    },
  ];
  if (next.playOriginalTempo) {
    tracks.push({
      getSettings: referenceSettings,
      onBeat: (beat) => setSnapshot({ referenceBeat: beat }),
    });
  }
  engineHandle = startClickEngine(tracks);
}

export function stopMetricMod() {
  engineHandle?.stop();
  engineHandle = null;
  setSnapshot({ running: false, currentBeat: null, currentSub: 0, referenceBeat: null });
}

export function clearMetricModLog() {
  setSnapshot({ log: [] });
}
