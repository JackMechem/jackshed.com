"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ChordChart from "@/components/ChordChart";
import CollapsiblePanel from "@/components/CollapsiblePanel";
import Hint from "@/components/Hint";
import LoadingSpinner from "@/components/LoadingSpinner";
import Select from "@/components/Select";
import SwitchRow from "@/components/SwitchRow";
import ToolLayout from "@/components/ToolLayout";
import ChartLinkPicker from "@/components/library/ChartLinkPicker";
import BassPlayersTab from "@/components/bassgenius/BassPlayersTab";
import { TempoHero } from "@/components/MeterFields";
import { Segmented } from "@/components/metronome/MetronomeOptions";
import { BassIcon, ChordChartIcon, MetronomeIcon, PlayIcon, RepeatIcon, SpeakerIcon, StopIcon } from "@/components/tools";
import { BASS_PLAYERS, type BassFeel, type BassPlayerId, type BassTouch, type PerformedBeat } from "@/lib/bassLine";
import { startBassGenius, type BassGeniusRun } from "@/lib/bassGeniusEngine";
import { formatComposer, KEY_NAMES, prettyQuality, keyPitchClass, transposeSong } from "@/lib/iRealPro";
import { useTapTempo } from "@/lib/meterControls";
import { loadUprightBass, setUprightBassRoom, setUprightBassVolume, uprightBassReady } from "@/lib/uprightBass";
import { parseTypedProgression } from "@/lib/typedProgression";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";
import { useSyncedSettings } from "@/lib/useSyncedSettings";
import { useSpaceToggle } from "@/lib/useSpaceToggle";

type Settings = {
  /** Play along, or manage bass players and their transcriptions. */
  tab: "play" | "players";
  /** Play over one of your charts, or a progression typed in. */
  source: "chart" | "typed";
  chartId: string;
  /** The typed progression — chord names or roman numerals, "|" between bars. */
  typedText: string;
  /** Key the typed numerals are in (a `KEY_NAMES` entry). */
  typedKey: string;
  typedMeter: "4/4" | "3/4";
  player: BassPlayerId;
  feel: BassFeel;
  touch: BassTouch;
  bpm: number;
  /** 0 = keep going until stopped. */
  choruses: number;
  countIn: boolean;
  click: boolean;
  volume: number;
  room: boolean;
  /** "" = the chart's own key. */
  transposeKey: string;
};

const SETTINGS_KEY = "jam-practice-bass-genius";
const DEFAULT_SETTINGS: Settings = {
  tab: "play",
  source: "chart",
  chartId: "",
  typedText: "ii7 | V7 | Imaj7 | %",
  typedKey: "C",
  typedMeter: "4/4",
  player: "computer",
  feel: "walking",
  touch: "medium",
  bpm: 140,
  choruses: 0,
  countIn: true,
  click: false,
  volume: 0.85,
  room: true,
  transposeKey: "",
};

const CHORUS_OPTIONS = [
  { value: 0, label: "Keep going" },
  ...[1, 2, 3, 4, 6, 8].map((n) => ({ value: n, label: n === 1 ? "Once through" : `${n} choruses` })),
];
/** Starting points for the typed progression. */
const PRESETS: { label: string; text: string }[] = [
  { label: "ii–V–I", text: "ii7 | V7 | Imaj7 | %" },
  { label: "Minor ii–V–i", text: "iiø7 | V7b9 | i-6 | %" },
  { label: "I–vi–ii–V", text: "Imaj7 | vi7 | ii7 | V7" },
  { label: "Jazz blues", text: "I7 | IV7 | I7 | v7 I7 | IV7 | #ivo7 | I7 | VI7 | ii7 | V7 | I7 VI7 | ii7 V7" },
  { label: "Rhythm changes A", text: "Imaj7 vi7 | ii7 V7 | iii7 VI7 | ii7 V7 | v7 I7 | IV7 #ivo7 | iii7 VI7 | ii7 V7" },
];
const METERS = { "4/4": { top: 4, bottom: 4 }, "3/4": { top: 3, bottom: 4 } } as const;

const TOUCH_OPTIONS: { value: BassTouch; label: string }[] = [
  { value: "soft", label: "Soft" },
  { value: "medium", label: "Medium" },
  { value: "strong", label: "Strong" },
];

/**
 * Bass Genius: pick one of your chord charts and a sampled jazz upright walks (or plays a two-feel
 * over) the changes, following the chart's repeats, endings and D.C./coda. The bass line is
 * written by a "player" (`packages/core/bassLine.ts`) — just "Computer" for now; players modelled
 * on real bassists come later.
 */
export default function BassGenius() {
  const [settings, update] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const { tab, source, chartId, typedText, typedKey, typedMeter, player, feel, touch, bpm, choruses, countIn, click, volume, room, transposeKey } = settings;
  const typed = source === "typed";
  const { selectedSong, selectedSongLoading, allSongs, loading } = useChordChartsLibrary(!typed && chartId ? chartId : null);
  const meta = allSongs.find((s) => s.id === chartId) ?? null;

  const chartSong = useMemo(() => {
    if (!selectedSong || !transposeKey) return selectedSong;
    const semis = (KEY_NAMES.indexOf(transposeKey) - keyPitchClass(selectedSong.key) + 12) % 12;
    return semis ? transposeSong(selectedSong, semis) : selectedSong;
  }, [selectedSong, transposeKey]);
  const typedResult = useMemo(
    () => parseTypedProgression(typedText, Math.max(0, KEY_NAMES.indexOf(typedKey)), METERS[typedMeter] ?? METERS["4/4"]),
    [typedText, typedKey, typedMeter],
  );
  const song = typed ? typedResult.song : chartSong;


  const [picking, setPicking] = useState(false);
  const [running, setRunning] = useState(false);
  const [download, setDownload] = useState<number | null>(uprightBassReady() ? 1 : null);
  const [loadError, setLoadError] = useState(false);
  const [now, setNow] = useState<{ beat: number; info: PerformedBeat | null } | null>(null);
  const runRef = useRef<BassGeniusRun | null>(null);
  const startingRef = useRef(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => setUprightBassVolume(volume), [volume]);
  useEffect(() => setUprightBassRoom(room), [room]);
  useEffect(() => runRef.current?.setBpm(bpm), [bpm]);
  useEffect(() => runRef.current?.setClick(click), [click]);
  useEffect(() => () => runRef.current?.stop(), []);

  const stop = useCallback(() => {
    runRef.current?.stop();
    runRef.current = null;
    startingRef.current = false;
    setStarting(false);
    setRunning(false);
    setNow(null);
  }, []);

  // Editing the typed progression while it plays takes over from the next time through.
  useEffect(() => {
    if (typed && typedResult.song) runRef.current?.setSong(typedResult.song);
  }, [typed, typedResult.song]);
  const switchSource = (next: "chart" | "typed") => {
    if (next === source) return;
    stop();
    update({ source: next });
  };

  const start = useCallback(async () => {
    if (!song || startingRef.current) return;
    startingRef.current = true;
    setStarting(true);
    setLoadError(false);
    try {
      await loadUprightBass(setDownload);
    } catch {
      setLoadError(true);
      startingRef.current = false;
      setStarting(false);
      return;
    }
    if (!startingRef.current) return; // stopped while downloading
    setUprightBassVolume(volume);
    setUprightBassRoom(room);
    runRef.current = startBassGenius({
      song,
      line: { player, feel, touch },
      bpm,
      choruses,
      countIn,
      click,
      onBeat: (beat, info) => setNow({ beat, info }),
      onEnd: () => {
        runRef.current = null;
        startingRef.current = false;
        setStarting(false);
        setRunning(false);
        setNow(null);
      },
    });
    setStarting(false);
    setRunning(true);
  }, [song, player, feel, touch, bpm, choruses, countIn, click, volume, room]);


  const toggle = useCallback(() => (running || starting ? stop() : void start()), [running, starting, start, stop]);
  useSpaceToggle(toggle);
  const tap = useTapTempo((v) => update({ bpm: v }));

  const downloading = starting && !running;
  const activeBar = running && now && now.info ? now.info.bar : null;
  const countingIn = running && now !== null && now.beat < 0;
  const ts = song?.timeSignature ?? { top: 4, bottom: 4 };

  return (
    <ToolLayout
      title="Bass Genius"
      layout="stacked"
      topAligned
      optionsMode={
        tab !== "play" ? null : (
        <Segmented
          onPage
          label="Feel"
          value={feel}
          onChange={(v) => update({ feel: v })}
          disabled={running}
          options={[
            { value: "walking", label: "Walking in 4" },
            { value: "two", label: "Two feel" },
          ]}
        />
        )
      }
      options={
        tab !== "play" ? null : (
        <>
          <CollapsiblePanel
            id="bass-genius-form"
            title="Form"
            icon={RepeatIcon}
            summary={`${CHORUS_OPTIONS.find((o) => o.value === choruses)?.label ?? ""}${countIn ? " · count-in" : ""}`}
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">How long</span>
              <Select value={choruses} onChange={(v) => update({ choruses: v })} options={CHORUS_OPTIONS} disabled={running} />
            </label>
            <Hint>
              Choruses loop the form the band blows over; the last one takes the chart&apos;s D.C. / D.S. and coda and ends on
              a held root.
            </Hint>
            <SwitchRow label="Count-in" checked={countIn} onChange={(v) => update({ countIn: v })} hint="One bar of clicks before the bass comes in." />
          </CollapsiblePanel>
          {!typed && (
          <CollapsiblePanel id="bass-genius-key" title="Key" icon={ChordChartIcon} summary={transposeKey || "Original"}>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Play it in</span>
              <Select
                value={transposeKey}
                onChange={(v) => {
                  // A new key is a different bass line: stop rather than keep playing the old one.
                  stop();
                  update({ transposeKey: v });
                }}
                options={[{ value: "", label: `Original${selectedSong?.key ? ` (${selectedSong.key})` : ""}` }, ...KEY_NAMES.map((k) => ({ value: k, label: k }))]}
              />
            </label>
            <Hint>Transposes the chart and the bass line together.</Hint>
          </CollapsiblePanel>
          )}
          <CollapsiblePanel
            id="bass-genius-sound"
            title="Sound"
            icon={SpeakerIcon}
            summary={`${TOUCH_OPTIONS.find((t) => t.value === touch)?.label} · ${Math.round(volume * 100)}%`}
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Touch</span>
              <Select value={touch} onChange={(v) => update({ touch: v })} options={TOUCH_OPTIONS} disabled={running} />
            </label>
            <Hint>How hard the strings are pulled — each step is a different set of recordings, not just louder.</Hint>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Volume</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => update({ volume: Number(e.target.value) })}
                className="accent-[var(--accent)]"
                aria-label="Bass volume"
              />
            </label>
            <SwitchRow label="Room" checked={room} onChange={(v) => update({ room: v })} hint="A little room sound around the bass." />
          </CollapsiblePanel>
          <CollapsiblePanel id="bass-genius-click" title="Click" icon={MetronomeIcon} summary={click ? "On 2 & 4" : "Off"}>
            <SwitchRow label="Hi-hat click on 2 & 4" checked={click} onChange={(v) => update({ click: v })} hint="A soft click on the backbeats, like a drummer's hi-hat." />
          </CollapsiblePanel>
        </>
        )
      }
    >
      <Segmented
        onPage
        label="Bass Genius section"
        value={tab}
        onChange={(v) => {
          if (v !== "play") stop();
          update({ tab: v });
        }}
        options={[
          { value: "play", label: "Play" },
          { value: "players", label: "Bass players" },
        ]}
      />
      {tab === "players" ? (
        <BassPlayersTab />
      ) : (
      <div className="flex w-full max-w-3xl flex-col items-center gap-6">
        <Segmented
          onPage
          label="Play over"
          value={source}
          onChange={switchSource}
          options={[
            { value: "chart", label: "One of my charts" },
            { value: "typed", label: "A progression I type" },
          ]}
        />
        <div className="flex w-full flex-wrap items-center justify-center gap-2">
          {!typed && (
          <button
            type="button"
            onClick={() => setPicking(true)}
            disabled={loading}
            className="flex min-w-0 max-w-full items-center gap-3 rounded-2xl bg-surface px-4 py-3 text-left hover:bg-surface-hover disabled:opacity-60"
          >
            <ChordChartIcon className="h-5 w-5 shrink-0 text-accent" />
            <span className="min-w-0">
              <span className="block text-xs font-medium text-muted">Chord chart</span>
              <span className="block truncate font-semibold">{meta?.title ?? (loading ? "Loading your charts…" : "Pick a chart")}</span>
            </span>
          </button>
          )}
          <div className="flex items-center gap-3 rounded-2xl bg-surface px-4 py-2">
            <BassIcon className="h-5 w-5 shrink-0 text-accent" />
            <label className="flex flex-col text-left">
              <span className="text-xs font-medium text-muted">Bass player</span>
              <Select
                value={player}
                onChange={(v) => update({ player: v })}
                options={BASS_PLAYERS.map((p) => ({ value: p.id, label: p.label }))}
                disabled={running}
                className="min-w-36"
              />
            </label>
          </div>
        </div>

        {typed && (
          <div className="flex w-full flex-col gap-3 rounded-2xl bg-surface p-4 text-left">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="font-medium text-muted">Chords</span>
              <textarea
                value={typedText}
                onChange={(e) => update({ typedText: e.target.value })}
                rows={2}
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                placeholder="Dm7 G7 | Cmaj7 | %    or    ii7 V7 | Imaj7"
                className="w-full resize-y rounded-xl bg-background px-3 py-2.5 font-mono text-base outline-none ring-accent focus:ring-2"
                aria-label="Chord progression"
              />
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => update({ typedText: p.text })}
                  className="rounded-full bg-background px-3 py-1.5 text-xs font-semibold text-muted hover:bg-surface-hover hover:text-foreground"
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-muted">Key{typedResult.usesNumerals ? "" : " (for numerals)"}</span>
                <Select value={typedKey} onChange={(v) => update({ typedKey: v })} options={KEY_NAMES.map((k) => ({ value: k, label: k }))} className="min-w-24" />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-muted">Time</span>
                <Select
                  value={typedMeter}
                  onChange={(v) => {
                    stop();
                    update({ typedMeter: v });
                  }}
                  options={[
                    { value: "4/4" as const, label: "4/4" },
                    { value: "3/4" as const, label: "3/4" },
                  ]}
                  className="min-w-24"
                />
              </label>
            </div>
            {typedResult.unknown.length > 0 ? (
              <p className="text-sm text-danger">
                Didn&apos;t understand: {typedResult.unknown.map((t) => `“${t}”`).join(", ")}
              </p>
            ) : (
              <p className="text-xs text-muted">
                Chord names (Dm7, G7b9, Cmaj7, F#ø, Bb7/D) or roman numerals in the key (ii7, V7, Imaj7, bVII7, V7/ii) —
                lowercase is minor. Put | between bars; without any, each chord gets a bar. % repeats the bar before.
              </p>
            )}
          </div>
        )}

        <TempoHero bpm={bpm} setBpm={(v) => update({ bpm: v })} beatsPerBar={ts.top} beatUnit={ts.bottom} onTap={tap} />

        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            disabled={!song}
            className={`flex min-w-40 items-center justify-center gap-2 rounded-full px-8 py-3 text-lg font-semibold disabled:opacity-50 ${
              running || downloading ? "bg-surface text-foreground hover:bg-surface-hover" : "bg-accent text-accent-foreground hover:bg-accent-hover"
            }`}
          >
            {running || downloading ? <StopIcon className="h-5 w-5" /> : <PlayIcon className="h-5 w-5" />}
            {running || downloading ? "Stop" : "Play"}
          </button>
          <p className="h-5 text-sm text-muted tabular-nums" aria-live="polite">
            {loadError
              ? "Couldn't download the bass — check your connection and try again."
              : downloading
                ? `Downloading the bass… ${Math.round((download ?? 0) * 100)}%`
                : countingIn
                  ? `Count-in… ${(now?.beat ?? 0) + ts.top + 1}`
                  : running && now?.info
                    ? `Chorus ${now.info.chorus + 1} · ${now.info.harmony ? prettyQuality(now.info.harmony.symbol) : "N.C."}`
                    : !uprightBassReady() && song
                      ? "The bass sound downloads the first time you press Play (about 5 MB)."
                      : ""}
          </p>
        </div>

        {typed ? (
          song ? (
            <div className="w-full rounded-2xl bg-surface p-2 text-left sm:p-6">
              <ChordChart song={song} hideHeader activeBar={activeBar} />
            </div>
          ) : (
            <p className="text-sm text-muted">Type some chords above to hear the bass play them.</p>
          )
        ) : !loading && allSongs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl bg-surface p-6 text-sm text-muted">
            <p>You don&apos;t have any chord charts yet.</p>
            <Link href="/chord-charts" className="font-semibold text-accent hover:underline">
              Import or make one in Chord Charts
            </Link>
          </div>
        ) : !chartId ? (
          <button type="button" onClick={() => setPicking(true)} className="rounded-2xl bg-surface p-6 text-sm text-muted hover:bg-surface-hover">
            Pick one of your chord charts to play over.
          </button>
        ) : selectedSongLoading || (!song && loading) ? (
          <LoadingSpinner label="Loading chart…" showLabel />
        ) : song ? (
          <div className="w-full rounded-2xl bg-surface p-2 text-left sm:p-6">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 px-2 sm:px-0">
              <h2 className="text-xl font-bold">{song.title}</h2>
              <p className="text-sm text-muted">
                {[song.composer ? formatComposer(song.composer) : null, song.style || null, song.key, `${song.timeSignature.top}/${song.timeSignature.bottom}`]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            <ChordChart song={song} hideHeader activeBar={activeBar} />
          </div>
        ) : (
          <p className="text-sm text-muted">That chart isn&apos;t in your library anymore.</p>
        )}
      </div>

      )}

      {picking && (
        <ChartLinkPicker
          songs={allSongs}
          initialQuery=""
          onPick={(id) => {
            stop();
            update({ chartId: id, transposeKey: "" });
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </ToolLayout>
  );
}
