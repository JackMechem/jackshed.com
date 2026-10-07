import type { BeatLevel, ClickSettings } from '@jam-practice/core/clickSounds';
import { convertTempo, defaultAccents, defaultSubAccents } from '@jam-practice/core/meterControls';
import { EMPTY_STRUCTURE, type Structure, sectionAt } from '@jam-practice/core/structure';

import { startClickEngine, type ClickEngineHandle } from '@/lib/metronomeClickEngine';

/**
 * The native sibling of `apps/web/lib/tempoTrainerEngine.ts` — a close mirror of
 * `metronomeEngine.ts` (full meter/subdivision/structure handling, identical to the plain
 * Metronome), with one thing layered on top: it alternates between `onBars` audible bars and
 * `offBars` silent ones, looping for as long as it's running. The muted bars aren't a second code
 * path — they're the same click track, just handed all-zero `accents`/`subAccents` while
 * `phase === 'off'`, so `startClickEngine`'s own per-tick logic schedules no sound at all.
 */
export type TempoTrainerBaseSettings = {
  bpm: number;
  beatsPerBar: number;
  beatUnit: number;
  accents: BeatLevel[];
  subdivision: number;
  subAccents: BeatLevel[];
  volume: number;
  soundId: string;
  tempoNoteValue: number | null;
  onBars: number;
  offBars: number;
};

export type TempoTrainerPhase = 'on' | 'off';

export type TempoTrainerSnapshot = {
  running: boolean;
  phase: TempoTrainerPhase;
  currentBeat: number | null;
  currentSub: number;
  formIndex: number;
  barInSection: number;
};

let baseSettings: TempoTrainerBaseSettings = {
  bpm: 100,
  beatsPerBar: 4,
  beatUnit: 4,
  accents: [2, 1, 1, 1],
  subdivision: 1,
  subAccents: [],
  volume: 0.8,
  soundId: 'classic',
  tempoNoteValue: 4,
  onBars: 4,
  offBars: 4,
};

let structureState: { useStructure: boolean; structure: Structure } = {
  useStructure: false,
  structure: EMPTY_STRUCTURE,
};

let snapshot: TempoTrainerSnapshot = {
  running: false,
  phase: 'on',
  currentBeat: null,
  currentSub: 0,
  formIndex: 0,
  barInSection: 0,
};

let barsIntoPhase = 0;
let seenFirstBar = false;
let engineHandle: ClickEngineHandle | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function setSnapshot(patch: Partial<TempoTrainerSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  notify();
}

export function updateTempoTrainerSettings(settings: TempoTrainerBaseSettings) {
  baseSettings = settings;
}

export function updateTempoTrainerStructure(next: { useStructure: boolean; structure: Structure }) {
  structureState = next;
}

function effectiveBpm(bpm: number, tempoNoteValue: number | null, beatUnit: number): number {
  return tempoNoteValue === null ? bpm : convertTempo(bpm, tempoNoteValue, beatUnit);
}

function silence(levels: BeatLevel[]): BeatLevel[] {
  return levels.map((): BeatLevel => 0);
}

function plainSettings(): ClickSettings {
  return {
    bpm: effectiveBpm(baseSettings.bpm, baseSettings.tempoNoteValue, baseSettings.beatUnit),
    beatsPerBar: baseSettings.beatsPerBar,
    accents: baseSettings.accents,
    subdivision: baseSettings.subdivision,
    subAccents: baseSettings.subAccents,
    volume: baseSettings.volume,
    soundId: baseSettings.soundId,
  };
}

function getSettingsForTick(beat: number, sub: number): ClickSettings {
  const { useStructure, structure } = structureState;

  if (beat === 0 && sub === 0) {
    if (!seenFirstBar) {
      seenFirstBar = true;
    } else {
      if (useStructure && structure.form.length > 0) {
        const activeSection = sectionAt(structure, snapshot.formIndex);
        const barInSection = snapshot.barInSection + 1;
        if (activeSection && barInSection >= activeSection.bars) {
          setSnapshot({ formIndex: snapshot.formIndex + 1, barInSection: 0 });
        } else {
          setSnapshot({ barInSection });
        }
      }

      const phaseBars = Math.max(1, Math.round(snapshot.phase === 'on' ? baseSettings.onBars : baseSettings.offBars));
      const phaseBarsElapsed = barsIntoPhase + 1;
      if (phaseBarsElapsed < phaseBars) {
        barsIntoPhase = phaseBarsElapsed;
      } else {
        barsIntoPhase = 0;
        setSnapshot({ phase: snapshot.phase === 'on' ? 'off' : 'on' });
      }
    }
  }

  const resolved = (() => {
    if (!useStructure || structure.form.length === 0) return plainSettings();
    const section = sectionAt(structure, snapshot.formIndex);
    if (!section) return plainSettings();
    return {
      bpm: effectiveBpm(baseSettings.bpm, baseSettings.tempoNoteValue, section.beatUnit),
      beatsPerBar: section.beatsPerBar,
      accents: defaultAccents(section.beatsPerBar, section.accents),
      subdivision: section.subdivision,
      subAccents: defaultSubAccents(section.beatsPerBar, section.subdivision, section.subAccents),
      volume: baseSettings.volume,
      soundId: baseSettings.soundId,
    };
  })();

  if (snapshot.phase === 'off') {
    return { ...resolved, accents: silence(resolved.accents), subAccents: silence(resolved.subAccents) };
  }
  return resolved;
}

function handleBeat(beat: number, sub: number) {
  setSnapshot({ currentBeat: beat, currentSub: sub });
}

export function startTempoTrainer() {
  if (snapshot.running) return;
  barsIntoPhase = 0;
  seenFirstBar = false;
  setSnapshot({
    running: true,
    phase: 'on',
    currentBeat: null,
    currentSub: 0,
    formIndex: 0,
    barInSection: 0,
  });
  engineHandle = startClickEngine([{ getSettings: getSettingsForTick, onBeat: handleBeat }]);
}

export function stopTempoTrainer() {
  engineHandle?.stop();
  engineHandle = null;
  barsIntoPhase = 0;
  seenFirstBar = false;
  setSnapshot({ running: false, phase: 'on', currentBeat: null, currentSub: 0 });
}

export function subscribeTempoTrainer(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function getTempoTrainerSnapshot(): TempoTrainerSnapshot {
  return snapshot;
}
