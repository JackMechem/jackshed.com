/**
 * Metronome's actual click-scheduling engine, state, and structure-advance logic — moved out of
 * `components/Metronome.tsx` into this plain module (no React), the same shape
 * `lib/practiceTimerEngine.ts` already uses for Practice Timer's own background engine. This is
 * what actually lets the metronome keep ticking after you navigate away: nothing here is tied to
 * any component's mount lifecycle, so the component unmounting (normal Next.js routing) has no
 * effect on it at all. `Metronome.tsx` is now just a view — it reads this module's snapshot via
 * `useSyncExternalStore` and pushes its own synced settings into it, the same way it used to push
 * them into a local `useRef`.
 *
 * (An earlier attempt at this feature tried to keep the *component* itself alive across
 * navigation — via `createPortal` into a container outside the page's own DOM tree — rather than
 * moving the engine out of React. That turned out not to work: instance-id tracing showed React
 * tearing down and remounting the portaled component's state at the exact moment a client-side
 * navigation commits, reproducible even in a production build, regardless of how the portal was
 * structured. Moving the actual state here, so the view's own mount/unmount stops mattering at
 * all, is what actually solves it — the same reason Practice Timer's own background engine
 * already worked before this feature existed.)
 */

import {
  type BeatLevel,
  type ClickEngine,
  type ClickSettings,
  startClickEngine,
} from "@/lib/clickEngine";
import { convertTempo, defaultAccents, defaultSubAccents } from "@/lib/meterControls";
import { EMPTY_STRUCTURE, type Structure, sectionAt } from "@/lib/structure";

export interface MetronomeSettingsInput {
  bpm: number;
  beatsPerBar: number;
  beatUnit: number;
  accents: BeatLevel[];
  subdivision: number;
  subAccents: BeatLevel[];
  volume: number;
  soundId: string;
  tempoNoteValue: number | null;
}

export interface MetronomeStructureInput {
  useStructure: boolean;
  structure: Structure;
}

export interface MetronomeSnapshot {
  running: boolean;
  currentBeat: number | null;
  currentSub: number;
  /** What `BeatIndicator` should actually show right now — the plain meter's own accents, or (in
      structure mode) whichever section is currently playing. Computed here, not just in the
      component, so a Dock preview can show the same thing while the real page isn't mounted. */
  displayAccents: BeatLevel[];
  displaySubdivision: number;
  displaySubAccents: BeatLevel[];
  activeSectionName: string | null;
  activeSectionBars: number;
  barInSection: number;
  /** The raw form index a structure is currently on (or last was) — `Metronome.tsx` resolves this
      back into a full section object (id, beatUnit, ...) via `sectionAt`, since it already has
      `structure` from its own synced settings and doesn't need this module to duplicate those
      fields just for its own UI. */
  formIndex: number;
}

let settings: MetronomeSettingsInput = {
  bpm: 100,
  beatsPerBar: 4,
  beatUnit: 4,
  accents: [2, 1, 1, 1],
  subdivision: 1,
  subAccents: [],
  volume: 0.8,
  soundId: "classic",
  tempoNoteValue: null,
};
let structureInput: MetronomeStructureInput = { useStructure: false, structure: EMPTY_STRUCTURE };

let engine: ClickEngine | null = null;
let running = false;
let currentBeat: number | null = null;
let currentSub = 0;
let structFormIndex = 0;
let structBarsInto = 0;
let structSeenFirst = false;

function computeDisplay(): Pick<
  MetronomeSnapshot,
  "displayAccents" | "displaySubdivision" | "displaySubAccents" | "activeSectionName" | "activeSectionBars" | "barInSection"
> {
  const { useStructure, structure } = structureInput;
  const activeSection =
    useStructure && structure.form.length > 0 ? sectionAt(structure, structFormIndex) : null;
  if (activeSection) {
    return {
      displayAccents: defaultAccents(activeSection.beatsPerBar, activeSection.accents),
      displaySubdivision: activeSection.subdivision,
      displaySubAccents: defaultSubAccents(
        activeSection.beatsPerBar,
        activeSection.subdivision,
        activeSection.subAccents,
      ),
      activeSectionName: activeSection.name,
      activeSectionBars: activeSection.bars,
      barInSection: structBarsInto,
    };
  }
  return {
    displayAccents: settings.accents,
    displaySubdivision: settings.subdivision,
    displaySubAccents: settings.subAccents,
    activeSectionName: null,
    activeSectionBars: 0,
    barInSection: 0,
  };
}

function buildSnapshot(): MetronomeSnapshot {
  return { running, currentBeat, currentSub, formIndex: structFormIndex, ...computeDisplay() };
}

let cachedSnapshot = buildSnapshot();
const SERVER_SNAPSHOT = cachedSnapshot;
const listeners = new Set<() => void>();

function notify() {
  cachedSnapshot = buildSnapshot();
  for (const listener of listeners) listener();
}

export function subscribeMetronome(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getMetronomeSnapshot(): MetronomeSnapshot {
  return cachedSnapshot;
}

export function getMetronomeServerSnapshot(): MetronomeSnapshot {
  return SERVER_SNAPSHOT;
}

/** Called from `Metronome.tsx` whenever its synced settings change — the exact same "push the
    latest values into a ref `getSettings` reads from" idea the component used to do locally,
    just targeting this module instead. Deliberately doesn't `notify()`: the component already
    re-renders from its own settings state (it never reads `bpm`/`accents`/... back out of this
    snapshot, only `running`/`currentBeat`/...), and the Dock preview that *does* read the
    snapshot's `display*` fields is only ever shown while this page isn't mounted at all, i.e.
    while nothing could be calling this in the first place — the next real `notify()` (a tick,
    start, or stop) picks up whatever was last pushed here regardless. Notifying anyway would
    cause a real infinite loop: `accents`/`subAccents` are freshly computed arrays on every
    render (`defaultAccents`/`defaultSubAccents`), so the effect that calls this would never stop
    re-firing once a `useSyncExternalStore`-driven re-render were added to the mix (confirmed
    directly — an earlier version of this function did call `notify()` and reliably triggered
    React's "Maximum update depth exceeded" the instant the metronome page mounted). */
export function updateMetronomeSettings(next: MetronomeSettingsInput) {
  settings = next;
}

export function updateMetronomeStructure(next: MetronomeStructureInput) {
  structureInput = next;
}

/**
 * Called by the click engine right as it schedules each tick. Off (or with an empty form), this
 * is just the plain single meter, converted from the displayed tempo to an actual click rate via
 * `tempoNoteValue`. With a structure running, `beat === 0 && sub === 0` (the instant a new bar
 * starts) is when it decides whether the *current* form entry has finished its bar count and, if
 * so, advances to the next one (looping back to the start past the end).
 */
function getSettingsForTick(beat: number, sub: number): ClickSettings {
  const base = settings;
  const { useStructure: active, structure: struct } = structureInput;

  const plain = (): ClickSettings => ({
    bpm: base.tempoNoteValue ? convertTempo(base.bpm, base.tempoNoteValue, base.beatUnit) : base.bpm,
    beatsPerBar: base.beatsPerBar,
    accents: base.accents,
    subdivision: base.subdivision,
    subAccents: base.subAccents,
    volume: base.volume,
    soundId: base.soundId,
  });

  if (!active || struct.form.length === 0) return plain();

  if (beat === 0 && sub === 0) {
    if (!structSeenFirst) {
      structSeenFirst = true;
    } else {
      const current = sectionAt(struct, structFormIndex);
      const barsInSection = current?.bars ?? 1;
      const barsElapsed = structBarsInto + 1;
      if (barsElapsed < barsInSection) {
        structBarsInto = barsElapsed;
      } else {
        structBarsInto = 0;
        structFormIndex = (structFormIndex + 1) % struct.form.length;
      }
    }
    notify();
  }

  const section = sectionAt(struct, structFormIndex);
  if (!section) return plain();
  return {
    bpm: base.tempoNoteValue ? convertTempo(base.bpm, base.tempoNoteValue, section.beatUnit) : base.bpm,
    beatsPerBar: section.beatsPerBar,
    accents: defaultAccents(section.beatsPerBar, section.accents),
    subdivision: section.subdivision,
    subAccents: defaultSubAccents(section.beatsPerBar, section.subdivision, section.subAccents),
    volume: base.volume,
    soundId: base.soundId,
  };
}

function handleBeat(beat: number, sub: number) {
  currentBeat = beat;
  currentSub = sub;
  notify();
}

export function startMetronome() {
  engine?.stop();
  structFormIndex = 0;
  structBarsInto = 0;
  structSeenFirst = false;
  running = true;
  engine = startClickEngine([{ getSettings: getSettingsForTick, onBeat: handleBeat }]);
  notify();
}

export function stopMetronome() {
  engine?.stop();
  engine = null;
  running = false;
  currentBeat = null;
  currentSub = 0;
  structFormIndex = 0;
  structBarsInto = 0;
  structSeenFirst = false;
  notify();
}
