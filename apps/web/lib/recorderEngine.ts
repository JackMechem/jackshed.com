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

export type FinishedTake = { blob: Blob; durationSec: number };

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
let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let countInTimer: ReturnType<typeof setTimeout> | null = null;
let meterFrame: number | null = null;
let meterSource: MediaStreamAudioSourceNode | null = null;
let metronomeRunning = false;

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
  if (!stream) return;
  const mimeType = MIME_CANDIDATES.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t));
  try {
    recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 128000 });
  } catch {
    stopClick();
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
}

export async function startRecording(metronome: RecorderMetronome, options: { autoGain: boolean }) {
  if (snapshot.phase !== "idle") return;
  setSnapshot({ error: null, level: 0, phase: "countin" });
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { autoGainControl: options.autoGain, echoCancellation: false, noiseSuppression: false },
    });
  } catch {
    setSnapshot({ phase: "idle", error: "Microphone access is needed to record." });
    return;
  }
  startMeter(stream);

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
      resolve({ blob, durationSec: startedAt ? (Date.now() - startedAt) / 1000 : 0 });
    };
    rec.stop();
  });
}

export function clearRecorderError() {
  setSnapshot({ error: null });
}
