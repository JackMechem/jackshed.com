/**
 * Automatic alignment for recordings. Just before a recording stops, a short pattern of
 * bursts is played into the recorder's own input. Finding the pattern in the recorded file
 * shows exactly how the file's clock relates to the audio clock, so the take can be placed on
 * the timeline without any manual latency setting.
 */

const BURST_SECONDS = 0.006;
const BURST_HZ = 4000;
/** Seconds after the first burst; the spacing is unique so the pattern can be recognised. */
const PATTERN = [0, 0.1, 0.35];
/** Time from the first burst to the end of the pattern, plus a little room. */
export const PATTERN_SECONDS = PATTERN[PATTERN.length - 1] + BURST_SECONDS + 0.2;

export function scheduleSyncBursts(
  ctx: BaseAudioContext,
  destination: AudioNode,
  when: number,
): void {
  const length = Math.round(BURST_SECONDS * ctx.sampleRate);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.sin((2 * Math.PI * BURST_HZ * i) / ctx.sampleRate) * 0.9;
  }
  for (const offset of PATTERN) {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);
    source.start(when + offset);
  }
}

/** Finds the first burst of the pattern near the end of a recording; returns its time in seconds. */
export function findSyncBurst(buffer: AudioBuffer): number | null {
  const rate = buffer.sampleRate;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
    buffer.getChannelData(c),
  );
  const first = Math.max(1, buffer.length - Math.floor(2.5 * rate));

  // High-pass by differencing so bass notes barely register but the 4 kHz bursts stand out.
  const edge = (i: number) => {
    let sum = 0;
    for (const channel of channels) sum += Math.abs(channel[i] - channel[i - 1]);
    return sum / channels.length;
  };

  let peak = 0;
  for (let i = first; i < buffer.length; i++) peak = Math.max(peak, edge(i));
  if (peak < 0.05) return null;

  const threshold = peak * 0.4;
  const quiet = Math.floor(0.03 * rate);
  const onsets: number[] = [];
  let last = -quiet;
  for (let i = first; i < buffer.length; i++) {
    if (edge(i) > threshold && i - last > quiet) {
      onsets.push(i / rate);
      last = i;
    }
  }

  const near = (t: number) => onsets.some((o) => Math.abs(o - t) < 0.02);
  for (const onset of onsets) {
    if (PATTERN.slice(1).every((offset) => near(onset + offset))) return onset;
  }
  return null;
}
