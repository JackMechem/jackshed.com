"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import BeatIndicator from "@/components/BeatIndicator";
import CollapsiblePanel from "@/components/CollapsiblePanel";
import LoadingSpinner from "@/components/LoadingSpinner";
import {
  MeterOptions,
  SoundOptions,
  SteppedField,
  TempoHero,
  TempoNoteConversionHint,
  TempoNoteValuePicker,
} from "@/components/MeterFields";
import PanelsToggle from "@/components/PanelsToggle";
import { RecordingCard, SaveTakeDialog } from "@/components/recordings/RecordingParts";
import StructureEditor from "@/components/StructureEditor";
import SwitchRow from "@/components/SwitchRow";
import ToolLayout from "@/components/ToolLayout";
import { MeterIcon, MetronomeIcon, SpeakerIcon, StopIcon } from "@/components/tools";
import { type BeatLevel, DEFAULT_CLICK_SOUND_ID } from "@/lib/clickEngine";
import {
  NEXT_LEVEL,
  accentsFromGroups,
  clampBpm,
  defaultAccents,
  defaultSubAccents,
  nearestNoteValue,
  useTapTempo,
} from "@/lib/meterControls";
import { getMetronomeServerSnapshot, getMetronomeSnapshot, subscribeMetronome } from "@/lib/metronomeEngine";
import { MAX_BEATS } from "@/lib/meters";
import {
  type FinishedTake,
  type RecorderMetronome,
  clearRecorderError,
  getRecorderServerSnapshot,
  getRecorderSnapshot,
  startRecording,
  stopRecording,
  subscribeRecorder,
  updateRecorderMetronome,
} from "@/lib/recorderEngine";
import { formatDuration, recordingsApi, useTuneIndex } from "@/lib/recordings";
import { EMPTY_STRUCTURE, type Structure, cycleSectionAccent, cycleSectionSubAccent, sectionAt } from "@/lib/structure";
import { useSyncedSettings } from "@/lib/useSyncedSettings";

const PANEL_IDS = ["recorder-meter", "recorder-countin", "recorder-sound"];
// The same key and shape as the app's Recorder, so settings follow you between the two. Everything
// from `bpm` on is the Metronome tool's own settings shape.
const SETTINGS_KEY = "jam-practice-recorder-take";
const DEFAULT_SETTINGS = {
  autoGain: true,
  metronome: false,
  countInBars: 1,
  bpm: 100,
  beatsPerBar: 4,
  beatUnit: 4,
  accents: [2, 1, 1, 1] as BeatLevel[],
  subdivision: 1,
  subAccents: [] as BeatLevel[],
  volume: 0.8,
  soundId: DEFAULT_CLICK_SOUND_ID,
  useStructure: false,
  structure: EMPTY_STRUCTURE as Structure,
  tempoNoteValue: 4 as number | null,
};

/**
 * The Recorder — one take at a time (it replaced the old multitrack recorder), with the metronome
 * optionally clicking along and counting you in. The metronome is the full Metronome tool: tempo,
 * time signature, the clickable beat strip, and the same options (meter, accent grouping,
 * subdivision, tempo note value, structures, sound). Stopping opens the save dialog — name, notes,
 * tune — and saved takes live on the account (`convex/recordings.ts`), shared with the app.
 * `tuneId` (from a tune's page) records for that tune, with the metronome at the tune's tempo.
 */
export default function Recorder({ tuneId }: { tuneId?: string }) {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [settings, updateSettings] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const byId = useTuneIndex();
  const tune = tuneId ? byId.get(tuneId)?.tune : undefined;
  const recordings = useQuery(recordingsApi.list, isAuthenticated ? {} : "skip");

  // From a tune's page, the metronome starts at the tune's own tempo (not saved as the default).
  const tuneTempo = tune?.tempos.find((t) => t.enabled)?.value ?? tune?.tempos[0]?.value;
  const [bpmOverride, setBpmOverride] = useState<number | null>(null);
  const bpm = clampBpm(bpmOverride ?? tuneTempo ?? settings.bpm);
  const setBpm = (next: number) => (tuneTempo !== undefined ? setBpmOverride(clampBpm(next)) : updateSettings({ bpm: clampBpm(next) }));
  const tap = useTapTempo(setBpm);

  const beatsPerBar = Math.min(MAX_BEATS, Math.max(1, Math.round(settings.beatsPerBar)));
  const beatUnit = nearestNoteValue(settings.beatUnit);
  const { subdivision, volume, soundId, useStructure, structure, tempoNoteValue } = settings;
  const accents = defaultAccents(beatsPerBar, settings.accents);
  const subAccents = defaultSubAccents(beatsPerBar, subdivision, settings.subAccents);

  const rec = useSyncExternalStore(subscribeRecorder, getRecorderSnapshot, getRecorderServerSnapshot);
  const busy = rec.phase !== "idle";
  const click = useSyncExternalStore(subscribeMetronome, getMetronomeSnapshot, getMetronomeServerSnapshot);
  const clicking = busy && settings.metronome && click.running;
  const [take, setTake] = useState<FinishedTake | null>(null);

  // Tempo, accents, sound… changed mid-take apply live, like in the Metronome tool.
  useEffect(() => {
    updateRecorderMetronome({
      enabled: true,
      settings: { bpm, beatsPerBar, beatUnit, accents, subdivision, subAccents, volume, soundId, tempoNoteValue },
      structure: { useStructure, structure },
      countInBars: 0,
    });
  }, [bpm, beatsPerBar, beatUnit, accents, subdivision, subAccents, volume, soundId, tempoNoteValue, useStructure, structure]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (rec.phase !== "recording") return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [rec.phase]);
  const elapsed = rec.phase === "recording" && rec.startedAt ? (now - rec.startedAt) / 1000 : 0;

  async function onRecord() {
    if (rec.phase === "idle") {
      clearRecorderError();
      const metronome: RecorderMetronome = {
        enabled: settings.metronome && (!useStructure || structure.form.length > 0),
        settings: { bpm, beatsPerBar, beatUnit, accents, subdivision, subAccents, volume, soundId, tempoNoteValue },
        structure: { useStructure, structure },
        countInBars: settings.countInBars,
      };
      await startRecording(metronome, { autoGain: settings.autoGain });
      return;
    }
    if (rec.phase === "finishing") return;
    const finished = await stopRecording();
    if (finished) setTake(finished);
  }

  // --- the Metronome tool's accent/structure editing ---
  function changeBeats(n: number) {
    updateSettings({ beatsPerBar: n, accents: defaultAccents(n, accents) });
  }
  const activeSection = useStructure && structure.form.length > 0 ? sectionAt(structure, clicking ? click.formIndex : 0) : null;
  const displayAccents = activeSection ? defaultAccents(activeSection.beatsPerBar, activeSection.accents) : accents;
  const displaySubdivision = activeSection ? activeSection.subdivision : subdivision;
  const displaySubAccents = activeSection
    ? defaultSubAccents(activeSection.beatsPerBar, activeSection.subdivision, activeSection.subAccents)
    : subAccents;
  function handleCycleBeat(index: number) {
    if (activeSection) return updateSettings({ structure: cycleSectionAccent(structure, activeSection.id, index) });
    updateSettings({ accents: accents.map((level, i) => (i === index ? NEXT_LEVEL[level] : level)) });
  }
  function handleCycleSub(beatIndex: number, subIndex: number) {
    if (activeSection) return updateSettings({ structure: cycleSectionSubAccent(structure, activeSection.id, beatIndex, subIndex) });
    const flatIndex = beatIndex * Math.max(0, Math.round(subdivision) - 1) + subIndex;
    updateSettings({ subAccents: subAccents.map((level, i) => (i === flatIndex ? NEXT_LEVEL[level] : level)) });
  }

  const status =
    rec.phase === "countin" ? "Count-in…" : rec.phase === "recording" ? "Recording" : rec.phase === "finishing" ? "Finishing the take…" : tune ? `For “${tune.name}”` : "Ready";

  const options = (
    <>
      <PanelsToggle ids={PANEL_IDS} />
      <CollapsiblePanel id="recorder-meter" title="Meter & subdivision" icon={MeterIcon}>
        <SwitchRow
          label="Use a structure"
          checked={useStructure}
          onChange={(v) => updateSettings({ useStructure: v })}
          disabled={busy}
          hint="Chain bars of different time signatures in a fixed, looping sequence — e.g. 2 bars of 11/8, then a bar of 12/8 — instead of one meter for the whole take."
        />
        {useStructure ? (
          <StructureEditor
            structure={structure}
            onChange={(s) => updateSettings({ structure: s })}
            running={clicking}
            activeFormIndex={clicking ? click.formIndex : null}
            playingBeat={click.currentBeat}
            playingSub={click.currentSub}
          />
        ) : (
          <MeterOptions
            beatsPerBar={beatsPerBar}
            beatUnit={beatUnit}
            accents={accents}
            subdivision={subdivision}
            onChangeBeats={changeBeats}
            onSetBeatUnit={(u) => updateSettings({ beatUnit: u })}
            onSetSubdivision={(s) => updateSettings({ subdivision: s })}
            onApplyGroups={(groups) => updateSettings({ beatsPerBar: groups.reduce((a, b) => a + b, 0), accents: accentsFromGroups(groups) })}
          />
        )}
      </CollapsiblePanel>
      <CollapsiblePanel id="recorder-countin" title="Count-in" icon={MetronomeIcon}>
        <SteppedField
          label="Count-in bars"
          value={settings.countInBars}
          min={0}
          max={4}
          layout="row"
          disabled={busy}
          onChange={(n) => updateSettings({ countInBars: n })}
          hint="With the metronome on, this many bars click before the recording starts, so you come in on the downbeat."
        />
      </CollapsiblePanel>
      <CollapsiblePanel id="recorder-sound" title="Metronome sound" icon={SpeakerIcon}>
        <SoundOptions soundId={soundId} setSoundId={(id) => updateSettings({ soundId: id })} volume={volume} setVolume={(v) => updateSettings({ volume: v })} />
      </CollapsiblePanel>
    </>
  );

  if (isLoading) {
    return (
      <ToolLayout title="Recorder" options={null}>
        <LoadingSpinner />
      </ToolLayout>
    );
  }

  if (!isAuthenticated) {
    return (
      <ToolLayout title="Recorder" options={null}>
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <p className="text-muted">
            Recordings are saved to your account, so you can play them back on any device — here or in the app. Sign in (bottom of the sidebar) to start recording.
          </p>
        </div>
      </ToolLayout>
    );
  }

  return (
    <ToolLayout title="Recorder" options={options}>
      <div className="flex w-full max-w-xl flex-col items-center gap-6">
        <div className="flex flex-col items-center gap-2">
          <p className={`text-sm font-semibold ${rec.phase === "recording" ? "text-danger" : "text-muted"}`}>{status}</p>
          <p className="text-6xl font-extrabold tabular-nums">{formatDuration(elapsed)}</p>
          <div className="h-2 w-48 overflow-hidden rounded-full bg-surface-hover">
            <div
              className={`h-full rounded-full ${rec.level > 0.85 ? "bg-danger" : "bg-accent"}`}
              style={{ width: `${Math.round((rec.phase === "recording" ? rec.level : 0) * 100)}%` }}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => void onRecord()}
          aria-label={busy ? "Stop recording" : "Start recording"}
          className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-surface-hover transition-transform hover:scale-105"
        >
          {busy ? (
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-danger text-white">
              <StopIcon className="h-6 w-6" />
            </span>
          ) : (
            <span className="h-[74px] w-[74px] rounded-full bg-danger" />
          )}
        </button>
        {rec.error && <p className="text-sm text-danger">{rec.error}</p>}

        <div className="w-60">
          <SwitchRow
            label="Auto gain"
            checked={settings.autoGain}
            onChange={(v) => updateSettings({ autoGain: v })}
            disabled={busy}
            hint="On: the browser sets the recording level automatically, so quiet playing still comes out at a good volume. Off: the raw microphone — truer dynamics, but quieter."
          />
        </div>

        <section className="flex w-full flex-col items-center gap-4 rounded-3xl border border-surface-hover p-4">
          <div className="flex w-full items-center gap-2">
            <MetronomeIcon className="h-5 w-5 text-muted" />
            <div className="flex-1">
              <SwitchRow label="Metronome" checked={settings.metronome} onChange={(v) => updateSettings({ metronome: v })} disabled={busy} />
            </div>
          </div>
          {settings.metronome && (
            <>
              <TempoHero
                bpm={bpm}
                setBpm={setBpm}
                beatsPerBar={activeSection?.beatsPerBar ?? beatsPerBar}
                beatUnit={activeSection?.beatUnit ?? beatUnit}
                onTap={tap}
                aboveNumber={<TempoNoteValuePicker value={tempoNoteValue} onChange={(v) => updateSettings({ tempoNoteValue: v })} />}
              />
              <TempoNoteConversionHint bpm={bpm} tempoNoteValue={tempoNoteValue} effectiveBeatUnit={activeSection?.beatUnit ?? beatUnit} />
              {useStructure && !activeSection ? (
                <p className="rounded-xl bg-surface px-4 py-3 text-center text-sm text-muted">Add sections and arrange a form in the options to see beats here.</p>
              ) : (
                <BeatIndicator
                  accents={displayAccents}
                  currentBeat={clicking ? click.currentBeat : null}
                  onCycle={handleCycleBeat}
                  subdivision={displaySubdivision}
                  subAccents={displaySubAccents}
                  currentSub={clicking ? click.currentSub : 0}
                  onCycleSub={handleCycleSub}
                />
              )}
              <p className="text-xs text-muted">The click plays through your speakers, so the microphone picks it up unless you wear headphones.</p>
            </>
          )}
        </section>

        <section className="flex w-full flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold">Recent recordings</h2>
            <Link href="/recordings" className="text-sm font-medium text-accent hover:underline">
              All recordings{recordings ? ` (${recordings.length})` : ""}
            </Link>
          </div>
          {recordings === undefined ? (
            <LoadingSpinner />
          ) : recordings.length === 0 ? (
            <p className="text-sm text-muted">No recordings yet.</p>
          ) : (
            recordings.slice(0, 3).map((r) => <RecordingCard key={r._id} recording={r} tuneName={r.tuneId ? byId.get(r.tuneId)?.tune.name : null} />)
          )}
        </section>
      </div>

      {take && (
        <SaveTakeDialog
          blob={take.blob}
          durationSec={take.durationSec}
          initialTuneId={tuneId ?? null}
          onDiscard={() => setTake(null)}
          onSaved={(id) => {
            setTake(null);
            if (tuneId) router.push(`/tunes/tune?id=${tuneId}`);
            else router.push(`/recordings/view?id=${id}`);
          }}
        />
      )}
    </ToolLayout>
  );
}
