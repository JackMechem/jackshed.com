/**
 * The Recorder's engine on the web — the sibling of `apps/mobile/src/lib/recorderEngine.ts`: one
 * microphone take via the browser's `MediaRecorder`, optionally with the metronome
 * (`lib/metronomeEngine.ts`, the Metronome tool's own engine) clicking along and counting you in.
 * A plain module, so a take keeps recording while you navigate around the site.
 *
 * **Auto gain** is the browser's own `autoGainControl` on the microphone; echo cancellation and
 * noise suppression are always off (they mangle music). The file format is whatever the browser
 * records best: AAC in an MP4 container where supported (plays everywhere, including the app),
 * else Opus in WebM.
 *
 * **The tune's song** can play along (`song`): it starts with the take (after any count-in), and
 * the finished take carries `songOffsetSec` — where in the song the take started, less the time
 * the song took to start and the round-trip audio latency, so playing back over the song lines
 * up the way it sounded while recording (the recording page can nudge it from there).
 */

import { convertTempo } from "@/lib/meterControls";
import {
  type MetronomeSettingsInput,
  type MetronomeStructureInput,
  startMetronome,
  stopMetronome,
  updateMetronomeSettings,
  updateMetronomeStructure,
} from "@/lib/metronomeEngine";
import { getAudioContext } from "@/lib/metronome";
import { sectionAt } from "@/lib/structure";

export type RecorderMetronome = {
  enabled: boolean;
  settings: MetronomeSettingsInput;
  structure: MetronomeStructureInput;
  countInBars: number;
};

export type RecorderPhase = "idle" | "countin" | "recording" | "finishing";

export interface RecorderSnapshot {
  phase: RecorderPhase;
  startedAt: number | null;
  /** Input level, roughly 0..1. */
  level: number;
  error: string | null;
}

export type FinishedTake = { blob: Blob; durationSec: number; songOffsetSec?: number };

export type RecorderSong = { url: string; startSec: number; volume: number };

/** Mono: record one channel, played in both ears — from both inputs mixed, or just one of them
    (for an interface that puts a single mic on the left or right only). */
export type RecorderMono = "mix" | "left" | "right";

const MIME_CANDIDATES = ["audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/webm;codecs=opus", "audio/webm"];

let snapshot: RecorderSnapshot = { phase: "idle", startedAt: null, level: 0, error: null };
const SERVER_SNAPSHOT = snapshot;
const listeners = new Set<() => void>();

function setSnapshot(patch: Partial<RecorderSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const listener of listeners) listener();
}

export function subscribeRecorder(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function getRecorderSnapshot(): RecorderSnapshot {
  return snapshot;
}
export function getRecorderServerSnapshot(): RecorderSnapshot {
  return SERVER_SNAPSHOT;
}

let stream: MediaStream | null = null;
/** What's actually recorded: the microphone, or its mono version. */
let recordStream: MediaStream | null = null;
let monoNodes: AudioNode[] = [];

/** A one-channel stream from the microphone, through Web Audio. */
function monoStream(input: MediaStream, mode: RecorderMono): MediaStream {
  const ctx = getAudioContext();
  void ctx.resume();
  const source = ctx.createMediaStreamSource(input);
  const dest = ctx.createMediaStreamDestination();
  dest.channelCount = 1;
  dest.channelCountMode = "explicit";
  if (mode === "mix") {
    // Down-mixing to one channel averages left and right.
    const gain = ctx.createGain();
    gain.channelCount = 1;
    gain.channelCountMode = "explicit";
    gain.channelInterpretation = "speakers";
    source.connect(gain).connect(dest);
    monoNodes = [source, gain, dest];
  } else {
    const split = ctx.createChannelSplitter(2);
    source.connect(split);
    // A mono microphone has no right channel; then "right" falls back to the one it has.
    const channels = input.getAudioTracks()[0]?.getSettings().channelCount ?? 2;
    split.connect(dest, mode === "right" && channels > 1 ? 1 : 0);
    monoNodes = [source, split, dest];
  }
  return dest.stream;
}
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let countInTimer: ReturnType<typeof setTimeout> | null = null;
let meterFrame: number | null = null;
let meterSource: MediaStreamAudioSourceNode | null = null;
let metronomeRunning = false;
let songEl: HTMLAudioElement | null = null;
let songStartSec = 0;
let songOffsetSec: number | undefined;

function stopSong() {
  songEl?.pause();
  songEl?.removeAttribute("src");
  songEl?.load();
  songEl = null;
}

/** Changes the song's volume while it plays along. */
export function setRecorderSongVolume(volume: number) {
  if (songEl) songEl.volume = Math.min(1, Math.max(0, volume));
}

/** Output + input latency, as well as the browser can tell (seconds). */
function roundTripLatency(): number {
  const ctx = getAudioContext();
  const out = (ctx as AudioContext & { outputLatency?: number }).outputLatency || ctx.baseLatency || 0;
  const track = stream?.getAudioTracks()[0];
  const input = (track?.getSettings() as MediaTrackSettings & { latency?: number } | undefined)?.latency ?? 0;
  return out + input;
}

function stopClick() {
  if (metronomeRunning) stopMetronome();
  metronomeRunning = false;
}

function releaseInput() {
  if (meterFrame !== null) cancelAnimationFrame(meterFrame);
  meterFrame = null;
  meterSource?.disconnect();
  meterSource = null;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  if (recordStream !== null) for (const node of monoNodes) node.disconnect();
  monoNodes = [];
  recordStream = null;
}

/** Live changes to the metronome while a take is running (tempo, accents, sound, …). */
export function updateRecorderMetronome(m: RecorderMetronome) {
  if (!metronomeRunning) return;
  updateMetronomeSettings(m.settings);
  updateMetronomeStructure(m.structure);
}

function startMeter(input: MediaStream) {
  const ctx = getAudioContext();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  meterSource = ctx.createMediaStreamSource(input);
  meterSource.connect(analyser);
  const data = new Float32Array(analyser.fftSize);
  let last = 0;
  const tick = (now: number) => {
    if (now - last > 70) {
      last = now;
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      setSnapshot({ level: Math.min(1, Math.sqrt(sum / data.length) * 4) });
    }
    meterFrame = requestAnimationFrame(tick);
  };
  meterFrame = requestAnimationFrame(tick);
}

function beginRecording() {
  countInTimer = null;
  if (!stream || !recordStream) return;
  const mimeType = MIME_CANDIDATES.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
  try {
    recorder = new MediaRecorder(recordStream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 128000 });
  } catch {
    stopClick();
    stopSong();
    releaseInput();
    setSnapshot({ phase: "idle", error: "This browser can't record audio." });
    return;
  }
  chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  recorder.start(1000);
  setSnapshot({ phase: "recording", startedAt: Date.now(), error: null });
  if (songEl) {
    const el = songEl;
    const t0 = performance.now();
    el.addEventListener(
      "playing",
      () => {
        const delay = (performance.now() - t0) / 1000;
        songOffsetSec = Math.round((songStartSec - delay - roundTripLatency()) * 1000) / 1000;
      },
      { once: true },
    );
    void el.play().catch(() => {});
  }
}

export async function startRecording(
  metronome: RecorderMetronome,
  options: { autoGain: boolean; mono?: RecorderMono | null; song?: RecorderSong | null },
) {
  if (snapshot.phase !== "idle") return;
  setSnapshot({ error: null, level: 0, phase: "countin" });
  songOffsetSec = undefined;
  if (options.song) {
    // Loaded (and parked at its start point) during the count-in, so it starts right away.
    const el = new Audio(options.song.url);
    el.preload = "auto";
    el.volume = Math.min(1, Math.max(0, options.song.volume));
    songStartSec = Math.max(0, options.song.startSec);
    el.currentTime = songStartSec;
    el.addEventListener("loadedmetadata", () => (el.currentTime = songStartSec), { once: true });
    songEl = el;
  }
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { autoGainControl: options.autoGain, echoCancellation: false, noiseSuppression: false },
    });
  } catch {
    stopSong();
    setSnapshot({ phase: "idle", error: "Microphone access is needed to record." });
    return;
  }
  recordStream = options.mono ? monoStream(stream, options.mono) : stream;
  startMeter(recordStream);

  if (metronome.enabled) {
    const { settings, structure } = metronome;
    updateMetronomeStructure(structure);
    updateMetronomeSettings(settings);
    startMetronome();
    metronomeRunning = true;
    // Whole bars of whatever plays first, at the real click rate.
    const first = structure.useStructure && structure.structure.form.length > 0 ? sectionAt(structure.structure, 0) : null;
    const beats = first?.beatsPerBar ?? settings.beatsPerBar;
    const beatUnit = first?.beatUnit ?? settings.beatUnit;
    const clickBpm = settings.tempoNoteValue ? convertTempo(settings.bpm, settings.tempoNoteValue, beatUnit) : settings.bpm;
    const countInMs = Math.max(0, Math.round(metronome.countInBars)) * beats * (60000 / clickBpm);
    if (countInMs > 0) {
      countInTimer = setTimeout(beginRecording, countInMs + 60);
      return;
    }
  }
  beginRecording();
}

/** Stops the take and returns it, or null if nothing was recorded (stopped during the count-in). */
export function stopRecording(): Promise<FinishedTake | null> {
  if (countInTimer) {
    clearTimeout(countInTimer);
    countInTimer = null;
    stopClick();
    stopSong();
    releaseInput();
    setSnapshot({ phase: "idle", startedAt: null, level: 0 });
    return Promise.resolve(null);
  }
  const rec = recorder;
  const startedAt = snapshot.startedAt;
  if (!rec) return Promise.resolve(null);
  recorder = null;
  setSnapshot({ phase: "finishing" });
  stopClick();
  const hadSong = songEl !== null;
  stopSong();
  // The song never got going (blocked, or stopped first): start the line-up at its start point.
  const offset = hadSong ? (songOffsetSec ?? songStartSec) : undefined;
  return new Promise((resolve) => {
    rec.onstop = () => {
      releaseInput();
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      chunks = [];
      setSnapshot({ phase: "idle", startedAt: null, level: 0 });
      if (!blob.size) {
        setSnapshot({ error: "Nothing was recorded." });
        resolve(null);
        return;
      }
      resolve({ blob, durationSec: startedAt ? (Date.now() - startedAt) / 1000 : 0, ...(offset !== undefined ? { songOffsetSec: offset } : {}) });
    };
    rec.stop();
  });
}

export function clearRecorderError() {
  setSnapshot({ error: null });
}
