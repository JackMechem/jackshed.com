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
import TranscriptionScore from "@/components/bassgenius/TranscriptionScore";
import PhraseDialog from "@/components/bassgenius/PhraseDialog";
import { TempoHero } from "@/components/MeterFields";
import { Segmented } from "@/components/metronome/MetronomeOptions";
import { BassIcon, ChordChartIcon, MetronomeIcon, PlayIcon, RepeatIcon, SlidersIcon, SpeakerIcon, StopIcon } from "@/components/tools";
import { BASS_PLAYERS, type BassFeel, type BassNote, type BassPhrase, type BassTouch, type PerformedBeat } from "@/lib/bassLine";
import { chorusToTranscription } from "@/lib/bassLineScore";
import { analyzeStyle, styleCoverage } from "@/lib/bassStyle";
import { learnModel } from "@/lib/bassLearned";
import { useBassPlayers, usePlayerTranscriptions } from "@/lib/useBassPlayers";
import { startBassGenius, type BassGeniusRun, type BassSwing } from "@/lib/bassGeniusEngine";
import { compReady, loadComp, setCompRoom, setCompVolume, type CompInstrument } from "@/lib/compSounds";
import type { CompStyle } from "@/lib/comping";
import { DEFAULT_DRUM_CONFIG, drumConfigOf, type DrumConfig, type DrumKit } from "@/lib/drums";
import DrumSettingsDialog from "@/components/bassgenius/DrumSettingsDialog";
import { drumsReady, loadDrums, setDrumsRoom, setDrumsVolume } from "@/lib/drumSounds";
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
  /** "computer", or the id of one of your bass players (who plays from their transcriptions). */
  player: string;
  /** For one of your players: copy phrases from their transcriptions, or write new lines in
      their style. */
  playerMode: "copy" | "learn";
  feel: BassFeel;
  touch: BassTouch;
  bpm: number;
  /** 0 = keep going until stopped. */
  choruses: number;
  countIn: boolean;
  click: boolean;
  /** Off-beat eighths pushed late; "auto" follows the tempo. */
  swing: BassSwing;
  volume: number;
  room: boolean;
  /** Chords under the bass: off, or a piano / Rhodes comping the changes. */
  chords: "off" | CompInstrument;
  chordStyle: CompStyle;
  chordVolume: number;
  /** A drummer swinging along (sticks), or none. */
  drums: "off" | DrumKit;
  drumsVolume: number;
  /** The drummer comping (snare chatter, accents marking sections) or just keeping time. */
  drumsComping: boolean;
  /** The drum settings dialog's values. */
  drumConfig: DrumConfig;
  /** Hi-hat click level, 0–1. */
  clickVolume: number;
  /** How much room sound (reverb), 0–1, when Room is on. */
  roomAmount: number;
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
  playerMode: "copy",
  feel: "walking",
  touch: "medium",
  bpm: 140,
  choruses: 0,
  countIn: true,
  click: false,
  swing: "auto",
  volume: 0.85,
  room: true,
  chords: "off",
  chordStyle: "comp",
  chordVolume: 0.6,
  clickVolume: 0.6,
  drums: "off",
  drumsVolume: 0.7,
  drumsComping: false,
  drumConfig: DEFAULT_DRUM_CONFIG,
  roomAmount: 0.5,
  transposeKey: "",
};

const noop = () => {};

/** A Mixer button opening sliders for each part: bass, chords, hi-hat click, room. */
function Mixer({
  bass,
  drums,
  chords,
  click,
  room,
  clickOffLabel,
  onChange,
}: {
  bass: number;
  /** Null when the drums are off. */
  drums: number | null;
  /** Null when chords are off. */
  chords: number | null;
  /** Null when the click is off. */
  click: number | null;
  room: number;
  clickOffLabel: string;
  onChange: (patch: Partial<Settings>) => void;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    window.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);
  const row = (label: string, value: number | null, set: (v: number) => void, off?: () => void, offLabel?: string) => (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{label}</span>
        {value === null ? (
          <button type="button" onClick={off} className="text-xs font-semibold text-accent hover:underline">
            {offLabel}
          </button>
        ) : (
          <span className="text-xs text-muted tabular-nums">{Math.round(value * 100)}%</span>
        )}
      </div>
      <input
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value ?? 0}
        disabled={value === null}
        onChange={(e) => set(Number(e.target.value))}
        className="accent-[var(--accent)] disabled:opacity-40"
        aria-label={`${label} volume`}
      />
    </div>
  );
  return (
    <div ref={box} className="relative -mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold ${open ? "bg-accent text-accent-foreground" : "bg-surface hover:bg-surface-hover"}`}
      >
        <SlidersIcon className="h-4 w-4" /> Mixer
      </button>
      {open && (
        <div role="dialog" aria-label="Mixer" className="absolute left-1/2 top-full z-30 mt-2 flex w-72 -translate-x-1/2 flex-col gap-3 rounded-2xl bg-surface p-4 text-left shadow-xl ring-1 ring-foreground/10">
          {row("Bass", bass, (v) => onChange({ volume: v }))}
          {row("Drums", drums, (v) => onChange({ drumsVolume: v }), () => onChange({ drums: "sticks" }), "Turn on")}
          {row("Chords", chords, (v) => onChange({ chordVolume: v }), () => onChange({ chords: "piano" }), "Turn on")}
          {row("Click", click, (v) => onChange({ clickVolume: v }), clickOffLabel === "Turn on" ? () => onChange({ click: true }) : undefined, clickOffLabel)}
          {row("Room", room, (v) => onChange({ roomAmount: v, room: v > 0 }))}
        </div>
      )}
    </div>
  );
}

/** Each phrase of a chorus as a range of the chorus's bars (0-based). */
function barsOfPhrases(c: { beats: PerformedBeat[]; start: number; phrases: BassPhrase[] }): { from: number; to: number }[] {
  const barOf: number[] = [];
  let bar = -1;
  c.beats.forEach((b, i) => {
    if (b.beatInBar === 0 || i === 0) bar++;
    barOf.push(bar);
  });
  return c.phrases.map((p) => {
    const a = p.beat - c.start;
    return { from: barOf[a] ?? 0, to: barOf[Math.min(a + p.length - 1, barOf.length - 1)] ?? 0 };
  });
}

const SWING_OPTIONS: { value: BassSwing; label: string }[] = [
  { value: "auto", label: "Swing (by tempo)" },
  { value: "light", label: "Light swing" },
  { value: "hard", label: "Hard swing" },
  { value: "straight", label: "Straight" },
];

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
  const { tab, source, chartId, typedText, typedKey, typedMeter, player, playerMode, feel, touch, bpm, choruses, countIn, click, swing, volume, room, transposeKey, chords, chordStyle, chordVolume, clickVolume, roomAmount, drumsVolume, drumsComping } = settings;
  // Brushes were dropped; a saved "brushes" plays sticks.
  const drums: "off" | DrumKit = settings.drums === "off" ? "off" : "sticks";
  const drumConfig = useMemo(() => drumConfigOf(settings.drumConfig), [settings.drumConfig]);
  const [drumSettingsOpen, setDrumSettingsOpen] = useState(false);
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

  // A player of your own: their transcriptions, analysed, are what the line is made from.
  const { players, loading: playersLoading } = useBassPlayers();
  const customPlayer = player === "computer" ? null : (players.find((p) => p.id === player) ?? null);
  const playerTranscriptions = usePlayerTranscriptions(customPlayer?.id ?? null);
  const style = useMemo(
    () => (customPlayer && playerTranscriptions ? analyzeStyle(customPlayer.name, playerTranscriptions) : null),
    [customPlayer, playerTranscriptions],
  );
  const model = useMemo(
    () => (customPlayer && playerTranscriptions && playerMode === "learn" ? learnModel(customPlayer.name, playerTranscriptions) : null),
    [customPlayer, playerTranscriptions, playerMode],
  );
  const learning = !!customPlayer && playerMode === "learn";
  const styleLoading = !!customPlayer && playerTranscriptions === undefined;
  const coverage = useMemo(() => (style && song && style.usableBars > 0 ? styleCoverage(style, song) : null), [style, song]);


  const [picking, setPicking] = useState(false);
  const [running, setRunning] = useState(false);
  const [download, setDownload] = useState<number | null>(uprightBassReady() ? 1 : null);
  const [loadError, setLoadError] = useState(false);
  const [now, setNow] = useState<{ beat: number; info: PerformedBeat | null } | null>(null);
  const runRef = useRef<BassGeniusRun | null>(null);
  // The line as it's written (a chorus ahead of the music), for showing it on a staff.
  const [writtenChoruses, setWrittenChoruses] = useState<{ chorus: number; notes: BassNote[]; beats: PerformedBeat[]; start: number; phrases: BassPhrase[] }[]>([]);
  // The phrase whose working is open (index into the shown chorus's phrases).
  const [opened, setOpened] = useState<{ chorus: number; index: number } | null>(null);
  const [viewChorus, setViewChorus] = useState(0);
  const scoreBoxRef = useRef<HTMLDivElement>(null);
  const startingRef = useRef(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => setUprightBassVolume(volume), [volume]);
  useEffect(() => setUprightBassRoom(room ? roomAmount : 0), [room, roomAmount]);
  useEffect(() => runRef.current?.setBpm(bpm), [bpm]);
  useEffect(() => runRef.current?.setClick(click), [click]);
  useEffect(() => runRef.current?.setSwing(swing), [swing]);
  useEffect(() => setCompVolume(chordVolume), [chordVolume]);
  useEffect(() => setCompRoom(room ? roomAmount : 0), [room, roomAmount]);
  useEffect(() => runRef.current?.setClickVolume(clickVolume), [clickVolume]);
  useEffect(() => setDrumsVolume(drumsVolume), [drumsVolume]);
  useEffect(() => runRef.current?.setDrumsComping(drumsComping), [drumsComping]);
  useEffect(() => runRef.current?.setDrumConfig(drumConfig), [drumConfig]);
  useEffect(() => setDrumsRoom(room ? roomAmount : 0), [room, roomAmount]);
  // Drums switched on (or changed) while playing: load the kit, then bring it in.
  const [drumDownload, setDrumDownload] = useState<number | null>(null);
  useEffect(() => {
    const run = runRef.current;
    if (!run) return;
    if (drums === "off") return run.setDrums(null);
    if (drumsReady(drums)) return run.setDrums(drums);
    let live = true;
    loadDrums(drums, (f) => live && setDrumDownload(f))
      .then(() => {
        if (live) {
          setDrumDownload(null);
          runRef.current?.setDrums(drums);
        }
      })
      .catch(() => live && setDrumDownload(null));
    return () => {
      live = false;
    };
  }, [drums, running]);
  // Chords switched on (or changed) while playing: load the instrument, then bring it in.
  const [chordDownload, setChordDownload] = useState<number | null>(null);
  useEffect(() => {
    const run = runRef.current;
    if (!run) return;
    if (chords === "off") return run.setComp(null);
    if (compReady(chords)) return run.setComp({ instrument: chords, style: chordStyle });
    let live = true;
    loadComp(chords, (f) => live && setChordDownload(f))
      .then(() => {
        if (live) {
          setChordDownload(null);
          runRef.current?.setComp({ instrument: chords, style: chordStyle });
        }
      })
      .catch(() => live && setChordDownload(null));
    return () => {
      live = false;
    };
  }, [chords, chordStyle, running]);
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
      await Promise.all([
        loadUprightBass(setDownload),
        chords !== "off" ? loadComp(chords).catch(() => undefined) : Promise.resolve(),
        drums !== "off" ? loadDrums(drums).catch(() => undefined) : Promise.resolve(),
      ]);
    } catch {
      setLoadError(true);
      startingRef.current = false;
      setStarting(false);
      return;
    }
    if (!startingRef.current) return; // stopped while downloading
    setUprightBassVolume(volume);
    setUprightBassRoom(room ? roomAmount : 0);
    setWrittenChoruses([]);
    setViewChorus(0);
    setOpened(null);
    runRef.current = startBassGenius({
      song,
      line: { player, feel, touch, styleMode: playerMode },
      style,
      model,
      bpm,
      choruses,
      countIn,
      click,
      swing,
      clickVolume,
      comp: chords !== "off" && compReady(chords) ? { instrument: chords, style: chordStyle } : null,
      drums: drums !== "off" && drumsReady(drums) ? drums : null,
      drumsComping,
      drumConfig,
      onBeat: (beat, info) => {
        setNow({ beat, info });
        if (info) setViewChorus(info.chorus);
      },
      onWrite: (chorus, notes, beats, start, phrases) =>
        setWrittenChoruses((list) => [...list.filter((c) => c.chorus >= chorus - 2), { chorus, notes, beats, start, phrases }]),
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
  }, [song, player, playerMode, feel, touch, style, model, bpm, choruses, countIn, click, swing, volume, room, roomAmount, clickVolume, chords, chordStyle, drums, drumsComping, drumConfig]);


  const shown = writtenChoruses.find((c) => c.chorus === viewChorus) ?? null;
  const preferFlat = !/^(G|D|A|E|B|F#|C#)(?!b)/.test(song?.key ?? "");
  const scored = useMemo(
    () =>
      shown && song
        ? chorusToTranscription(shown.notes, shown.beats, shown.start, { title: "", preferFlat, timeSignature: song.timeSignature })
        : null,
    [shown, song, preferFlat],
  );
  // The shown chorus's phrases as bar ranges (0-based measures of the chorus), and the one playing.
  const phraseBars = useMemo(() => (shown ? barsOfPhrases(shown) : []), [shown]);
  const openPhrase = opened && opened.chorus === viewChorus ? opened.index : null;
  const openChorus = opened ? (writtenChoruses.find((c) => c.chorus === opened.chorus) ?? null) : null;
  const openDetail = useMemo(() => {
    if (!opened || !openChorus || !song) return null;
    const phrase = openChorus.phrases[opened.index];
    if (!phrase) return null;
    const bars = barsOfPhrases(openChorus)[opened.index];
    const t = chorusToTranscription(openChorus.notes, openChorus.beats, openChorus.start, { title: "", preferFlat, timeSignature: song.timeSignature }).transcription;
    return { phrase, previous: openChorus.phrases[opened.index - 1] ?? null, bars, played: { ...t, measures: t.measures.slice(bars.from, bars.to + 1) } };
  }, [opened, openChorus, song, preferFlat]);
  const playingPhrase =
    running && now && now.beat >= 0 && shown ? shown.phrases.findIndex((p) => now.beat >= p.beat && now.beat < p.beat + p.length) : -1;

  // The note being heard, lit on the staff (straight on the drawn SVG — no redraw per note) and
  // kept in view.
  const nowBeat = running && now && now.beat >= 0 ? now.beat : null;
  useEffect(() => {
    const box = scoreBoxRef.current;
    if (!box) return;
    box.querySelectorAll(".bass-now").forEach((el) => el.classList.remove("bass-now"));
    if (nowBeat === null || !scored) return;
    let at: (typeof scored.noteAt)[number] | null = null;
    for (const n of scored.noteAt) {
      if (n.beat > nowBeat + 1e-6) break;
      at = n;
    }
    if (!at) return;
    const el = box.querySelector(`[data-note="${at.measure}:${at.note}"]`);
    if (!el) return;
    el.classList.add("bass-now");
    const r = el.getBoundingClientRect();
    if (r.top < 80 || r.bottom > window.innerHeight - 40) el.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [nowBeat, scored]);

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
      credit="Idea and Ray Brown transcription by Rob Moreno"
      layout="stacked"
      topAligned
      optionsMode={
        tab !== "play" ? null : (
        <Segmented
          onPage
          label="Feel"
          value={feel}
          onChange={(v) => update({ feel: v })}
          disabled={running || !!customPlayer}
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
          <CollapsiblePanel
            id="bass-genius-chords"
            title="Chords"
            icon={ChordChartIcon}
            summary={chords === "off" ? "Off" : `${chords === "piano" ? "Piano" : "Rhodes"} · ${chordStyle === "comp" ? "comping" : "sustained"}`}
          >
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Instrument</span>
              <Select
                value={chords}
                onChange={(v) => update({ chords: v })}
                options={[
                  { value: "off" as const, label: "Off" },
                  { value: "piano" as const, label: "Piano (Salamander grand)" },
                  { value: "rhodes" as const, label: "Rhodes ('77 Mark I)" },
                ]}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">How it plays</span>
              <Select
                value={chordStyle}
                onChange={(v) => update({ chordStyle: v })}
                options={[
                  { value: "comp" as const, label: "Comping (varied rhythms)" },
                  { value: "sustain" as const, label: "Held chords, on the beat" },
                ]}
              />
            </label>
            <Hint>
              Comping mixes held chords, half-held ones with space after, short stabs, Charlestons and two-hit figures, sometimes pushed onto
              the &quot;and&quot; before the beat or laid back to the &quot;and&quot; after. Voicings are left-hand rootless A/B shapes (3rd or
              7th at the bottom, the bass has the root), close or drop-2, each the smoothest move from the last chord.
            </Hint>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Volume</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={chordVolume}
                onChange={(e) => update({ chordVolume: Number(e.target.value) })}
                className="accent-[var(--accent)]"
                aria-label="Chords volume"
              />
            </label>
          </CollapsiblePanel>
          <CollapsiblePanel id="bass-genius-swing" title="Swing" icon={MetronomeIcon} summary={SWING_OPTIONS.find((o) => o.value === swing)?.label ?? ""}>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Eighth notes</span>
              <Select value={swing} onChange={(v) => update({ swing: v })} options={SWING_OPTIONS} />
            </label>
            <Hint>
              How late the &quot;and&quot; of each beat lands. By tempo is about triplet swing at medium tempos and evens out as it gets
              faster, the way players do; triplets stay triplets either way.
            </Hint>
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
                value={customPlayer || playersLoading ? player : "computer"}
                onChange={(v) => update({ player: v })}
                options={[
                  ...BASS_PLAYERS.map((p) => ({ value: p.id as string, label: p.label })),
                  ...players.map((p) => ({ value: p.id, label: p.name })),
                ]}
                disabled={running}
                className="min-w-36"
              />
            </label>
          </div>
        </div>
        {customPlayer && (
          <Segmented
            onPage
            label="How they play"
            value={playerMode}
            onChange={(v) => update({ playerMode: v })}
            disabled={running}
            options={[
              { value: "copy", label: "Use their phrases" },
              { value: "learn", label: "Learn their style" },
            ]}
          />
        )}
        {customPlayer && (
          <div className="-mt-3 max-w-xl text-center text-xs text-muted">
            {styleLoading ? (
              <LoadingSpinner size="sm" inline label="Reading transcriptions" showLabel />
            ) : !style || style.transcriptions === 0 ? (
              <>
                {customPlayer.name} has no transcriptions yet — add some under{" "}
                <button type="button" className="font-semibold text-accent hover:underline" onClick={() => update({ tab: "players" })}>
                  Bass players
                </button>
                . Until then the Computer walks.
              </>
            ) : style.usableBars === 0 ? (
              <>
                None of {customPlayer.name}&apos;s transcriptions have chord symbols yet. Add the chords — that&apos;s how their lines are matched
                to a chart. Until then the Computer walks.
              </>
            ) : learning ? (
              <>
                Writes new lines from what {customPlayer.name}&apos;s {style.transcriptions} transcription{style.transcriptions === 1 ? " shows" : "s show"} —
                where they land when the chord changes, what each beat gets, how far they move, how they lead into the next chord, their
                rhythms and register — without copying any of their bars.
              </>
            ) : (
              <>
                Plays {customPlayer.name}&apos;s own lines wherever the same progression turns up in their {style.transcriptions} transcription
                {style.transcriptions === 1 ? "" : "s"} ({style.usableBars} bars with chords), in any key, and walks the rest in their register.
                {coverage && coverage.bars > 0 && (
                  <>
                    {" "}
                    {coverage.matched === 0
                      ? "Nothing in this chart matches their transcriptions yet."
                      : `${Math.round((coverage.matched / coverage.bars) * 100)}% of this chart's bars have a match${coverage.longest > 1 ? ` (the longest runs ${coverage.longest} bars)` : ""}.`}
                  </>
                )}
              </>
            )}
          </div>
        )}

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

        <Segmented
          onPage
          label="Chords"
          value={chords}
          onChange={(v) => update({ chords: v })}
          options={[
            { value: "off", label: "No chords" },
            { value: "piano", label: "Piano" },
            { value: "rhodes", label: "Rhodes" },
          ]}
        />
        <Segmented
          onPage
          label="Drums"
          value={drums}
          onChange={(v) => update({ drums: v })}
          options={[
            { value: "off", label: "No drums" },
            { value: "sticks", label: "Drums" },
          ]}
        />
        {drums !== "off" && (
          <div className="-mt-2 flex flex-wrap items-center justify-center gap-2">
            <Segmented
              onPage
              label="How the drummer plays"
              value={drumsComping ? "comp" : "time"}
              onChange={(v) => update({ drumsComping: v === "comp" })}
              options={[
                { value: "time", label: "Just time" },
                { value: "comp", label: "With comping" },
              ]}
            />
            <button
              type="button"
              onClick={() => setDrumSettingsOpen(true)}
              className="flex items-center gap-1.5 rounded-full bg-surface px-4 py-2 text-sm font-semibold hover:bg-surface-hover"
            >
              <SlidersIcon className="h-4 w-4" /> Drum settings
            </button>
          </div>
        )}
        {drumSettingsOpen && <DrumSettingsDialog config={drumConfig} onChange={(c) => update({ drumConfig: c })} onClose={() => setDrumSettingsOpen(false)} />}
        {drumDownload !== null && <p className="-mt-3 text-xs text-muted">Downloading the drums… {Math.round(drumDownload * 100)}%</p>}
        <Mixer
          drums={drums === "off" ? null : drumsVolume}
          bass={volume}
          chords={chords === "off" ? null : chordVolume}
          click={click && drums === "off" ? clickVolume : null}
          clickOffLabel={drums !== "off" ? "Off with drums" : "Turn on"}
          room={room ? roomAmount : 0}
          onChange={(patch) => update(patch)}
        />
        {chordDownload !== null && <p className="-mt-3 text-xs text-muted">Downloading the {chords === "rhodes" ? "Rhodes" : "piano"}… {Math.round(chordDownload * 100)}%</p>}

        <TempoHero bpm={bpm} setBpm={(v) => update({ bpm: v })} beatsPerBar={ts.top} beatUnit={ts.bottom} onTap={tap} />

        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={toggle}
            disabled={!song || styleLoading}
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
                    ? `Chorus ${now.info.chorus + 1} · ${now.info.harmony ? prettyQuality(now.info.harmony.symbol) : "N.C."}${
                        customPlayer ? ` · ${learning ? `in ${customPlayer.name}'s style` : now.info.from ? `from ${now.info.from}` : "filling in"}` : ""
                      }`
                    : !uprightBassReady() && song
                      ? "The bass sound downloads the first time you press Play (about 5 MB)."
                      : ""}
          </p>
        </div>

        {scored && (running || writtenChoruses.length > 0) && (
          <div ref={scoreBoxRef} className="bass-line-score w-full rounded-2xl bg-surface p-3 text-left sm:p-5">
            <style>{`.bass-line-score g.bass-now{fill:var(--accent);stroke:var(--accent);color:var(--accent)}`}</style>
            <div className="mb-1 flex items-baseline justify-between gap-3 px-1">
              <h3 className="text-sm font-semibold">Bass line</h3>
              <span className="text-xs text-muted">Chorus {viewChorus + 1}</span>
            </div>
            {customPlayer && shown && shown.phrases.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5 px-1" aria-label="Phrases — how each was made">
                {shown.phrases.map((p, i) => {
                  const b = phraseBars[i];
                  const src = p.source;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setOpened({ chorus: viewChorus, index: i })}
                      title="How this phrase was made"
                      className={`flex flex-col items-start rounded-lg px-2.5 py-1 text-left text-xs transition-colors ${
                        i === playingPhrase ? "bg-accent text-accent-foreground" : openPhrase === i ? "bg-surface-hover" : "bg-background hover:bg-surface-hover"
                      }`}
                    >
                      <span className="font-semibold">{b ? (b.from === b.to ? `Bar ${b.from + 1}` : `Bars ${b.from + 1}–${b.to + 1}`) : "Phrase"}</span>
                      <span className={i === playingPhrase ? "opacity-80" : "text-muted"}>
                        {src ? `${src.title} ${Math.floor(src.startBeat / 4) + 1}–${Math.ceil((src.startBeat + p.length) / 4)}` : p.learned ? "New, in their style" : "Computer"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
            <TranscriptionScore
              transcription={scored.transcription}
              cursor={null}
              playing={null}
              mode="select"
              range={openPhrase !== null && phraseBars[openPhrase] ? phraseBars[openPhrase] : null}
              onSelect={noop}
              onAdd={noop}
              onReplace={noop}
              onChordClick={noop}
            />
          </div>
        )}
        {openDetail && customPlayer && style && (
          <PhraseDialog
            phrase={openDetail.phrase}
            previous={openDetail.previous}
            bars={{ from: openDetail.bars.from + 1, to: openDetail.bars.to + 1 }}
            playerName={customPlayer.name}
            median={style.median}
            source={openDetail.phrase.source ? (playerTranscriptions?.[openDetail.phrase.source.transcription] ?? null) : null}
            played={openDetail.played}
            onClose={() => setOpened(null)}
          />
        )}

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
