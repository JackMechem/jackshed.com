import { getAudioContext } from "@/lib/metronome";
import { detectPitch } from "@/lib/pitchDetect";

export type InputDevice = { id: string; label: string };

export type InputFrame = {
  /** Detected fundamental in Hz, or null when nothing clear is being played. */
  freq: number | null;
  /** Signal strength as an RMS value (0–1). */
  level: number;
};

export type AudioInput = { stop: () => void };

/** How quiet a signal can be before it's treated as silence. */
export const SENSITIVITY: Record<string, { label: string; rms: number }> = {
  low: { label: "Low (noisy room)", rms: 0.02 },
  normal: { label: "Normal", rms: 0.008 },
  high: { label: "High (quiet input)", rms: 0.003 },
};

const FFT_SIZE = 4096;
const FRAME_INTERVAL_MS = 30;
const SILENCE_RMS = 0.008;

export async function listAudioInputs(): Promise<InputDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default")
    .map((d, i) => ({ id: d.deviceId, label: d.label || `Input ${i + 1}` }));
}

export async function openStream(deviceId: string, channels?: number): Promise<MediaStream> {
  // Processing designed for voice calls would smear the pitch, so turn it all off.
  const base = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    ...(channels ? { channelCount: { ideal: channels } } : {}),
  };
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: deviceId ? { ...base, deviceId: { exact: deviceId } } : base,
    });
  } catch (error) {
    if (deviceId && error instanceof DOMException && error.name === "OverconstrainedError") {
      return navigator.mediaDevices.getUserMedia({ audio: base });
    }
    throw error;
  }
}

/** Opens the chosen input (microphone or audio interface) and reports the pitch ~30 times a second. */
export async function startAudioInput(
  deviceId: string,
  onFrame: (frame: InputFrame) => void,
  /** Signals quieter than this RMS are treated as silence. Read on every frame. */
  getSilenceRms: () => number = () => SILENCE_RMS,
): Promise<AudioInput> {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") await ctx.resume();
  const stream = await openStream(deviceId);

  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = 0;
  source.connect(analyser);

  const buffer = new Float32Array(analyser.fftSize);
  const id = setInterval(() => {
    analyser.getFloatTimeDomainData(buffer);
    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i++) sumSquares += buffer[i] * buffer[i];
    const rms = Math.sqrt(sumSquares / buffer.length);
    onFrame({
      freq: rms < getSilenceRms() ? null : detectPitch(buffer, ctx.sampleRate),
      level: rms,
    });
  }, FRAME_INTERVAL_MS);

  return {
    stop: () => {
      clearInterval(id);
      source.disconnect();
      for (const track of stream.getTracks()) track.stop();
    },
  };
}
