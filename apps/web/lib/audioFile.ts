import { getAudioContext } from "@/lib/metronome";

/** Min/max amplitude per block of samples, enough to draw a waveform at any zoom. */
export type Peaks = {
  min: Float32Array;
  max: Float32Array;
  /** Samples per block. */
  bucket: number;
  sampleRate: number;
  duration: number;
  /** Multiply amplitudes by this so quiet files still fill the display. */
  scale: number;
};

const BUCKET = 128;

/** Decodes an audio (or video) file's audio track and reduces it to waveform peaks. */
export async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  return getAudioContext().decodeAudioData(await blob.arrayBuffer());
}

export async function analyzeAudio(file: Blob): Promise<Peaks> {
  return peaksOf(await decodeBlob(file));
}

/** Reduces a decoded buffer to waveform peaks. */
export function peaksOf(buffer: AudioBuffer): Peaks {
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
    buffer.getChannelData(c),
  );
  const length = buffer.length;
  const buckets = Math.ceil(length / BUCKET);
  const min = new Float32Array(buckets);
  const max = new Float32Array(buckets);
  let peak = 0;

  for (let b = 0; b < buckets; b++) {
    const start = b * BUCKET;
    const end = Math.min(length, start + BUCKET);
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = start; i < end; i++) {
      let v = 0;
      for (let c = 0; c < channels.length; c++) v += channels[c][i];
      v /= channels.length;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min[b] = lo;
    max[b] = hi;
    peak = Math.max(peak, -lo, hi);
  }

  return {
    min,
    max,
    bucket: BUCKET,
    sampleRate: buffer.sampleRate,
    duration: buffer.duration,
    scale: 1 / Math.max(peak, 0.02),
  };
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = safe - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}
