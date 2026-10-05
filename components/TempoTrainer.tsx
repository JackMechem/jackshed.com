"use client";

import { useEffect, useSyncExternalStore } from "react";
import BeatIndicator from "@/components/BeatIndicator";
import PanelsToggle from "@/components/PanelsToggle";
import CollapsiblePanel from "@/components/CollapsiblePanel";
import { MeterOptions, SoundOptions, SteppedField, TempoHero } from "@/components/MeterFields";
import { EyeOffIcon, MeterIcon, SpeakerIcon } from "@/components/tools";
import ToolLayout from "@/components/ToolLayout";
import KeyHint from "@/components/KeyHint";
import { type BeatLevel, DEFAULT_CLICK_SOUND_ID } from "@/lib/clickEngine";
import { MAX_BEATS } from "@/lib/meters";
import {
  NEXT_LEVEL,
  accentsFromGroups,
  clampBpm,
  defaultAccents,
  defaultSubAccents,
  nearestNoteValue,
  useTapTempo,
} from "@/lib/meterControls";
import {
  getTempoTrainerServerSnapshot,
  getTempoTrainerSnapshot,
  startTempoTrainer,
  stopTempoTrainer,
  subscribeTempoTrainer,
  updateTempoTrainerSettings,
} from "@/lib/tempoTrainerEngine";
import { useSyncedSettings } from "@/lib/useSyncedSettings";
import { useSpaceToggle } from "@/lib/useSpaceToggle";

// A silent stretch this long would make the tool pointless (you'd just be practicing with the
// click on) at one end, and impractical to configure at the other — the same "generous but
// bounded" reasoning Polyrhythm Metric Modulation Metronome's own "Bars between modulations"
// field uses for its own cap.
const MAX_CYCLE_BARS = 32;

const PANEL_IDS = ["tempo-trainer-meter", "tempo-trainer-cycle", "tempo-trainer-sound"];
const SETTINGS_KEY = "jam-practice-tempo-trainer";
const DEFAULT_SETTINGS = {
  bpm: 100,
  beatsPerBar: 4,
  beatUnit: 4,
  accents: [2, 1, 1, 1] as BeatLevel[],
  subdivision: 1,
  subAccents: [] as BeatLevel[],
  volume: 0.8,
  soundId: DEFAULT_CLICK_SOUND_ID,
  // 4 bars audible, 4 muted is a reasonable, generically useful starting cycle — long enough to
  // establish the tempo before it disappears, short enough that losing it is quick to notice.
  onBars: 4,
  offBars: 4,
};

export default function TempoTrainer() {
  const [settings, updateSettings] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const bpm = clampBpm(settings.bpm);
  const beatsPerBar = Math.min(MAX_BEATS, Math.max(1, Math.round(settings.beatsPerBar)));
  const beatUnit = nearestNoteValue(settings.beatUnit);
  const { subdivision, volume, soundId, onBars, offBars } = settings;
  const accents = defaultAccents(beatsPerBar, settings.accents);
  const subAccents = defaultSubAccents(beatsPerBar, subdivision, settings.subAccents);

  const setBpm = (value: number) => updateSettings({ bpm: clampBpm(value) });
  const setBeatUnit = (beatUnit: number) => updateSettings({ beatUnit });
  const setSubdivision = (subdivision: number) => updateSettings({ subdivision });
  const setVolume = (volume: number) => updateSettings({ volume });
  const setSoundId = (soundId: string) => updateSettings({ soundId });

  // The actual engine — click scheduling, running state, and which on/off phase is currently
  // playing — lives in `lib/tempoTrainerEngine.ts`, independent of this component's own mount
  // lifecycle (see that file's own doc comment, and `lib/metronomeEngine.ts`'s, for why). This
  // component is just a view over it.
  const engineState = useSyncExternalStore(
    subscribeTempoTrainer,
    getTempoTrainerSnapshot,
    getTempoTrainerServerSnapshot,
  );
  const { running, phase, currentBeat, currentSub } = engineState;

  useEffect(() => {
    updateTempoTrainerSettings({
      bpm,
      beatsPerBar,
      accents,
      subdivision,
      subAccents,
      volume,
      soundId,
      onBars,
      offBars,
    });
  }, [bpm, beatsPerBar, accents, subdivision, subAccents, volume, soundId, onBars, offBars]);

  function start() {
    startTempoTrainer();
  }

  const stop = stopTempoTrainer;

  useSpaceToggle(running ? stop : start);
  const tap = useTapTempo(setBpm);

  function changeBeats(n: number) {
    updateSettings({ beatsPerBar: n, accents: defaultAccents(n, accents) });
  }

  function cycleBeat(index: number) {
    updateSettings({
      accents: accents.map((level, i) => (i === index ? NEXT_LEVEL[level] : level)),
    });
  }

  function cycleSub(beatIndex: number, subIndex: number) {
    const dotCount = Math.max(0, Math.round(subdivision) - 1);
    const flatIndex = beatIndex * dotCount + subIndex;
    updateSettings({
      subAccents: subAccents.map((level, i) => (i === flatIndex ? NEXT_LEVEL[level] : level)),
    });
  }

  // Nothing about time shows at all during a silent stretch — not the beat strip (which would
  // still reveal exactly where in the bar playback is, even without the click), not a bar
  // countdown, nothing animated — per the whole point of this tool: finding out whether you can
  // actually hold the tempo without any cue, visual or audible. Idle (never started) and the
  // audible phase both show the normal, editable beat strip, same as a plain metronome always has.
  const silentNow = running && phase === "off";

  return (
    <ToolLayout
      title="Tempo Trainer"
      options={
        <>
          <PanelsToggle ids={PANEL_IDS} />

          <CollapsiblePanel id="tempo-trainer-meter" title="Meter & subdivision" icon={MeterIcon}>
            <MeterOptions
              beatsPerBar={beatsPerBar}
              beatUnit={beatUnit}
              accents={accents}
              subdivision={subdivision}
              onChangeBeats={changeBeats}
              onSetBeatUnit={setBeatUnit}
              onSetSubdivision={setSubdivision}
              onApplyGroups={(groups) =>
                updateSettings({
                  beatsPerBar: groups.reduce((a, b) => a + b, 0),
                  accents: accentsFromGroups(groups),
                })
              }
            />
          </CollapsiblePanel>

          <CollapsiblePanel id="tempo-trainer-cycle" title="Mute cycle" icon={EyeOffIcon}>
            <SteppedField
              label="Bars audible"
              value={onBars}
              min={1}
              max={MAX_CYCLE_BARS}
              layout="row"
              disabled={running}
              onChange={(onBars) => updateSettings({ onBars })}
              hint="How many bars the click plays before it cuts out."
            />
            <SteppedField
              label="Bars muted"
              value={offBars}
              min={1}
              max={MAX_CYCLE_BARS}
              layout="row"
              disabled={running}
              onChange={(offBars) => updateSettings({ offBars })}
              hint="How many bars stay silent — with no beat shown either — before the click comes back. Keep the tempo going on your own until it does."
            />
          </CollapsiblePanel>

          <CollapsiblePanel id="tempo-trainer-sound" title="Sound" icon={SpeakerIcon}>
            <SoundOptions
              soundId={soundId}
              setSoundId={setSoundId}
              volume={volume}
              setVolume={setVolume}
            />
          </CollapsiblePanel>
        </>
      }
    >
      <div className="flex w-full flex-col items-center gap-4">
        <TempoHero bpm={bpm} setBpm={setBpm} beatsPerBar={beatsPerBar} beatUnit={beatUnit} onTap={tap} />
        {silentNow ? (
          <div className="flex h-16 w-full max-w-xs flex-col items-center justify-center gap-1.5 rounded-xl bg-surface px-4 py-3 text-center">
            <EyeOffIcon className="h-5 w-5 text-muted" />
            <span className="text-sm font-medium text-muted">
              Keep the tempo going — the click will come back
            </span>
          </div>
        ) : (
          <BeatIndicator
            accents={accents}
            currentBeat={running ? currentBeat : null}
            onCycle={cycleBeat}
            subdivision={subdivision}
            subAccents={subAccents}
            currentSub={currentSub}
            onCycleSub={cycleSub}
          />
        )}
      </div>

      <button
        type="button"
        onClick={running ? stop : start}
        className={`rounded-full px-8 py-3 text-base font-semibold transition-colors ${
          running
            ? "bg-surface hover:bg-surface-hover"
            : "bg-accent text-accent-foreground hover:bg-accent-hover"
        }`}
      >
        {running ? "Stop" : "Start"}
      </button>
      <KeyHint>
        Press <KeyHint.Key>Space</KeyHint.Key> to start or stop
      </KeyHint>
    </ToolLayout>
  );
}
