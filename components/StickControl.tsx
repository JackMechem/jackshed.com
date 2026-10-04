"use client";

import { useEffect, useSyncExternalStore } from "react";
import { OptionsCard, OptionSection } from "@/components/OptionsCard";
import Select from "@/components/Select";
import StickControlStave from "@/components/StickControlStave";
import SwitchRow from "@/components/SwitchRow";
import AdvancedSlider from "@/components/AdvancedSlider";
import { SteppedField, SoundOptions, TempoHero } from "@/components/MeterFields";
import { RepeatIcon, SpeakerIcon } from "@/components/tools";
import ToolLayout from "@/components/ToolLayout";
import KeyHint from "@/components/KeyHint";
import Hint from "@/components/Hint";
import { DEFAULT_CLICK_SOUND_ID } from "@/lib/clickEngine";
import { clampBpm, useTapTempo } from "@/lib/meterControls";
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
  updateStickControlSettings,
} from "@/lib/stickControlEngine";
import { useSyncedSettings } from "@/lib/useSyncedSettings";
import { useSpaceToggle } from "@/lib/useSpaceToggle";

const SETTINGS_KEY = "jam-practice-stick-control";

const DEFAULT_SETTINGS = {
  bpm: 100,
  volume: 0.8,
  soundId: DEFAULT_CLICK_SOUND_ID,
  clickMode: "pulse" as ClickMode,
  countOffBars: 1,
  // The book's own instruction: "practise each rhythm 20 TIMES WITHOUT STOPPING."
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
  const { volume, soundId, clickMode, countOffBars, repeats, autoAdvance } = settings;

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

  // Seeds the very first idle pattern (and its "next" preview) once on mount — nothing about the
  // pattern's own shape is configurable anymore (meter is always 4/4), so there's no longer a
  // "structural option changed, regenerate fresh" case to react to beyond this one-time seed.
  useEffect(() => {
    regenerateStickControlPattern();
  }, []);

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
      title="Random Stick Control Warmup"
      layout="stacked"
      topAligned
      credit="Patterns from George Lawrence Stone's Stick Control"
      options={
        <OptionsCard id="stick-control">
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
              hint='The book: "practise each rhythm 20 TIMES WITHOUT STOPPING." Defaults to 20.'
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

        {pattern && (
          <div className="flex w-full flex-col items-center gap-2">
            <p className="text-sm font-medium text-muted">{pattern.label}</p>
            <StickControlStave pattern={pattern} activeBarIndex={currentBarIndex} />
          </div>
        )}

        {nextPattern && (
          <div className="flex w-full flex-col items-center gap-2">
            <p className="text-xs font-medium text-muted">Next: {nextPattern.label}</p>
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
