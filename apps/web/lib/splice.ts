import { clipLength, trackEndTime } from "@/lib/multitrack";

type ClipLike = {
  buffer: AudioBuffer;
  offset: number;
  trimStart: number;
  trimEnd: number;
  repeatEnd: number | null;
};

/**
 * Renders a clip's audio, with its trim and repeats baked in, into one plain stereo buffer that
 * starts at the returned timeline position.
 */
export function bakeClipAudio(
  ctx: BaseAudioContext,
  clip: ClipLike,
): { buffer: AudioBuffer; start: number } {
  const rate = clip.buffer.sampleRate;
  const start = clip.offset;
  const end = trackEndTime(clip);
  const total = Math.max(1, Math.ceil((end - start) * rate));
  const out = [new Float32Array(total), new Float32Array(total)];

  const length = clipLength(clip);
  const clipSamples = Math.floor(length * rate);
  const from = Math.floor(clip.trimStart * rate);
  for (let channel = 0; channel < 2; channel++) {
    const source = clip.buffer.getChannelData(Math.min(channel, clip.buffer.numberOfChannels - 1));
    for (let k = 0; ; k++) {
      const iterStart = start + k * length;
      if (iterStart >= end - 1e-6) break;
      const copyLength = Math.min(clipSamples, Math.floor((end - iterStart) * rate));
      const target = Math.round((iterStart - start) * rate);
      for (let i = 0; i < copyLength; i++) {
        const value = source[from + i];
        const index = target + i;
        if (value !== undefined && index >= 0 && index < total) out[channel][index] = value;
      }
    }
  }

  const buffer = ctx.createBuffer(2, total, rate);
  buffer.copyToChannel(out[0], 0);
  buffer.copyToChannel(out[1], 1);
  return { buffer, start };
}
