"use client";

import { useEffect, useSyncExternalStore } from "react";
import { OptionsCard, OptionSection } from "@/components/OptionsCard";
import Select from "@/components/Select";
import StickControlStave from "@/components/StickControlStave";
import SwitchRow from "@/components/SwitchRow";
import AdvancedSlider from "@/components/AdvancedSlider";
import { SteppedField, SoundOptions, TempoHero } from "@/components/MeterFields";
import { ListIcon, RepeatIcon, SpeakerIcon } from "@/components/tools";
import ToolLayout from "@/components/ToolLayout";
import KeyHint from "@/components/KeyHint";
import Hint from "@/components/Hint";
import { DEFAULT_CLICK_SOUND_ID } from "@/lib/clickEngine";
import { clampBpm, useTapTempo } from "@/lib/meterControls";
import { ROLL_TYPES, type RollType, type StickControlOptions } from "@/lib/stickControl";
import {
  type ClickMode,
  type StickControlSettings,
  advanceStickControlPattern,
  getStickControlServerSnapshot,
  getStickControlSnapshot,
  regenerateStickControlPattern,
  startStickControl,
  stopStickControl,
  subscribeStickControl,
  updateStickControlOptions,
  updateStickControlSettings,
} from "@/lib/stickControlEngine";
import { useSyncedSettings } from "@/lib/useSyncedSettings";
import { useSpaceToggle } from "@/lib/useSpaceToggle";

const SETTINGS_KEY = "jam-practice-stick-control";

const DEFAULT_SETTINGS = {
  bpm: 100,
  rollType: "double" as RollType,
  volume: 0.8,
  soundId: DEFAULT_CLICK_SOUND_ID,
  clickMode: "pulse" as ClickMode,
  countOffBars: 1,
  // 20 repeats without stopping is a well-worn, generically useful default for a warmup like
  // this, not tied to any one specific set of instructions.
  repeats: 20,
  autoAdvance: false,
};

const CLICK_MODE_OPTIONS: { value: ClickMode; label: string }[] = [
  { value: "pulse", label: "Steady pulse (one click per beat)" },
  { value: "everyNote", label: "Click every stroke" },
  { value: "byHand", label: "Distinct pitch per hand (R/L)" },
];

export default function StickControl() {
  const [settings, updateSettings] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const bpm = clampBpm(settings.bpm);
  const { rollType, volume, soundId, clickMode, countOffBars, repeats, autoAdvance } = settings;

  const options: StickControlOptions = { rollType };
  const playbackSettings: StickControlSettings = {
    bpm,
    volume,
    soundId,
    clickMode,
    countOffBars,
    repeats,
    autoAdvance,
  };

  const snapshot = useSyncExternalStore(
    subscribeStickControl,
    getStickControlSnapshot,
    getStickControlServerSnapshot,
  );
  const { running, pattern, nextPattern, phase, currentBarIndex, currentRepeat } = snapshot;

  // Structural changes (what shape of pattern to show — currently just which roll type) regenerate
  // a fresh one immediately, mid-playback or not — the same "changing the meter restarts cleanly"
  // behavior Metronome's own structure mode has, needed here because the old pattern's own cell
  // makeup might not even match the new roll type anymore (a different cell count/rhythm, not just
  // different sticking).
  useEffect(() => {
    updateStickControlOptions(options);
    regenerateStickControlPattern();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rollType]);

  // Playback-only settings (tempo, sound, repeat count, ...) apply live without touching whatever
  // is currently mid-play, the same way Metronome's own bpm/volume/soundId do.
  useEffect(() => {
    updateStickControlSettings(playbackSettings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpm, volume, soundId, clickMode, countOffBars, repeats, autoAdvance]);

  const setBpm = (value: number) => updateSettings({ bpm: clampBpm(value) });
  const tap = useTapTempo(setBpm);

  function start() {
    startStickControl();
  }
  const stop = stopStickControl;
  useSpaceToggle(running ? stop : start);

  const phaseLabel =
    phase === "countoff"
      ? "Count-off…"
      : phase === "playing" && repeats > 1
        ? `Repeat ${currentRepeat} of ${repeats}`
        : phase === "playing"
          ? "Playing"
          : null;

  return (
    <ToolLayout
      title="Random Sticking Warmup"
      layout="stacked"
      topAligned
      options={
        <OptionsCard id="stick-control">
          <OptionSection title="Pattern" icon={ListIcon}>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Roll type</span>
              <Select
                value={rollType}
                onChange={(v) => updateSettings({ rollType: v })}
                options={ROLL_TYPES}
              />
            </label>
            <Hint>
              &quot;Single stroke roll&quot; is the same length/speed as the double-stroke roll,
              just plain alternating R/L instead of the RRLLRRLLR rudiment. &quot;Triplets&quot;
              writes the roll as 8th-note triplets instead, with a random sticking each time —
              straight alternation, or a broken-double shape (RRL or LLR) — rather than always the
              same rudiment.
            </Hint>
          </OptionSection>

          <OptionSection title="Playback" icon={RepeatIcon}>
            <SteppedField
              label="Count-off bars"
              value={countOffBars}
              min={0}
              max={4}
              layout="row"
              size="sm"
              minusOnRight
              onChange={(n) => updateSettings({ countOffBars: n })}
              hint="Plain metronome bars played before the pattern starts, so you come in on time."
            />
            <AdvancedSlider
              label="Repeat count"
              value={repeats}
              unit="x"
              min={1}
              max={100}
              step={1}
              onChange={(n) => updateSettings({ repeats: n })}
              hint="How many times the pattern repeats before stopping (or looping to a new one, with 'New pattern when done'). Defaults to 20."
            />
            <SwitchRow
              label="New pattern when done"
              checked={autoAdvance}
              onChange={(v) => updateSettings({ autoAdvance: v })}
              hint="After the repeat count finishes, automatically shuffle a new pattern and keep going (with a fresh count-off) instead of stopping."
            />
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Click</span>
              <Select
                value={clickMode}
                onChange={(v) => updateSettings({ clickMode: v })}
                options={CLICK_MODE_OPTIONS}
              />
            </label>
            <Hint>
              &quot;Distinct pitch per hand&quot; clicks a different pitch for every R vs. L
              stroke, so you can hear the sticking even without watching the notation.
            </Hint>
          </OptionSection>

          <OptionSection title="Sound" icon={SpeakerIcon}>
            <SoundOptions
              soundId={soundId}
              setSoundId={(v) => updateSettings({ soundId: v })}
              volume={volume}
              setVolume={(v) => updateSettings({ volume: v })}
            />
          </OptionSection>
        </OptionsCard>
      }
    >
      <div className="flex w-full flex-col items-center gap-4">
        <TempoHero bpm={bpm} setBpm={setBpm} beatsPerBar={4} beatUnit={4} onTap={tap} />

        {pattern && <StickControlStave pattern={pattern} activeBarIndex={currentBarIndex} />}

        {nextPattern && (
          <div className="flex w-full flex-col items-center gap-2">
            <p className="text-sm font-semibold text-muted">Next</p>
            <StickControlStave
              pattern={nextPattern}
              activeBarIndex={null}
              background="background"
            />
          </div>
        )}

        {phaseLabel && (
          <p className="text-sm font-semibold text-accent">{phaseLabel}</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => advanceStickControlPattern()}
          className="rounded-full bg-surface px-5 py-3 text-base font-semibold transition-colors hover:bg-surface-hover"
        >
          New pattern
        </button>
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
      </div>
      <KeyHint>
        Press <KeyHint.Key>Space</KeyHint.Key> to start or stop
      </KeyHint>
    </ToolLayout>
  );
}
