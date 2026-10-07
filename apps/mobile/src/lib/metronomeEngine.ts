import type { BeatLevel, ClickSettings } from '@jam-practice/core/clickSounds';
import { convertTempo } from '@jam-practice/core/meterControls';
import { EMPTY_STRUCTURE, type Structure, sectionAt } from '@jam-practice/core/structure';

import { startClickEngine, type ClickEngineHandle } from '@/lib/metronomeClickEngine';

/**
 * The native sibling of `apps/web/lib/metronomeEngine.ts` — a plain module holding the actual
 * running state (click scheduling, current beat/sub, structure advancement), deliberately
 * independent of any one screen's mount lifecycle. The Metronome screen is just a view over this:
 * push settings in whenever they change, read the live snapshot back out via `useSyncExternalStore`
 * — unmounting the screen (navigating away) doesn't stop a running metronome, matching the web
 * app's own behavior.
 */
export type MetronomeBaseSettings = {
  bpm: number;
  beatsPerBar: number;
  beatUnit: number;
  accents: BeatLevel[];
  subdivision: number;
  subAccents: BeatLevel[];
  volume: number;
  soundId: string;
  tempoNoteValue: number | null;
};

export type MetronomeSnapshot = {
  running: boolean;
  currentBeat: number | null;
  currentSub: number;
  formIndex: number;
  barInSection: number;
};

let baseSettings: MetronomeBaseSettings = {
  bpm: 100,
  beatsPerBar: 4,
  beatUnit: 4,
  accents: [2, 1, 1, 1],
  subdivision: 1,
  subAccents: [],
  volume: 0.8,
  soundId: 'classic',
  tempoNoteValue: 4,
};

let structureState: { useStructure: boolean; structure: Structure } = {
  useStructure: false,
  structure: EMPTY_STRUCTURE,
};

let snapshot: MetronomeSnapshot = {
  running: false,
  currentBeat: null,
  currentSub: 0,
  formIndex: 0,
  barInSection: 0,
};

let structSeenFirst = false;
let engineHandle: ClickEngineHandle | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function setSnapshot(patch: Partial<MetronomeSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  notify();
}

export function updateMetronomeSettings(settings: MetronomeBaseSettings) {
  baseSettings = settings;
}

export function updateMetronomeStructure(next: { useStructure: boolean; structure: Structure }) {
  structureState = next;
}

function effectiveBpm(bpm: number, tempoNoteValue: number | null, beatUnit: number): number {
  return tempoNoteValue === null ? bpm : convertTempo(bpm, tempoNoteValue, beatUnit);
}

/** Called by the click engine right before scheduling each tick — the one place a structure
    advances to its next bar/section, exactly on a bar line (`beat === 0 && sub === 0`), never
    affecting a tick already in flight. */
function getSettingsForTick(beat: number, sub: number): ClickSettings {
  const { useStructure, structure } = structureState;
  if (!useStructure || structure.form.length === 0) {
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

  if (beat === 0 && sub === 0) {
    if (!structSeenFirst) {
      structSeenFirst = true;
    } else {
      const activeSection = sectionAt(structure, snapshot.formIndex);
      const barInSection = snapshot.barInSection + 1;
      if (activeSection && barInSection >= activeSection.bars) {
        setSnapshot({ formIndex: snapshot.formIndex + 1, barInSection: 0 });
      } else {
        setSnapshot({ barInSection });
      }
    }
  }

  const section = sectionAt(structure, snapshot.formIndex);
  if (!section) {
    // Structure is on, but the form is empty — fall back to the plain meter rather than crash;
    // `canStart` on the screen already prevents actually starting in this state.
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

  return {
    bpm: effectiveBpm(baseSettings.bpm, baseSettings.tempoNoteValue, section.beatUnit),
    beatsPerBar: section.beatsPerBar,
    accents: section.accents,
    subdivision: section.subdivision,
    subAccents: section.subAccents,
    volume: baseSettings.volume,
    soundId: baseSettings.soundId,
  };
}

function handleBeat(beat: number, sub: number) {
  setSnapshot({ currentBeat: beat, currentSub: sub });
}

export function startMetronome() {
  if (snapshot.running) return;
  structSeenFirst = false;
  setSnapshot({ running: true, currentBeat: null, currentSub: 0, formIndex: 0, barInSection: 0 });
  engineHandle = startClickEngine([{ getSettings: getSettingsForTick, onBeat: handleBeat }]);
}

export function stopMetronome() {
  engineHandle?.stop();
  engineHandle = null;
  setSnapshot({ running: false, currentBeat: null, currentSub: 0 });
}

export function subscribeMetronome(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

export function getMetronomeSnapshot(): MetronomeSnapshot {
  return snapshot;
}
