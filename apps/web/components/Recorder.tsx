"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { OptionSection, OptionsCard } from "@/components/OptionsCard";
import ConfirmDialog from "@/components/ConfirmDialog";
import PromptDialog from "@/components/PromptDialog";
import ContextMenu, { MenuItem, MenuState } from "@/components/ContextMenu";
import HelpButton, { HelpGroup } from "@/components/HelpButton";
import Hint from "@/components/Hint";
import KeyHint from "@/components/KeyHint";
import LoadingSpinner from "@/components/LoadingSpinner";
import NumberField from "@/components/NumberField";
import Select from "@/components/Select";
import SwitchRow from "@/components/SwitchRow";
import ToolLayout from "@/components/ToolLayout";
import WaveScrollbar from "@/components/WaveScrollbar";
import Waveform, { GridShape, LaneClip, LoopRegion, View } from "@/components/Waveform";
import {
  DownloadIcon,
  ExpandHeightIcon,
  FlagIcon,
  MetronomeIcon,
  MicIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RecordIcon,
  RepeatIcon,
  ShrinkHeightIcon,
  SlidersIcon,
  StopIcon,
} from "@/components/tools";
import { decodeBlob, formatTime, peaksOf } from "@/lib/audioFile";
import { InputDevice, listAudioInputs, openStream } from "@/lib/audioInput";
import { createLibrary } from "@/lib/fileLibrary";
import { alignmentShift } from "@/lib/alignBeat";
import { Clip, carveClips } from "@/lib/clips";
import { Marker, loadMarkers, saveMarkers } from "@/lib/markers";
import { getAudioContext } from "@/lib/metronome";
import { getServerThemeState, getThemeState, subscribeTheme } from "@/lib/theme";
import { Engine, EngineTrack, clipLength, renderMixdown, trackEndTime } from "@/lib/multitrack";
import {
  ProjectInfo,
  ProjectMeta,
  deleteProject,
  deleteTrackBlob,
  listProjects,
  loadProject,
  saveProjectMeta,
  saveTrackBlob,
} from "@/lib/projectStore";
import { makeId } from "@/lib/types";
import { useSyncedSettings } from "@/lib/useSyncedSettings";
import { useSpaceToggle } from "@/lib/useSpaceToggle";
import { PATTERN_SECONDS, findSyncBurst, scheduleSyncBursts } from "@/lib/syncBurst";
import { downloadBlob, encodeWav, safeFilename } from "@/lib/wav";

const NEW_PROJECT = "__new-project__";
const SETTINGS_KEY = "jam-practice-recorder";
const DEFAULT_SETTINGS = {
  inputDeviceId: "",
  volume: 1,
  channelMode: "mix",
  metronomeOn: false,
  bpm: 100,
  beatsPerBar: 4,
  countInBars: 1,
  clickVolume: 0.6,
  overdub: true,
  learnedShiftMs: 0,
  trackHeight: 96,
  showGrid: true,
  snap: "beat",
};

/** Interfaces with two inputs record as stereo (input 1 = left, input 2 = right). */
const CHANNEL_MODES = [
  { value: "mix", label: "Both inputs, as mono (centred)" },
  { value: "left", label: "Input 1 only (left), as mono" },
  { value: "right", label: "Input 2 only (right), as mono" },
  { value: "stereo", label: "Stereo (keep inputs separate)" },
];
const SNAP_OPTIONS = [
  { value: "beat", label: "Beat" },
  { value: "bar", label: "Bar" },
  { value: "off", label: "Off (free)" },
];
const COUNT_IN_OPTIONS = [0, 1, 2, 4].map((n) => ({
  value: n,
  label: n === 0 ? "No count-in" : `${n} bar${n === 1 ? "" : "s"}`,
}));
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];
/** Track colours to choose from; new tracks take the next one in turn. */
const TRACK_COLORS = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#94a3b8",
];
const colorForIndex = (index: number) => TRACK_COLORS[index % TRACK_COLORS.length];
/** How close (in pixels) audio has to get to a beat line before it snaps onto it. */
const EDIT_SNAP_PX = 10;
const MIN_TRACK_HEIGHT = 80;
const MAX_TRACK_HEIGHT = 320;
/** Used only if the alignment markers can't be found in a recording. */
const FALLBACK_LATENCY = 0.08;
const MIN_SPAN = 2;
/** How far past the end of the longest track the view can zoom out. */
const MAX_ZOOM_OUT = 8;
const MIN_TIMELINE = 60;
const LANE_HEIGHT = 96;
const HEADER_WIDTH = "12rem";
const MIGRATED_KEY = "jam-practice-recordings-migrated";

type Track = {
  id: string;
  name: string;
  color: string;
  volume: number;
  muted: boolean;
  solo: boolean;
  clips: Clip[];
};

function toEngineTrack(t: Track): EngineTrack {
  return {
    id: t.id,
    volume: t.volume,
    muted: t.muted,
    solo: t.solo,
    clips: t.clips.map((c) => ({
      id: c.id,
      buffer: c.buffer,
      offset: c.offset,
      trimStart: c.trimStart,
      trimEnd: c.trimEnd,
      repeatEnd: c.repeatEnd,
    })),
  };
}

const timelineEnd = (list: Track[]) =>
  list.reduce((max, t) => t.clips.reduce((inner, c) => Math.max(inner, trackEndTime(c)), max), 0);

/** Applies `change` to the clip with this id, wherever it is. */
function mapClip(list: Track[], clipId: string, change: (clip: Clip) => Clip): Track[] {
  return list.map((t) =>
    t.clips.some((c) => c.id === clipId)
      ? { ...t, clips: t.clips.map((c) => (c.id === clipId ? change(c) : c)) }
      : t,
  );
}

const clock = () => performance.now();
const newProjectId = () => `proj-${Date.now()}`;
const timestamp = () => Date.now();

function defaultProjectName() {
  const d = new Date();
  return `Project ${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

function sliderStyle(value: number, min: number, max: number) {
  return { "--progress": `${((value - min) / (max - min)) * 100}%` } as React.CSSProperties;
}

const zoomButton =
  "rounded-lg bg-surface px-2.5 py-1 text-sm font-semibold hover:bg-surface-hover disabled:opacity-40";

const laneButton =
  "flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-bold transition-colors";

const HELP_GROUPS: HelpGroup[] = [
  {
    heading: "Recording",
    items: [
      ["Add track", "Adds an empty track and arms it for recording."],
      ["Red circle on a track", "Arms that track. Only one track is armed at a time."],
      [
        "R  or  the record button",
        "Starts and stops recording onto the armed track. Nothing happens if no track is armed.",
      ],
      [
        "Recording over audio",
        "The armed track goes quiet while you record, and your new take replaces whatever was under it.",
      ],
      ["Space", "Plays and pauses (or stops a recording)."],
    ],
  },
  {
    heading: "Moving around",
    items: [
      ["Scroll", "Zoom the timeline in and out around the pointer."],
      ["Ctrl + scroll", "Move along the timeline."],
      ["Shift + scroll", "Make the tracks taller or shorter."],
      ["Ctrl + Shift + scroll", "Move up and down through the tracks."],
      ["Drag empty space", "Pan sideways and up or down."],
      ["Middle mouse drag", "Pan sideways and up or down."],
      ["Click", "Select a track or clip and move the playhead."],
      ["Drag the playhead", "Scrub through the audio."],
      ["Shift + drag", "Select a loop. Drag its edges to adjust it."],
    ],
  },
  {
    heading: "Editing clips",
    items: [
      ["Drag a clip", "Move it along the timeline, or onto another track."],
      ["Drag a clip's left edge", "Crop its start."],
      ["Drag the lower right edge", "Crop its end."],
      ["Drag the white handle (top right)", "Repeat the clip to fill more of the timeline."],
      ["Right-click a clip", "Rename or delete it, trim or repeat it, or align it to the beat."],
      ["Right-click empty space", "Add a marker, play from that point, or set loop points."],
      ["Colour dot on a track", "Pick the colour for that track's clips."],
    ],
  },
  {
    heading: "Snapping",
    items: [
      [
        "Audio",
        "Clips snap onto a beat line when they get close, and can sit freely between beats.",
      ],
      [
        "Playhead and loops",
        "These snap fully to the grid. Change or turn off snapping in Options.",
      ],
    ],
  },
];

/** A small colour dot that opens a palette to recolour a track. */
function ColorSwatch({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onPointerDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest("[data-color-popover], [data-color-button]")) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        data-color-button
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setPosition({ left: rect.left, top: rect.bottom + 6 });
          setOpen((o) => !o);
        }}
        aria-label="Track colour"
        title="Track colour"
        className="h-4 w-4 shrink-0 rounded-full ring-2 ring-background transition-transform hover:scale-110"
        style={{ background: color }}
      />
      {open && (
        <div
          data-color-popover
          className="fixed z-[70] grid grid-cols-6 gap-1.5 rounded-xl bg-surface p-2 shadow-lg ring-1 ring-foreground/10"
          style={position}
        >
          {TRACK_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
              aria-label={`Use colour ${c}`}
              aria-pressed={c === color}
              className={`h-6 w-6 rounded-full transition-transform hover:scale-110 ${
                c === color ? "ring-2 ring-foreground ring-offset-2 ring-offset-surface" : ""
              }`}
              style={{ background: c }}
            />
          ))}
        </div>
      )}
    </>
  );
}

/** Beat lines drawn behind all the lanes, so they run the full height of the tracks area. */
function GridLines({ view, grid }: { view: View; grid: GridShape }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // Only used to redraw when the theme colours change.
  const theme = useSyncExternalStore(subscribeTheme, getThemeState, getServerThemeState);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() =>
      setSize({ width: canvas.clientWidth, height: canvas.clientHeight }),
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || size.width === 0) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(size.width * dpr);
    canvas.height = Math.floor(size.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = getComputedStyle(canvas).color;

    const beat = 60 / grid.bpm;
    const barBeats = Math.max(1, grid.beatsPerBar);
    const pxPerBeat = (beat / view.span) * size.width;
    const stride = pxPerBeat >= 8 ? 1 : pxPerBeat * barBeats >= 8 ? barBeats : 0;
    if (stride === 0) return;
    const first = Math.ceil((view.start - grid.origin) / beat / stride) * stride;
    for (let k = first; ; k += stride) {
      const x = ((grid.origin + k * beat - view.start) / view.span) * size.width;
      if (x > size.width) break;
      const isBar = ((k % barBeats) + barBeats) % barBeats === 0;
      ctx.globalAlpha = isBar ? 0.4 : 0.15;
      ctx.fillRect(Math.round(x), 0, 1, size.height);
    }
  }, [view, grid, size, theme]);

  // The 5px inset matches the lanes, so the lines sit exactly under the clips' time positions.
  return (
    <div className="pointer-events-none absolute inset-y-0 left-[5px] right-[5px]">
      <canvas ref={canvasRef} className="h-full w-full text-muted" />
    </div>
  );
}

/** Green level meter like a mixer channel: fills to the current peak and falls back smoothly. */
function LevelBar({ read, active }: { read: () => number; active: boolean }) {
  const barRef = useRef<HTMLDivElement>(null);
  const latest = useRef(read);
  useEffect(() => {
    latest.current = read;
  });

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    if (!active) {
      bar.style.width = "0%";
      return;
    }
    let shown = 0;
    let frame = 0;
    const tick = () => {
      const peak = latest.current();
      // -60 dB (empty) to 0 dB (full).
      const target = peak > 0 ? Math.min(1, Math.max(0, (20 * Math.log10(peak) + 60) / 60)) : 0;
      shown = Math.max(target, shown - 0.02);
      bar.style.width = `${shown * 100}%`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active]);

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-background">
      <div ref={barRef} className="h-full w-0 overflow-hidden rounded-full">
        <div
          className="h-full w-[11rem] max-w-none"
          style={{
            background:
              "linear-gradient(to right, #22c55e 0%, #22c55e 65%, #eab308 82%, #ef4444 100%)",
          }}
        />
      </div>
    </div>
  );
}

/** Scrolling level history of whatever the input is hearing right now. */
function LiveMeter({ analyser }: { analyser: AnalyserNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [clipping, setClipping] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const samples = new Float32Array(analyser.fftSize);
    const history: number[] = [];
    const color = getComputedStyle(canvas).color;
    const COLUMN = 3;
    let frame = 0;
    let clipTimer: ReturnType<typeof setTimeout> | null = null;

    const draw = () => {
      analyser.getFloatTimeDomainData(samples);
      let peak = 0;
      for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
      if (peak >= 0.98) {
        setClipping(true);
        if (clipTimer) clearTimeout(clipTimer);
        clipTimer = setTimeout(() => setClipping(false), 1200);
      }

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.floor(w * dpr)) canvas.width = Math.floor(w * dpr);
      if (canvas.height !== Math.floor(h * dpr)) canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const columns = Math.max(1, Math.floor(w / COLUMN));
      history.push(Math.min(1, Math.sqrt(peak)));
      while (history.length > columns) history.shift();
      ctx.fillStyle = color;
      history.forEach((value, i) => {
        const x = w - (history.length - i) * COLUMN;
        const barHeight = Math.max(1.5, value * h * 0.9);
        ctx.fillRect(x, (h - barHeight) / 2, COLUMN - 1, barHeight);
      });
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      if (clipTimer) clearTimeout(clipTimer);
    };
  }, [analyser]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-surface">
      <canvas ref={canvasRef} className="h-full w-full text-muted" />
      {clipping && (
        <span className="absolute right-2 top-2 rounded-md bg-danger px-2 py-0.5 text-xs font-bold text-background">
          CLIPPING
        </span>
      )}
    </div>
  );
}

/**
 * The waveform of the take being recorded, drawn on the same timeline as the other tracks:
 * it starts where recording started and grows to the right as you play.
 */
function LiveTrackWaveform({
  analyser,
  view,
  getTime,
  overlay = false,
}: {
  analyser: AnalyserNode;
  view: View;
  getTime: () => number;
  /** Draw on top of an existing lane instead of on its own background. */
  overlay?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [clipping, setClipping] = useState(false);
  const latest = useRef({ view, getTime });
  useEffect(() => {
    latest.current = { view, getTime };
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const samples = new Float32Array(analyser.fftSize);
    const history: { t: number; peak: number }[] = [];
    const color = getComputedStyle(canvas).color;
    let frame = 0;
    let clipTimer: ReturnType<typeof setTimeout> | null = null;

    const draw = () => {
      analyser.getFloatTimeDomainData(samples);
      let peak = 0;
      for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]));
      if (peak >= 0.98) {
        setClipping(true);
        if (clipTimer) clearTimeout(clipTimer);
        clipTimer = setTimeout(() => setClipping(false), 1200);
      }
      const { view: v, getTime: now } = latest.current;
      history.push({ t: now(), peak });

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.floor(w * dpr)) canvas.width = Math.floor(w * dpr);
      if (canvas.height !== Math.floor(h * dpr)) canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = color;

      // Keep the loudest reading in each pixel column so quiet gaps don't flicker.
      const columns = new Float32Array(Math.max(1, Math.floor(w)));
      for (const sample of history) {
        const x = Math.floor(((sample.t - v.start) / v.span) * w);
        if (x >= 0 && x < columns.length) columns[x] = Math.max(columns[x], sample.peak);
      }
      for (let x = 0; x < columns.length; x++) {
        if (columns[x] === 0) continue;
        const barHeight = Math.max(1.5, Math.min(1, columns[x] ** 0.7) * h * 0.92);
        ctx.fillRect(x, (h - barHeight) / 2, 1, barHeight);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      if (clipTimer) clearTimeout(clipTimer);
    };
  }, [analyser]);

  return (
    <div
      className={`relative h-full w-full overflow-hidden rounded-xl ${
        overlay ? "pointer-events-none absolute inset-0 bg-danger/10" : "bg-surface"
      }`}
    >
      <canvas
        ref={canvasRef}
        className={`h-full w-full ${overlay ? "text-danger" : "text-muted"}`}
      />
      {clipping && (
        <span className="absolute right-2 top-2 rounded-md bg-danger px-2 py-0.5 text-xs font-bold text-background">
          CLIPPING
        </span>
      )}
    </div>
  );
}

const inputLevelBuffer = new Float32Array(2048);
function readInputLevel(analyser: AnalyserNode | null): number {
  if (!analyser) return 0;
  analyser.getFloatTimeDomainData(inputLevelBuffer);
  let peak = 0;
  for (let i = 0; i < analyser.fftSize; i++) peak = Math.max(peak, Math.abs(inputLevelBuffer[i]));
  return peak;
}

export default function Recorder() {
  const [settings, updateSettings] = useSyncedSettings(SETTINGS_KEY, DEFAULT_SETTINGS);
  const { inputDeviceId: savedDevice, volume, metronomeOn, bpm, beatsPerBar } = settings;
  const { countInBars, clickVolume, overdub, showGrid, learnedShiftMs } = settings;
  const trackHeight = Math.min(MAX_TRACK_HEIGHT, Math.max(MIN_TRACK_HEIGHT, settings.trackHeight));
  const snapMode = SNAP_OPTIONS.some((o) => o.value === settings.snap) ? settings.snap : "beat";
  const channelMode = CHANNEL_MODES.some((m) => m.value === settings.channelMode)
    ? settings.channelMode
    : "mix";

  const [project, setProject] = useState(() => ({
    id: newProjectId(),
    name: defaultProjectName(),
  }));
  const [projects, setProjects] = useState<ProjectInfo[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loadingProject, setLoadingProject] = useState(false);

  const [inputs, setInputs] = useState<InputDevice[]>([]);
  const [recording, setRecording] = useState(false);
  const [monitoring, setMonitoring] = useState(false);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [recordFrom, setRecordFrom] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [armedId, setArmedId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<{ clipId: string; name: string } | null>(null);
  const [pendingClipDelete, setPendingClipDelete] = useState<{ track: Track; clip: Clip } | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState<LoopRegion | null>(null);
  const [loopOn, setLoopOn] = useState(false);
  const [view, setView] = useState<View>({ start: 0, span: 1 });
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [pendingProjectDelete, setPendingProjectDelete] = useState<ProjectInfo | null>(null);
  const [pendingTrackDelete, setPendingTrackDelete] = useState<Track | null>(null);

  const engineRef = useRef<Engine | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const routedRef = useRef<MediaStream | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const syncRef = useRef({ ctxTime: 0, startCtx: 0, deviceLatency: 0 });
  const nodesRef = useRef<AudioNode[]>([]);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const startedAtRef = useRef(0);
  const recordInfoRef = useRef({ songStart: 0, playFrom: 0, trackId: "" });
  const addedRef = useRef(0);
  const mountedRef = useRef(true);
  const monitoringRef = useRef(monitoring);
  const projectRef = useRef(project);
  const tracksRef = useRef(tracks);
  const settingsRef = useRef({ learnedShiftMs });
  const armedIdRef = useRef<string | null>(null);
  const headerColumnRef = useRef<HTMLDivElement>(null);
  const audioColumnRef = useRef<HTMLDivElement>(null);
  const audioAreaRef = useRef<HTMLDivElement>(null);
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});

  const inputDeviceId = inputs.some((d) => d.id === savedDevice) ? savedDevice : "";

  const duration = useMemo(() => timelineEnd(tracks), [tracks]);
  const fitFor = (end: number): View => ({ start: 0, span: Math.max(end, 1) });
  const grid = useMemo<GridShape | undefined>(
    () => (showGrid ? { bpm, beatsPerBar, origin: 0 } : undefined),
    [showGrid, bpm, beatsPerBar],
  );
  const laneClips = useMemo(
    () =>
      new Map<string, LaneClip[]>(
        tracks.map((t) => [
          t.id,
          t.clips.map((c) => ({
            id: c.id,
            peaks: c.peaks,
            offset: c.offset,
            shape: { trimStart: c.trimStart, trimEnd: c.trimEnd, end: trackEndTime(c) },
            label: c.name,
            selected: c.id === selectedClipId,
          })),
        ]),
      ),
    [tracks, selectedClipId],
  );
  // Moving, cropping and repeating audio only snaps when it's within a few pixels of a beat,
  // so it can also be placed freely between the clicks.
  const snapEdit = useMemo(() => {
    if (snapMode === "off") return undefined;
    const unit = (60 / bpm) * (snapMode === "bar" ? beatsPerBar : 1);
    return (t: number, pxPerSecond: number) => {
      const nearest = Math.round(t / unit) * unit;
      return Math.abs(nearest - t) * pxPerSecond <= EDIT_SNAP_PX ? nearest : t;
    };
  }, [snapMode, bpm, beatsPerBar]);
  const snapTime = useMemo(() => {
    if (snapMode === "off") return undefined;
    const unit = (60 / bpm) * (snapMode === "bar" ? beatsPerBar : 1);
    return (t: number) => Math.round(t / unit) * unit;
  }, [snapMode, bpm, beatsPerBar]);

  function engine(): Engine {
    if (!engineRef.current) {
      const e = new Engine();
      e.onEnded = () => {
        setPlaying(false);
        setTime(e.getTime());
      };
      engineRef.current = e;
    }
    return engineRef.current;
  }

  useEffect(() => {
    monitoringRef.current = monitoring;
    projectRef.current = project;
    tracksRef.current = tracks;
    settingsRef.current = { learnedShiftMs };
    armedIdRef.current = armedId;
  }, [monitoring, project, tracks, learnedShiftMs, armedId]);

  useEffect(() => {
    mountedRef.current = true;
    addedRef.current = timestamp();
    return () => {
      mountedRef.current = false;
      if (recorderRef.current?.state === "recording") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      nodesRef.current.forEach((n) => n.disconnect());
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  // Keep the engine in step with the UI.
  useEffect(() => {
    const e = engine();
    e.setDuration(duration);
    // The track being recorded over stays silent so you hear only the other tracks.
    e.setTracks(tracks.filter((t) => !(recording && t.id === armedId)).map(toEngineTrack));
  }, [tracks, duration, recording, armedId]);
  useEffect(() => {
    engine().setLoop(loopOn && loop ? loop : null);
  }, [loop, loopOn]);
  useEffect(() => {
    engine().setMetronome({ enabled: metronomeOn, bpm, beatsPerBar, volume: clickVolume });
  }, [metronomeOn, bpm, beatsPerBar, clickVolume]);
  useEffect(() => {
    engine().setMasterVolume(volume);
  }, [volume]);

  // Saved projects and audio inputs. Older single-take recordings become one-track projects.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (window.localStorage.getItem(MIGRATED_KEY) !== "1") {
          const legacy = createLibrary("jam-practice-recordings", 50);
          for (const entry of await legacy.list()) {
            const file = await legacy.get(entry.id);
            if (!file) continue;
            const trackId = makeId();
            await saveTrackBlob(entry.id, trackId, file);
            await saveProjectMeta({
              id: entry.id,
              name: entry.name,
              added: entry.added,
              tracks: [
                {
                  id: trackId,
                  name: "Track 1",
                  volume: 1,
                  muted: false,
                  solo: false,
                  clips: [
                    {
                      id: trackId,
                      name: entry.name,
                      offset: 0,
                      size: file.size,
                    },
                  ],
                },
              ],
            });
          }
          window.localStorage.setItem(MIGRATED_KEY, "1");
        }
      } catch {
        // migration is best-effort
      }
      const list = await listProjects();
      if (!cancelled) setProjects(list);
    })();
    const refreshInputs = () => {
      void listAudioInputs()
        .then((devices) => {
          if (!cancelled) setInputs(devices);
        })
        .catch(() => {});
    };
    refreshInputs();
    navigator.mediaDevices?.addEventListener?.("devicechange", refreshInputs);
    return () => {
      cancelled = true;
      navigator.mediaDevices?.removeEventListener?.("devicechange", refreshInputs);
    };
  }, []);

  // Autosave the project (levels, names, ...) shortly after any change.
  useEffect(() => {
    if (tracks.length === 0) return;
    const id = setTimeout(() => {
      const meta: ProjectMeta = {
        id: project.id,
        name: project.name,
        added: addedRef.current,
        tracks: tracks.map((t) => ({
          id: t.id,
          name: t.name,
          color: t.color,
          volume: t.volume,
          muted: t.muted,
          solo: t.solo,
          clips: t.clips.map((c) => ({
            id: c.id,
            name: c.name,
            offset: c.offset,
            trimStart: c.trimStart,
            trimEnd: c.trimEnd,
            repeatEnd: c.repeatEnd,
            size: c.blob.size,
          })),
        })),
      };
      void saveProjectMeta(meta).then(() => listProjects().then(setProjects));
    }, 500);
    return () => clearTimeout(id);
  }, [tracks, project]);

  // Remember markers per project.
  useEffect(() => {
    saveMarkers(project.id, markers);
  }, [markers, project.id]);

  // Recording timer.
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setElapsed((clock() - startedAtRef.current) / 1000), 200);
    return () => clearInterval(id);
  }, [recording]);

  // Playhead while playing or recording.
  useEffect(() => {
    if (!playing && !recording) return;
    let frame = 0;
    const tick = () => {
      const t = engine().getTime();
      setTime(t);
      setView((v) => {
        if (recording) {
          // Keep the growing take on screen by zooming out in steps.
          if (t <= v.start + v.span * 0.95) return v;
          return { start: v.start, span: Math.max(v.span * 1.5, t - v.start + v.span * 0.2) };
        }
        if (v.span >= duration || (t >= v.start && t <= v.start + v.span)) return v;
        return { ...v, start: Math.max(0, Math.min(duration - v.span, t - v.span * 0.1)) };
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, recording, duration]);

  const hasTracks = tracks.length > 0;
  // Scrolling over the track names scrolls the tracks (the two columns stay in step).
  useEffect(() => {
    const header = headerColumnRef.current;
    if (!header) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      audioColumnRef.current?.scrollBy({ top: e.deltaY });
    };
    header.addEventListener("wheel", onWheel, { passive: false });
    return () => header.removeEventListener("wheel", onWheel);
  }, [hasTracks]);

  /** Dragging on the empty space below the tracks pans the view, sideways and up/down. */
  const emptyPanRef = useRef<{ x: number; y: number } | null>(null);
  function startEmptyPan(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 && e.button !== 1) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    emptyPanRef.current = { x: e.clientX, y: e.clientY };
    setSelectedClipId(null);
  }
  function moveEmptyPan(e: React.PointerEvent<HTMLDivElement>) {
    const last = emptyPanRef.current;
    const width = audioAreaRef.current?.getBoundingClientRect().width;
    if (!last || !width) return;
    panBy(-((e.clientX - last.x) / width) * view.span);
    scrollTracksBy(-(e.clientY - last.y));
    emptyPanRef.current = { x: e.clientX, y: e.clientY };
  }
  function endEmptyPan() {
    emptyPanRef.current = null;
  }

  function scrollTracksBy(dy: number) {
    audioColumnRef.current?.scrollBy({ top: dy });
  }

  // Mouse wheel over the tracks area (lanes and the empty space below them):
  //   scroll: zoom in and out      Ctrl + scroll: move along the timeline
  //   Shift + scroll: track height  Ctrl + Shift + scroll: move up and down the tracks
  useEffect(() => {
    wheelRef.current = (e: WheelEvent) => {
      if (duration <= 0 && tracks.length === 0) return;
      e.preventDefault();
      const rect = audioAreaRef.current?.getBoundingClientRect();
      if (!rect) return;
      // Shift turns a vertical wheel into a sideways one in some browsers.
      const amount = e.deltaY !== 0 ? e.deltaY : e.deltaX;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.shiftKey) {
        scrollTracksBy(amount);
      } else if (e.shiftKey) {
        const next = trackHeight + (amount < 0 ? 16 : -16);
        updateSettings({
          trackHeight: Math.min(MAX_TRACK_HEIGHT, Math.max(MIN_TRACK_HEIGHT, next)),
        });
      } else if (ctrl || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        panBy((amount / rect.width) * view.span);
      } else {
        const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        zoomAt(amount < 0 ? 0.8 : 1.25, view.start + ratio * view.span);
      }
    };
  });
  useEffect(() => {
    const area = audioAreaRef.current;
    if (!area) return;
    const onWheel = (e: WheelEvent) => wheelRef.current(e);
    area.addEventListener("wheel", onWheel, { passive: false });
    return () => area.removeEventListener("wheel", onWheel);
  }, [hasTracks]);

  /* ---------- input & recording ---------- */

  async function ensureInput() {
    if (streamRef.current) return;
    const ctx = getAudioContext();
    if (ctx.state === "suspended") await ctx.resume();
    const stream = await openStream(inputDeviceId, 2);

    // Route the input so one-sided sources (e.g. a bass in input 2) end up on both sides.
    const source = ctx.createMediaStreamSource(stream);
    const splitter = ctx.createChannelSplitter(2);
    const merger = ctx.createChannelMerger(2);
    const destination = ctx.createMediaStreamDestination();
    destination.channelCount = 2;
    destination.channelCountMode = "explicit";
    destination.channelInterpretation = "speakers";
    const node = ctx.createAnalyser();
    node.fftSize = 2048;
    node.smoothingTimeConstant = 0;

    const inputChannels = stream.getAudioTracks()[0]?.getSettings().channelCount ?? 2;
    const mode = inputChannels < 2 && channelMode !== "stereo" ? "left" : channelMode;
    source.connect(splitter);
    const wires: Record<string, [number, number][]> = {
      stereo: [
        [0, 0],
        [1, 1],
      ],
      left: [
        [0, 0],
        [0, 1],
      ],
      right: [
        [1, 0],
        [1, 1],
      ],
      mix: [
        [0, 0],
        [0, 1],
        [1, 0],
        [1, 1],
      ],
    };
    for (const [from, to] of wires[mode]) splitter.connect(merger, from, to);
    merger.connect(destination);
    merger.connect(node);

    streamRef.current = stream;
    routedRef.current = destination.stream;
    destinationRef.current = destination;
    nodesRef.current = [source, splitter, merger, destination, node];
    setAnalyser(node);
    void listAudioInputs().then(setInputs);
  }

  function releaseInput() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    nodesRef.current.forEach((n) => n.disconnect());
    nodesRef.current = [];
    streamRef.current = null;
    routedRef.current = null;
    destinationRef.current = null;
    setAnalyser(null);
  }

  async function toggleMonitoring() {
    setError(null);
    if (monitoring) {
      setMonitoring(false);
      if (!recording) releaseInput();
      return;
    }
    try {
      await ensureInput();
      setMonitoring(true);
    } catch {
      setError("Couldn't open the audio input. Check the browser's microphone permission.");
    }
  }

  async function startRecording() {
    if (recording || loadingProject || finishing) return;
    const target = tracksRef.current.find((t) => t.id === armedIdRef.current);
    if (!target) {
      setNotice(
        tracksRef.current.length === 0
          ? "Add a track first, then press its red circle to arm it for recording."
          : "Arm a track first — press the red circle on the track you want to record onto.",
      );
      return;
    }
    setNotice(null);
    setError(null);
    const e = engine();
    if (e.isPlaying) {
      e.pause();
      setPlaying(false);
    }
    try {
      await ensureInput();
    } catch {
      setError("Couldn't open the audio input. Check the browser's microphone permission.");
      return;
    }
    const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
    const recorder = new MediaRecorder(routedRef.current!, mimeType ? { mimeType } : undefined);
    const chunks: Blob[] = [];
    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) chunks.push(ev.data);
    };
    const playFrom = Math.max(0, e.getTime());
    const preRoll = metronomeOn ? (countInBars * beatsPerBar * 60) / bpm : 0;
    const songStart = playFrom - preRoll;
    recordInfoRef.current = { songStart, playFrom, trackId: target.id };
    setRecordFrom(playFrom);
    recorder.onstop = () => void finishRecording(chunks, recorder.mimeType, songStart);

    // What the browser reports for getting sound out to the speakers and in from the device.
    const ctx = getAudioContext();
    const outputLatency = ctx.outputLatency > 0 ? ctx.outputLatency : ctx.baseLatency || 0;
    const inputSettings = streamRef.current?.getAudioTracks()[0]?.getSettings() as
      (MediaTrackSettings & { latency?: number }) | undefined;
    const inputLatency = inputSettings?.latency ?? 0;
    syncRef.current.deviceLatency = Math.min(0.5, Math.max(0, outputLatency + inputLatency));
    recorderRef.current = recorder;

    // Silence the track being replaced before playback starts (no restart mid-count-in).
    e.setTracks(tracksRef.current.filter((t) => t.id !== target.id).map(toEngineTrack));

    recorder.start(1000);
    startedAtRef.current = clock();
    e.play(playFrom, {
      preRoll,
      gridOrigin: playFrom,
      openEnded: true,
      tracksOff: !overdub,
    });
    syncRef.current.startCtx = e.startTime;
    setElapsed(0);
    setRecording(true);
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    const e = engine();
    e.pause();
    e.seek(recordInfoRef.current.playFrom);
    setTime(recordInfoRef.current.playFrom);
    setPlaying(false);
    setRecording(false);
    setFinishing(true);

    // Play a marker pattern into the recording, then stop once it has been captured. Finding
    // the pattern afterwards lines the take up with the click automatically.
    const ctx = getAudioContext();
    const when = ctx.currentTime + 0.05;
    syncRef.current.ctxTime = when;
    if (destinationRef.current) scheduleSyncBursts(ctx, destinationRef.current, when);
    setTimeout(
      () => {
        if (recorder.state === "recording") recorder.stop();
      },
      (PATTERN_SECONDS + 0.1) * 1000,
    );
  }

  async function finishRecording(chunks: Blob[], mime: string, songStart: number) {
    if (!monitoringRef.current) releaseInput();
    if (!mountedRef.current) return;
    setFinishing(false);
    const blob = new Blob(chunks, { type: mime || "audio/webm" });
    if (blob.size === 0) {
      setError("Nothing was recorded.");
      return;
    }
    try {
      const buffer = await decodeBlob(blob);

      // Where the take goes on the timeline: the marker pattern shows how the file's clock
      // relates to the audio clock, and the browser's reported device delay covers the rest.
      const { ctxTime, startCtx, deviceLatency } = syncRef.current;
      const burst = findSyncBurst(buffer);
      const offset =
        burst !== null
          ? songStart + (ctxTime - burst - startCtx) - deviceLatency
          : songStart - deviceLatency - FALLBACK_LATENCY;
      const learned = settingsRef.current.learnedShiftMs / 1000;
      // The marker pattern sits at the very end of the file, so it's left out.
      const incomingTo = burst !== null ? Math.max(0.05, burst - 0.03) : buffer.duration;
      const incomingOffset = offset + learned;

      // Only what was played from the playhead onward is kept, not the count-in.
      const { playFrom, trackId } = recordInfoRef.current;
      const from = Math.max(0, playFrom - incomingOffset);
      const target = tracksRef.current.find((t) => t.id === trackId);
      if (!target) {
        setError("The track you were recording onto was removed.");
        return;
      }
      const clipCount = tracksRef.current.reduce((n, t) => n + t.clips.length, 0);
      const newClip: Clip = {
        id: makeId(),
        name: `Take ${clipCount + 1}`,
        blob,
        buffer,
        peaks: peaksOf(buffer),
        offset: incomingOffset + from,
        trimStart: from,
        trimEnd: incomingTo,
        repeatEnd: null,
      };

      // The new take replaces whatever was on the track over the same stretch.
      const carved = carveClips(
        getAudioContext(),
        target.clips,
        newClip.offset,
        newClip.offset + (incomingTo - from),
        makeId,
      );
      const projectId = projectRef.current.id;
      await saveTrackBlob(projectId, newClip.id, blob);
      for (const clip of carved.save) await saveTrackBlob(projectId, clip.id, clip.blob);
      for (const id of carved.remove) await deleteTrackBlob(projectId, id);
      if (!mountedRef.current) return;
      const next = tracksRef.current.map((t) =>
        t.id === trackId ? { ...t, clips: [...carved.clips, newClip] } : t,
      );
      setTracks(next);
      setSelectedClipId(newClip.id);
      setView(fitFor(timelineEnd(next)));
    } catch {
      setError("Couldn't process the recording.");
    }
  }

  /* ---------- projects & tracks ---------- */

  /** Adds an empty track and arms it, ready to record onto. */
  function addTrack() {
    if (recording || finishing || loadingProject) return;
    const id = makeId();
    const track: Track = {
      id,
      name: `Track ${tracksRef.current.length + 1}`,
      color: colorForIndex(tracksRef.current.length),
      volume: 1,
      muted: false,
      solo: false,
      clips: [],
    };
    setTracks((prev) => [...prev, track]);
    setArmedId(id);
    setSelectedId(id);
    setNotice(null);
  }

  function resetProject(next: { id: string; name: string }, added: number) {
    const e = engine();
    e.pause();
    e.seek(0);
    addedRef.current = added;
    setPlaying(false);
    setArmedId(null);
    setProject(next);
    setLoop(null);
    setLoopOn(false);
    setTime(0);
    setMenu(null);
    setMarkers(loadMarkers(next.id));
  }

  function newProject() {
    resetProject({ id: newProjectId(), name: defaultProjectName() }, timestamp());
    setTracks([]);
    setView(fitFor(0));
  }

  async function openProject(id: string) {
    setLoadingProject(true);
    setError(null);
    try {
      const loaded = await loadProject(id);
      if (!loaded) throw new Error("missing");
      const list: Track[] = [];
      for (const meta of loaded.meta.tracks) {
        // Projects saved before tracks held several clips have one recording per track.
        const clipMetas = meta.clips ?? [
          {
            id: meta.id,
            name: meta.name,
            offset: meta.offset ?? 0,
            trimStart: meta.trimStart,
            trimEnd: meta.trimEnd,
            repeatEnd: meta.repeatEnd,
            size: meta.size ?? 0,
          },
        ];
        const clips: Clip[] = [];
        for (const cm of clipMetas) {
          const blob = loaded.blobs.get(cm.id);
          if (!blob) continue;
          const buffer = await decodeBlob(blob);
          // Old empty tracks were stored as a tiny silent placeholder; those are just empty now.
          if (!meta.clips && buffer.duration < 0.05) continue;
          clips.push({
            id: cm.id,
            name: cm.name,
            blob,
            buffer,
            peaks: peaksOf(buffer),
            offset: cm.offset,
            trimStart: cm.trimStart ?? 0,
            trimEnd: cm.trimEnd ?? buffer.duration,
            repeatEnd: cm.repeatEnd ?? null,
          });
        }
        list.push({
          id: meta.id,
          name: meta.name,
          color: meta.color ?? colorForIndex(list.length),
          volume: meta.volume,
          muted: meta.muted,
          solo: meta.solo,
          clips,
        });
      }
      resetProject({ id, name: loaded.meta.name }, loaded.meta.added);
      setTracks(list);
      const d = timelineEnd(list);
      setView(fitFor(d));
    } catch {
      setError("Couldn't open that project.");
      setProjects(await listProjects());
    } finally {
      setLoadingProject(false);
    }
  }

  async function confirmProjectDelete(info: ProjectInfo) {
    setPendingProjectDelete(null);
    await deleteProject(info.id);
    saveMarkers(info.id, []);
    if (info.id === project.id) newProject();
    setProjects(await listProjects());
  }

  function updateTrack(id: string, patch: Partial<Track>) {
    setTracks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  async function confirmTrackDelete(track: Track) {
    setPendingTrackDelete(null);
    if (armedId === track.id) setArmedId(null);
    for (const clip of track.clips) await deleteTrackBlob(project.id, clip.id);
    const next = tracks.filter((t) => t.id !== track.id);
    setTracks(next);
    if (next.length === 0) {
      // An empty project isn't kept.
      await deleteProject(project.id);
      setProjects(await listProjects());
    }
  }

  /* ---------- export ---------- */

  const engineTracks = (): EngineTrack[] => tracks.map(toEngineTrack);

  async function exportMixdown(region?: LoopRegion) {
    if (tracks.length === 0) return;
    setBusy("Rendering mixdown…");
    try {
      const start = region?.start ?? 0;
      const end = region?.end ?? duration;
      const buffer = await renderMixdown(engineTracks(), start, end);
      downloadBlob(
        encodeWav(buffer),
        `${safeFilename(project.name)}${region ? " (loop)" : ""}.wav`,
      );
    } catch {
      setError("Couldn't render the mixdown.");
    } finally {
      setBusy(null);
    }
  }

  async function exportTrack(track: Track) {
    if (track.clips.length === 0) {
      setNotice(`${track.name} is empty, so there's nothing to download.`);
      return;
    }
    setBusy("Rendering track…");
    try {
      const end = timelineEnd([track]);
      const buffer = await renderMixdown(
        [{ ...toEngineTrack(track), volume: 1, muted: false, solo: false }],
        0,
        end,
      );
      downloadBlob(
        encodeWav(buffer),
        `${safeFilename(project.name)} - ${safeFilename(track.name)}.wav`,
      );
    } catch {
      setError("Couldn't render this track.");
    } finally {
      setBusy(null);
    }
  }

  /* ---------- transport ---------- */

  function seek(t: number) {
    if (recording) return;
    const clamped = Math.min(duration, Math.max(0, t));
    engine().seek(clamped);
    setTime(clamped);
  }

  function togglePlay() {
    if (recording || tracks.length === 0) return;
    const e = engine();
    if (e.isPlaying) {
      setTime(e.pause());
      setPlaying(false);
      return;
    }
    let from = e.getTime();
    if (loopOn && loop && (from < loop.start || from >= loop.end)) from = loop.start;
    if (from >= duration - 0.01) from = 0;
    e.play(from, { gridOrigin: 0 });
    setPlaying(true);
  }

  function handleSpace() {
    if (recording) stopRecording();
    else togglePlay();
  }
  useSpaceToggle(handleSpace);

  // R starts a new recording, or stops the current one.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key.toLowerCase() !== "r" || ev.ctrlKey || ev.metaKey || ev.altKey || ev.repeat)
        return;
      const target = ev.target as HTMLElement;
      if (target.closest("input, textarea, select, [role='dialog'], [role='alertdialog']")) return;
      ev.preventDefault();
      if (recording) stopRecording();
      else void startRecording();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* ---------- loop, view & markers ---------- */

  function updateLoop(region: LoopRegion) {
    setLoop(region);
    setLoopOn(true);
  }

  function setEdge(edge: "start" | "end", t: number) {
    const clamped = Math.min(duration, Math.max(0, t));
    setLoop((prev) => {
      const base = prev ?? { start: clamped, end: Math.min(duration, clamped + 5) };
      const next = { ...base, [edge]: clamped };
      if (next.end - next.start < 0.05) {
        if (edge === "start") next.start = Math.max(0, next.end - 0.05);
        else next.end = Math.min(duration, next.start + 0.05);
      }
      return next;
    });
    setLoopOn(true);
  }

  function zoomAt(factor: number, anchor: number) {
    setView((v) => {
      if (duration <= 0) return v;
      // You can zoom out past the end of the longest track to see empty room after it.
      const maxSpan = Math.max(duration * MAX_ZOOM_OUT, MIN_TIMELINE);
      const span = Math.min(maxSpan, Math.max(Math.min(MIN_SPAN, duration), v.span * factor));
      const ratio = v.span > 0 ? (anchor - v.start) / v.span : 0;
      const start = Math.max(0, anchor - ratio * span);
      return { start, span };
    });
  }

  function zoom(factor: number) {
    const centre = view.start + view.span / 2;
    zoomAt(factor, time >= view.start && time <= view.start + view.span ? time : centre);
  }

  function panBy(seconds: number) {
    setView((v) => ({
      ...v,
      start: Math.max(0, Math.min(Math.max(duration, v.start), v.start + seconds)),
    }));
  }

  function zoomToLoop() {
    if (!loop) return;
    const length = loop.end - loop.start;
    const span = Math.min(duration, Math.max(MIN_SPAN, length * 1.3));
    const start = Math.max(0, Math.min(duration - span, loop.start - (span - length) / 2));
    setView({ start, span });
  }

  function updateMarker(id: string, patch: Partial<Marker>) {
    setMarkers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }

  function addMarker(t: number) {
    setMarkers((prev) =>
      [
        ...prev,
        {
          id: makeId(),
          time: Math.min(duration, Math.max(0, t)),
          label: `Marker ${prev.length + 1}`,
          note: "",
        },
      ].sort((a, b) => a.time - b.time),
    );
  }

  function playFromHere(t: number) {
    if (recording) return;
    seek(t);
    if (!engine().isPlaying) {
      engine().play(t, { gridOrigin: 0 });
      setPlaying(true);
    }
  }

  /** Zooms out just enough that the whole timeline is visible after a clip grows. */
  function fitToEnd(list: Track[]) {
    const end = timelineEnd(list);
    setView((v) => (end > v.start + v.span ? { start: v.start, span: end - v.start } : v));
  }

  function locateClip(clipId: string): { track: Track; clip: Clip } | null {
    for (const track of tracks) {
      const clip = track.clips.find((c) => c.id === clipId);
      if (clip) return { track, clip };
    }
    return null;
  }

  function updateClip(clipId: string, patch: Partial<Clip>) {
    setTracks((prev) => mapClip(prev, clipId, (c) => ({ ...c, ...patch })));
  }

  function setRepeatEnd(clipId: string, t: number, final: boolean) {
    const found = locateClip(clipId);
    if (!found) return;
    const plainEnd = found.clip.offset + clipLength(found.clip);
    const repeatEnd = t <= plainEnd + 1e-6 ? null : t;
    const next = mapClip(tracks, clipId, (c) => ({ ...c, repeatEnd }));
    setTracks(next);
    if (final) fitToEnd(next);
  }

  function repeatTimes(clip: Clip, times: number) {
    const repeatEnd = times <= 1 ? null : clip.offset + clipLength(clip) * times;
    const next = mapClip(tracks, clip.id, (c) => ({ ...c, repeatEnd }));
    setTracks(next);
    fitToEnd(next);
  }

  /** Cuts the start of the clip at timeline position `t` (within its first play). */
  function trimClipStart(clip: Clip, t: number) {
    const local = t - clip.offset;
    if (local <= 0 || local >= clipLength(clip) - 0.01) return;
    updateClip(clip.id, { offset: t, trimStart: clip.trimStart + local });
  }

  /** Cuts the end of the clip at timeline position `t` (within its first play). */
  function trimClipEnd(clip: Clip, t: number) {
    const local = t - clip.offset;
    if (local <= 0.01 || local > clipLength(clip)) return;
    updateClip(clip.id, { trimEnd: clip.trimStart + local });
  }

  function resetClip(clip: Clip) {
    // Put the full recording back where it started.
    updateClip(clip.id, {
      offset: clip.offset - clip.trimStart,
      trimStart: 0,
      trimEnd: clip.buffer.duration,
      repeatEnd: null,
    });
  }

  /**
   * Dragging a clip: moves its audio sideways, and to another track if the pointer is over one.
   */
  function moveClip(clipId: string, offset: number, final: boolean, clientY: number) {
    const found = locateClip(clipId);
    if (!found) return;
    const { track, clip } = found;
    const delta = offset - clip.offset;

    // Which track's row is the pointer over?
    let target = track;
    const column = audioColumnRef.current;
    if (column && tracks.length > 0) {
      const rect = column.getBoundingClientRect();
      const row = Math.floor((clientY - rect.top + column.scrollTop) / trackHeight);
      target = tracks[Math.min(tracks.length - 1, Math.max(0, row))];
    }

    const moved: Clip = {
      ...clip,
      offset,
      repeatEnd: clip.repeatEnd !== null ? clip.repeatEnd + delta : null,
    };
    const next = tracks.map((t) => {
      if (t.id === track.id && t.id !== target.id) {
        return { ...t, clips: t.clips.filter((c) => c.id !== clipId) };
      }
      if (t.id === target.id) {
        return {
          ...t,
          clips:
            t.id === track.id
              ? t.clips.map((c) => (c.id === clipId ? moved : c))
              : [...t.clips, moved],
        };
      }
      return t;
    });
    setTracks(next);
    setSelectedId(target.id);
    if (final) fitToEnd(next);
  }

  /** Dragging a clip's left edge: crops (or restores) its start; the audio stays put. */
  function cropStart(clipId: string, t: number) {
    const found = locateClip(clipId);
    if (!found) return;
    const { clip } = found;
    const minT = clip.offset - clip.trimStart;
    const maxT = clip.offset + clipLength(clip) - 0.02;
    const next = Math.min(maxT, Math.max(minT, t));
    updateClip(clipId, { offset: next, trimStart: clip.trimStart + (next - clip.offset) });
  }

  /** Dragging a clip's right edge: crops (or restores) its end. */
  function cropEnd(clipId: string, t: number) {
    const found = locateClip(clipId);
    if (!found) return;
    const { clip } = found;
    const most = clip.buffer.duration - clip.trimStart;
    const local = Math.min(most, Math.max(0.02, t - clip.offset));
    updateClip(clipId, { trimEnd: clip.trimStart + local });
  }

  function renameClip(clipId: string, name: string) {
    updateClip(clipId, { name });
  }

  async function deleteClip(track: Track, clip: Clip) {
    setPendingClipDelete(null);
    await deleteTrackBlob(project.id, clip.id);
    setTracks((prev) =>
      prev.map((t) =>
        t.id === track.id ? { ...t, clips: t.clips.filter((c) => c.id !== clip.id) } : t,
      ),
    );
    if (selectedClipId === clip.id) setSelectedClipId(null);
  }

  /**
   * Nudges a clip so its hits land on the beats, and remembers the correction so future
   * recordings start out already compensated.
   */
  function alignToBeat(clip: Clip) {
    const shift = alignmentShift(clip.buffer, clip.trimStart, clip.trimEnd, clip.offset, bpm);
    if (shift === null) {
      setNotice(`Couldn't find enough clear hits in ${clip.name} to align it.`);
      return;
    }
    const ms = Math.round(shift * 1000);
    updateClip(clip.id, { offset: clip.offset + shift });
    updateSettings({ learnedShiftMs: Math.round(learnedShiftMs + ms) });
    setNotice(
      `${clip.name} moved ${ms === 0 ? "0" : `${ms > 0 ? "+" : "−"}${Math.abs(ms)}`} ms onto the beat. New recordings will now be corrected the same way.`,
    );
  }

  /** Repeat / trim / align items for one clip. */
  function clipMenuItems(clip: Clip): MenuItem[] {
    const trimmed = clip.trimStart > 0.001 || clip.trimEnd < clip.buffer.duration - 0.001;
    const items: MenuItem[] = [
      { label: "Align to beat", onSelect: () => alignToBeat(clip) },
      { label: "Repeat 2×", onSelect: () => repeatTimes(clip, 2) },
      { label: "Repeat 4×", onSelect: () => repeatTimes(clip, 4) },
      { label: "Repeat 8×", onSelect: () => repeatTimes(clip, 8) },
    ];
    if (loop && loop.end > clip.offset + clipLength(clip)) {
      items.push({
        label: "Repeat to end of loop",
        onSelect: () => setRepeatEnd(clip.id, loop.end, true),
      });
    }
    if (clip.repeatEnd !== null) {
      items.push({ label: "Clear repeat", onSelect: () => repeatTimes(clip, 1) });
    }
    if (trimmed) items.push({ label: "Reset trim", onSelect: () => resetClip(clip) });
    return items;
  }

  /** The menu behind a lane's repeat button (acts on the selected clip of that track). */
  function openRepeatMenu(track: Track, x: number, y: number) {
    const clip =
      track.clips.find((c) => c.id === selectedClipId) ??
      (track.clips.length === 1 ? track.clips[0] : undefined);
    if (!clip) {
      setNotice(
        track.clips.length === 0
          ? `${track.name} has no audio yet.`
          : "Click a clip on this track first, then use this button.",
      );
      return;
    }
    setMenu({ x, y, items: clipMenuItems(clip) });
  }

  function openMenu(
    info: {
      time: number;
      x: number;
      y: number;
      markerId: string | null;
      clipId: string | null;
    },
    track?: Track,
  ) {
    const marker = markers.find((m) => m.id === info.markerId);
    const clip = track && info.clipId ? track.clips.find((c) => c.id === info.clipId) : undefined;
    const t = marker ? marker.time : info.time;
    const common: MenuItem[] = [
      { label: "Set loop start here", onSelect: () => setEdge("start", t) },
      { label: "Set loop end here", onSelect: () => setEdge("end", t) },
      ...(loop
        ? [
            { label: "Zoom to loop", onSelect: zoomToLoop },
            {
              label: "Clear loop",
              onSelect: () => {
                setLoop(null);
                setLoopOn(false);
              },
            },
          ]
        : []),
    ];
    const clipItems: MenuItem[] =
      track && clip && !marker
        ? [
            {
              label: "Rename clip…",
              onSelect: () => setRenaming({ clipId: clip.id, name: clip.name }),
            },
            {
              label: "Delete clip",
              danger: true,
              onSelect: () => setPendingClipDelete({ track, clip }),
            },
            { label: "Trim clip start here", onSelect: () => trimClipStart(clip, t) },
            { label: "Trim clip end here", onSelect: () => trimClipEnd(clip, t) },
            {
              label: "Repeat clip until here",
              onSelect: () => setRepeatEnd(clip.id, t, true),
            },
            ...clipMenuItems(clip).filter((item) => item.label === "Align to beat"),
          ]
        : [];
    setMenu({
      x: info.x,
      y: info.y,
      items: marker
        ? [
            { label: "Go to marker", onSelect: () => seek(marker.time) },
            ...common,
            {
              label: "Delete marker",
              danger: true,
              onSelect: () => setMarkers((prev) => prev.filter((m) => m.id !== marker.id)),
            },
          ]
        : [
            ...clipItems,
            { label: "Add marker here", onSelect: () => addMarker(t) },
            { label: "Play from here", onSelect: () => playFromHere(t) },
            ...common,
          ],
    });
  }

  const fit = fitFor(duration);
  const zoomed =
    duration > 0 &&
    (Math.abs(view.span - fit.span) > 0.01 || Math.abs(view.start - fit.start) > 0.01);
  const canRecord = tracks.some((t) => t.id === armedId);
  const countingIn = recording && time < recordFrom - 0.001;
  const shownTime = recording ? Math.max(0, time) : time;

  const gridColumns = { gridTemplateColumns: `${HEADER_WIDTH} minmax(0, 1fr)` };

  return (
    <ToolLayout
      title="Recorder"
      layout="stacked"
      topAligned
      help={<HelpButton title="Recorder" groups={HELP_GROUPS} />}
      titleExtra={
        <Select
          value={projects.some((p) => p.id === project.id) ? project.id : NEW_PROJECT}
          onChange={(id) => {
            if (id === NEW_PROJECT) newProject();
            else if (id !== project.id) void openProject(id);
          }}
          disabled={recording || loadingProject}
          options={[
            {
              value: NEW_PROJECT,
              label:
                tracks.length === 0 || !projects.some((p) => p.id === project.id)
                  ? tracks.length === 0
                    ? "New project"
                    : `${project.name} (saving…)`
                  : "New project",
              icon: <RecordIcon className="h-4 w-4 text-danger" />,
            },
            ...projects.map((p) => ({
              value: p.id,
              label: `${p.name} · ${p.trackCount} track${p.trackCount === 1 ? "" : "s"}`,
              onDelete: () => setPendingProjectDelete(p),
            })),
          ]}
          className="w-40 font-medium sm:w-72"
        />
      }
      options={
        <OptionsCard id="recorder">
          <OptionSection title="Metronome" icon={MetronomeIcon}>
            <SwitchRow
              label="Click while playing and recording"
              checked={metronomeOn}
              onChange={(checked) => updateSettings({ metronomeOn: checked })}
              hint="Plays an audible click at the project tempo during playback and recording."
            />
            <div className="grid grid-cols-2 gap-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-muted">Tempo (BPM)</span>
                <NumberField
                  label="Tempo"
                  value={bpm}
                  min={20}
                  max={300}
                  onChange={(v) => updateSettings({ bpm: v })}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-muted">Beats per bar</span>
                <NumberField
                  label="Beats per bar"
                  value={beatsPerBar}
                  min={1}
                  max={12}
                  onChange={(v) => updateSettings({ beatsPerBar: v })}
                />
              </label>
            </div>
            <Hint>Sets the project&apos;s tempo and time signature, used by the click, beat lines and count-in.</Hint>
            <SwitchRow
              label="Show beat lines"
              checked={showGrid}
              onChange={(checked) => updateSettings({ showGrid: checked })}
              hint="Draws vertical lines on the waveform at each beat, at the project tempo."
            />
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Snap playhead and edits to</span>
              <Select
                value={snapMode}
                onChange={(value) => updateSettings({ snap: value })}
                options={SNAP_OPTIONS}
              />
            </label>
            <Hint>Pulls the playhead, loop edges and clip edits to the nearest beat line as you drag.</Hint>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Count-in before recording</span>
              <Select
                value={countInBars}
                onChange={(v) => updateSettings({ countInBars: v })}
                options={COUNT_IN_OPTIONS}
              />
            </label>
            <Hint>How many bars click before recording actually starts.</Hint>
            <label className="flex flex-col gap-2 text-sm">
              <span className="flex items-center justify-between font-medium text-muted">
                Click volume
                <span className="tabular-nums text-foreground">
                  {Math.round(clickVolume * 100)}%
                </span>
              </span>
              <input
                type="range"
                min={0.1}
                max={1}
                step={0.05}
                value={clickVolume}
                onChange={(e) => updateSettings({ clickVolume: Number(e.target.value) })}
                style={sliderStyle(clickVolume, 0.1, 1)}
                className="slider h-6 w-full cursor-pointer"
              />
            </label>
            <Hint>
              The tempo sets the beat lines even with the click off. Drag the accent handle at the
              end of a clip to repeat it, or use the repeat button on a track. The click plays
              through your speakers, so wear headphones or it will be picked up by the microphone.
            </Hint>
          </OptionSection>

          <OptionSection title="Input" icon={MicIcon}>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Audio input</span>
              <Select
                value={inputDeviceId}
                onChange={(id) => updateSettings({ inputDeviceId: id })}
                disabled={recording || monitoring}
                options={[
                  { value: "", label: "Default input" },
                  ...inputs.map((d) => ({ value: d.id, label: d.label })),
                ]}
              />
            </label>
            <Hint>Which microphone or audio interface to record from.</Hint>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Channels</span>
              <Select
                value={channelMode}
                onChange={(value) => updateSettings({ channelMode: value })}
                disabled={recording || monitoring}
                options={CHANNEL_MODES}
              />
            </label>
            <Hint>Whether to record input 1, input 2, both mixed to mono, or both kept as stereo.</Hint>
            <button
              type="button"
              onClick={() => void toggleMonitoring()}
              disabled={recording}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                monitoring
                  ? "bg-accent text-accent-foreground"
                  : "bg-background hover:bg-surface-hover"
              }`}
            >
              {monitoring ? "Stop checking level" : "Check input level"}
            </button>
            <Hint>
              Takes are lined up with the click automatically. A short marker is added to the very
              end of each recording to measure the delay, and it&apos;s trimmed off afterwards.
            </Hint>
            <SwitchRow
              label="Play other tracks while recording"
              checked={overdub}
              onChange={(checked) => updateSettings({ overdub: checked })}
              disabled={recording}
              hint="Lets you play along with what's already recorded instead of recording in silence."
            />
            <Hint>
              An interface with two inputs records input 1 on the left and input 2 on the right, so
              pick the input your instrument is plugged into.
            </Hint>
          </OptionSection>

          <OptionSection title="Project" icon={SlidersIcon}>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Name</span>
              <input
                key={project.id}
                defaultValue={project.name}
                onBlur={(e) => setProject((p) => ({ ...p, name: e.target.value.trim() || p.name }))}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                className="rounded-lg bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-accent"
              />
            </label>
            <Hint>Used for the exported WAV file&apos;s name.</Hint>
            <label className="flex flex-col gap-2 text-sm">
              <span className="flex items-center justify-between font-medium text-muted">
                Track height
                <span className="tabular-nums text-foreground">{trackHeight}px</span>
              </span>
              <input
                type="range"
                min={MIN_TRACK_HEIGHT}
                max={MAX_TRACK_HEIGHT}
                step={8}
                value={trackHeight}
                onChange={(e) => updateSettings({ trackHeight: Number(e.target.value) })}
                style={sliderStyle(trackHeight, MIN_TRACK_HEIGHT, MAX_TRACK_HEIGHT)}
                className="slider h-6 w-full cursor-pointer"
              />
            </label>
            <Hint>How tall each track&apos;s waveform is drawn.</Hint>
            <label className="flex flex-col gap-2 text-sm">
              <span className="flex items-center justify-between font-medium text-muted">
                Master volume
                <span className="tabular-nums text-foreground">{Math.round(volume * 100)}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => updateSettings({ volume: Number(e.target.value) })}
                style={sliderStyle(volume, 0, 1)}
                className="slider h-6 w-full cursor-pointer"
              />
            </label>
            <Hint>Overall playback volume for the whole mix, not included in the export.</Hint>
          </OptionSection>

          <OptionSection title="Export" icon={DownloadIcon}>
            <div className="flex flex-col gap-2 text-sm">
              <button
                type="button"
                onClick={() => void exportMixdown()}
                disabled={tracks.length === 0 || busy !== null}
                className="rounded-lg bg-accent px-3 py-2 font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
              >
                Download mixdown (WAV)
              </button>
              <button
                type="button"
                onClick={() => loop && void exportMixdown(loop)}
                disabled={tracks.length === 0 || !loop || busy !== null}
                className="rounded-lg bg-background px-3 py-2 font-medium hover:bg-surface-hover disabled:opacity-50"
              >
                Download selected loop (WAV)
              </button>
            </div>
            {busy ? (
              <p className="text-xs text-muted">{busy}</p>
            ) : (
              <Hint>
                The mixdown includes every track that&apos;s audible right now, with its level,
                mute and solo. Use the download button on a track to export just that one.
              </Hint>
            )}
          </OptionSection>

          <OptionSection title="Markers" icon={FlagIcon}>
            {markers.length === 0 ? (
              <p className="text-sm text-muted">
                No markers yet. Right-click a waveform to add one at that spot.
              </p>
            ) : (
              <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
                {markers.map((marker) => (
                  <li
                    key={marker.id}
                    className="flex flex-col gap-1.5 rounded-xl bg-background/60 p-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => seek(marker.time)}
                        title="Jump to marker"
                        className="w-16 shrink-0 rounded-lg bg-background px-2 py-1.5 text-left tabular-nums hover:bg-surface-hover"
                      >
                        {formatTime(marker.time)}
                      </button>
                      <input
                        value={marker.label}
                        onChange={(e) => updateMarker(marker.id, { label: e.target.value })}
                        aria-label="Marker name"
                        className="min-w-0 flex-1 rounded-lg bg-background px-2 py-1.5 outline-none focus:ring-2 focus:ring-accent"
                      />
                      <button
                        type="button"
                        onClick={() => setMarkers((prev) => prev.filter((m) => m.id !== marker.id))}
                        aria-label={`Delete ${marker.label}`}
                        className="rounded-lg px-2 py-1.5 text-muted hover:text-danger"
                      >
                        ✕
                      </button>
                    </div>
                    <textarea
                      value={marker.note}
                      onChange={(e) => updateMarker(marker.id, { note: e.target.value })}
                      placeholder="Add notes…"
                      aria-label={`Notes for ${marker.label}`}
                      rows={2}
                      className="w-full resize-y rounded-lg bg-background px-2 py-1.5 text-sm outline-none placeholder:text-muted focus:ring-2 focus:ring-accent"
                    />
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => addMarker(time)}
              disabled={tracks.length === 0}
              className="rounded-lg bg-background px-3 py-1.5 text-sm font-medium hover:bg-surface-hover disabled:opacity-50"
            >
              Add marker at playhead
            </button>
          </OptionSection>
        </OptionsCard>
      }
    >
      <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
        <p className="text-4xl font-bold tabular-nums">
          {countingIn ? "Count-in" : formatTime(recording ? elapsed : shownTime)}
          {!recording && duration > 0 && (
            <span className="text-xl font-semibold text-muted"> / {formatTime(duration)}</span>
          )}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => seek(loopOn && loop ? loop.start : 0)}
            disabled={recording || tracks.length === 0}
            aria-label="Back to start"
            title="Back to start"
            className="flex h-11 min-w-11 items-center justify-center rounded-full bg-surface px-3 text-sm font-semibold hover:bg-surface-hover disabled:opacity-40"
          >
            ⏮
          </button>
          <button
            type="button"
            onClick={togglePlay}
            disabled={recording || tracks.length === 0}
            aria-label={playing ? "Pause" : "Play"}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground hover:bg-accent-hover disabled:opacity-40"
          >
            {playing ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
          </button>
          <button
            type="button"
            onClick={() => (recording ? stopRecording() : void startRecording())}
            aria-label={recording ? "Stop recording" : "Record onto the armed track"}
            disabled={finishing}
            title={
              recording
                ? "Stop recording (R)"
                : canRecord
                  ? "Record onto the armed track (R)"
                  : "Add a track and arm it to record"
            }
            className={`flex h-14 w-14 items-center justify-center rounded-full bg-danger text-background transition-transform ${
              canRecord || recording ? "hover:scale-105" : "opacity-40"
            }`}
          >
            {recording ? <StopIcon className="h-6 w-6" /> : <RecordIcon className="h-9 w-9" />}
          </button>
          <label className="flex items-center gap-2 text-sm text-muted">
            <span className="hidden sm:inline">Tempo</span>
            <span className="w-20">
              <NumberField
                label="Tempo (BPM)"
                value={bpm}
                min={20}
                max={300}
                onChange={(v) => updateSettings({ bpm: v })}
              />
            </span>
          </label>
          <button
            type="button"
            onClick={() => updateSettings({ metronomeOn: !metronomeOn })}
            aria-pressed={metronomeOn}
            aria-label="Metronome"
            title={metronomeOn ? "Metronome on" : "Metronome off"}
            className={`flex h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors ${
              metronomeOn
                ? "bg-accent text-accent-foreground hover:bg-accent-hover"
                : "bg-surface hover:bg-surface-hover"
            }`}
          >
            <MetronomeIcon className="h-4 w-4" />
            {bpm}
          </button>
          <button
            type="button"
            onClick={() => setLoopOn((on) => !on)}
            disabled={!loop}
            aria-pressed={loopOn && loop !== null}
            aria-label="Loop"
            title={
              loop
                ? loopOn
                  ? "Looping — click to turn off"
                  : "Loop off — click to turn on"
                : "Shift+drag on a waveform to pick a loop"
            }
            className={`flex h-11 w-11 items-center justify-center rounded-full transition-colors disabled:opacity-40 ${
              loopOn && loop
                ? "bg-accent text-accent-foreground hover:bg-accent-hover"
                : "bg-surface hover:bg-surface-hover"
            }`}
          >
            <RepeatIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loadingProject && <LoadingSpinner label="Loading project…" showLabel />}
      {finishing && <LoadingSpinner label="Finishing recording…" showLabel />}

      {tracks.length === 0 ? (
        <div className="flex w-full max-w-md flex-1 flex-col items-center justify-center gap-3 py-6">
          <p className="text-lg font-semibold">Start with a track</p>
          <p className="text-sm text-muted">
            Add a track, press the red circle on it to arm it, then hit the record button or{" "}
            <KeyHint.Key>R</KeyHint.Key>. You can record over parts of a track later, and add more
            tracks to layer up. Everything is saved in this browser.
          </p>
          <button
            type="button"
            onClick={() => void addTrack()}
            className="flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
          >
            <PlusIcon className="h-4 w-4" />
            Add track
          </button>
        </div>
      ) : (
        <div className="flex w-full flex-1 flex-col gap-2">
          <div className="relative min-h-[16rem] flex-1">
            <div
              className="absolute inset-0 grid grid-rows-[minmax(0,1fr)] gap-2"
              style={gridColumns}
            >
              <div
                ref={headerColumnRef}
                className="flex flex-col overflow-hidden rounded-xl bg-surface"
              >
                {tracks.map((track) => (
                  <div
                    key={track.id}
                    onPointerDown={() => setSelectedId(track.id)}
                    className={`shrink-0 border-b border-background/70 last:border-b-0 ${
                      selectedId === track.id ? "bg-accent/10" : ""
                    }`}
                    style={{ height: trackHeight }}
                  >
                    <div className="flex h-full flex-col justify-between gap-1 p-2 text-left">
                      <div className="flex items-center gap-1.5">
                        <ColorSwatch
                          color={track.color}
                          onChange={(color) => updateTrack(track.id, { color })}
                        />
                        <input
                          value={track.name}
                          onChange={(e) => updateTrack(track.id, { name: e.target.value })}
                          aria-label="Track name"
                          className="min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-sm font-semibold outline-none focus:bg-background"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setArmedId((id) => (id === track.id ? null : track.id))}
                          disabled={recording}
                          aria-pressed={armedId === track.id}
                          aria-label={`Arm ${track.name} for recording`}
                          title={
                            armedId === track.id
                              ? "Armed — record replaces this track"
                              : "Arm for recording"
                          }
                          className={`${laneButton} ${
                            armedId === track.id
                              ? "bg-danger text-background"
                              : "bg-background text-danger hover:bg-surface-hover"
                          }`}
                        >
                          <RecordIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => updateTrack(track.id, { muted: !track.muted })}
                          aria-pressed={track.muted}
                          title="Mute"
                          className={`${laneButton} ${
                            track.muted
                              ? "bg-danger text-background"
                              : "bg-background text-muted hover:text-foreground"
                          }`}
                        >
                          M
                        </button>
                        <button
                          type="button"
                          onClick={() => updateTrack(track.id, { solo: !track.solo })}
                          aria-pressed={track.solo}
                          title="Solo"
                          className={`${laneButton} ${
                            track.solo
                              ? "bg-accent text-accent-foreground"
                              : "bg-background text-muted hover:text-foreground"
                          }`}
                        >
                          S
                        </button>
                        <button
                          type="button"
                          onClick={() => exportTrack(track)}
                          aria-label={`Download ${track.name}`}
                          title="Download this track (WAV)"
                          className={`${laneButton} bg-background text-muted hover:text-foreground`}
                        >
                          <DownloadIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            const r = e.currentTarget.getBoundingClientRect();
                            openRepeatMenu(track, r.left, r.bottom + 4);
                          }}
                          aria-label={`Repeat or trim ${track.name}`}
                          title="Repeat / trim this clip"
                          className={`${laneButton} ${
                            track.clips.some((c) => c.repeatEnd !== null)
                              ? "bg-accent text-accent-foreground"
                              : "bg-background text-muted hover:text-foreground"
                          }`}
                        >
                          <RepeatIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingTrackDelete(track)}
                          aria-label={`Delete ${track.name}`}
                          title="Delete track"
                          className={`${laneButton} ml-auto bg-background text-muted hover:text-danger`}
                        >
                          ✕
                        </button>
                      </div>
                      <LevelBar
                        read={
                          recording && armedId === track.id
                            ? () => readInputLevel(analyser)
                            : () => engine().getLevel(track.id)
                        }
                        active={playing || recording}
                      />
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.02}
                        value={track.volume}
                        onChange={(e) => updateTrack(track.id, { volume: Number(e.target.value) })}
                        aria-label={`${track.name} volume`}
                        style={sliderStyle(track.volume, 0, 1)}
                        className="slider h-4 w-full cursor-pointer"
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div
                ref={audioAreaRef}
                className="relative min-w-0 overflow-hidden rounded-xl bg-surface"
              >
                {grid && <GridLines view={view} grid={grid} />}
                <div
                  ref={audioColumnRef}
                  onScroll={(e) => {
                    if (headerColumnRef.current) {
                      headerColumnRef.current.scrollTop = e.currentTarget.scrollTop;
                    }
                  }}
                  className="relative flex h-full min-w-0 flex-col overflow-y-auto [scrollbar-width:thin]"
                >
                  {tracks.map((track, index) => (
                    <div
                      key={track.id}
                      className="shrink-0 border-b border-background/70 px-[5px] last:border-b-0"
                      style={{ height: trackHeight }}
                    >
                      <div
                        className={`h-full min-w-0 transition-opacity ${
                          track.muted || (tracks.some((t) => t.solo) && !track.solo)
                            ? "opacity-40"
                            : ""
                        }`}
                      >
                        <div className="relative h-full">
                          <Waveform
                            duration={duration}
                            view={view}
                            time={Math.max(0, time)}
                            loop={loop}
                            loopActive={loopOn}
                            markers={markers}
                            showMarkerFlags={index === 0}
                            clips={laneClips.get(track.id)}
                            color={track.color}
                            snap={snapTime}
                            snapEdit={snapEdit}
                            fill
                            flush
                            mode="tracks"
                            onSelect={() => setSelectedId(track.id)}
                            onSelectClip={setSelectedClipId}
                            onMoveClip={moveClip}
                            onCropStart={cropStart}
                            onCropEnd={cropEnd}
                            onRepeatEndChange={setRepeatEnd}
                            onPanY={(dy) => scrollTracksBy(-dy)}
                            onContextMenu={(info) => openMenu(info, track)}
                            onZoomAt={zoomAt}
                            onPanBy={panBy}
                            onSeek={seek}
                            onLoopChange={updateLoop}
                            onLoopCommit={(region) => {
                              if (playing) seek(region.start);
                            }}
                          />
                          {recording && armedId === track.id && analyser && (
                            <LiveTrackWaveform
                              analyser={analyser}
                              view={view}
                              getTime={() => engine().getTime()}
                              overlay
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div
                    className="min-h-0 flex-1 cursor-grab active:cursor-grabbing"
                    onPointerDown={startEmptyPan}
                    onPointerMove={moveEmptyPan}
                    onPointerUp={endEmptyPan}
                    onPointerCancel={endEmptyPan}
                  />
                </div>
                <div className="pointer-events-none absolute inset-x-[5px] bottom-0.5 z-30">
                  <div className="pointer-events-auto">
                    <WaveScrollbar
                      thin
                      view={view}
                      duration={Math.max(duration, view.start + view.span)}
                      onChange={(start) => setView((v) => ({ ...v, start }))}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {!recording && monitoring && analyser && (
            <div className="grid items-stretch gap-2" style={gridColumns}>
              <div
                className="flex flex-col justify-center gap-1 rounded-xl bg-surface p-2 text-left"
                style={{ height: LANE_HEIGHT }}
              >
                <p className="flex items-center gap-2 text-sm font-semibold text-danger">
                  {recording && (
                    <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-danger" />
                  )}
                  {recording ? `Track ${tracks.length + 1}` : "Input level"}
                </p>
                <p className="text-xs text-muted">
                  {recording ? (countingIn ? "Count-in…" : "Recording…") : "Listening"}
                </p>
                <LevelBar read={() => readInputLevel(analyser)} active />
              </div>
              <div style={{ height: LANE_HEIGHT }}>
                {recording ? (
                  <LiveTrackWaveform
                    analyser={analyser}
                    view={view}
                    getTime={() => engine().getTime()}
                  />
                ) : (
                  <LiveMeter analyser={analyser} />
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => void addTrack()}
            disabled={recording || finishing}
            className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-surface-hover py-2 text-sm font-medium text-muted transition-colors hover:border-muted hover:text-foreground disabled:opacity-40"
          >
            <PlusIcon className="h-4 w-4" />
            Add track
          </button>

          {tracks.length > 0 && (
            <>
              <div className="grid gap-2" style={gridColumns}>
                <span />
                <div className="flex items-center justify-end gap-1 text-xs text-muted">
                  <button
                    type="button"
                    onClick={() => panBy(-view.span * 0.25)}
                    disabled={!zoomed}
                    aria-label="Pan left"
                    title="Pan left"
                    className={zoomButton}
                  >
                    ◀
                  </button>
                  <button
                    type="button"
                    onClick={() => panBy(view.span * 0.25)}
                    disabled={!zoomed}
                    aria-label="Pan right"
                    title="Pan right"
                    className={zoomButton}
                  >
                    ▶
                  </button>
                  <span className="mx-1 h-5 w-px bg-surface-hover" />
                  <button
                    type="button"
                    onClick={() => zoom(1.5)}
                    aria-label="Zoom out"
                    title="Zoom out"
                    className={zoomButton}
                  >
                    −
                  </button>
                  <span className="w-12 text-center tabular-nums">
                    {duration > 0 ? `${(duration / view.span).toFixed(1)}×` : ""}
                  </span>
                  <button
                    type="button"
                    onClick={() => zoom(1 / 1.5)}
                    aria-label="Zoom in"
                    title="Zoom in"
                    className={zoomButton}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    onClick={() => setView(fitFor(duration))}
                    disabled={!zoomed}
                    className={`${zoomButton} px-3`}
                  >
                    Fit
                  </button>
                  <span className="mx-1 h-5 w-px bg-surface-hover" />
                  <button
                    type="button"
                    onClick={() =>
                      updateSettings({ trackHeight: Math.max(MIN_TRACK_HEIGHT, trackHeight - 24) })
                    }
                    disabled={trackHeight <= MIN_TRACK_HEIGHT}
                    aria-label="Shorter tracks"
                    title="Shorter tracks"
                    className={zoomButton}
                  >
                    <ShrinkHeightIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateSettings({ trackHeight: Math.min(MAX_TRACK_HEIGHT, trackHeight + 24) })
                    }
                    disabled={trackHeight >= MAX_TRACK_HEIGHT}
                    aria-label="Taller tracks"
                    title="Taller tracks"
                    className={zoomButton}
                  >
                    <ExpandHeightIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {notice && <p className="text-sm text-muted">{notice}</p>}
      {error && <p className="text-sm text-danger">{error}</p>}
      {pendingProjectDelete && (
        <ConfirmDialog
          title="Delete this project?"
          message={`"${pendingProjectDelete.name}" and all of its tracks will be removed from this browser. Export what you want to keep first.`}
          confirmLabel="Delete"
          onConfirm={() => void confirmProjectDelete(pendingProjectDelete)}
          onCancel={() => setPendingProjectDelete(null)}
        />
      )}
      {renaming && (
        <PromptDialog
          title="Rename clip"
          initialValue={renaming.name}
          onSubmit={(name) => {
            renameClip(renaming.clipId, name);
            setRenaming(null);
          }}
          onCancel={() => setRenaming(null)}
        />
      )}
      {pendingClipDelete && (
        <ConfirmDialog
          title="Delete this clip?"
          message={`"${pendingClipDelete.clip.name}" will be removed from ${pendingClipDelete.track.name}. This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={() => void deleteClip(pendingClipDelete.track, pendingClipDelete.clip)}
          onCancel={() => setPendingClipDelete(null)}
        />
      )}
      {pendingTrackDelete && (
        <ConfirmDialog
          title="Delete this track?"
          message={`"${pendingTrackDelete.name}" will be removed from the project. This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={() => void confirmTrackDelete(pendingTrackDelete)}
          onCancel={() => setPendingTrackDelete(null)}
        />
      )}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </ToolLayout>
  );
}
