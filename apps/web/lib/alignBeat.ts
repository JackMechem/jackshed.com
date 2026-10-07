/**
 * Finds how far a recorded clip's hits sit from the nearest beat, so the clip can be nudged
 * onto the grid. Returns the shift to apply to the clip's timeline offset, in seconds, or null
 * if there aren't enough clear hits to tell.
 */
export function alignmentShift(
  buffer: AudioBuffer,
  trimStart: number,
  trimEnd: number,
  offset: number,
  bpm: number,
): number | null {
  const rate = buffer.sampleRate;
  const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
    buffer.getChannelData(c),
  );
  const first = Math.max(1, Math.floor(trimStart * rate));
  const last = Math.min(buffer.length, Math.floor(trimEnd * rate));
  if (last - first < rate * 0.5) return null;

  // Sharp changes in the signal are hits; a slow bass swell barely registers.
  const edge = (i: number) => {
    let sum = 0;
    for (const channel of channels) sum += Math.abs(channel[i] - channel[i - 1]);
    return sum / channels.length;
  };

  let peak = 0;
  for (let i = first; i < last; i++) peak = Math.max(peak, edge(i));
  if (peak < 0.01) return null;

  const threshold = peak * 0.3;
  const quiet = Math.floor(0.08 * rate);
  const beat = 60 / bpm;
  const residuals: number[] = [];
  let lastHit = -quiet;
  for (let i = first; i < last; i++) {
    if (edge(i) > threshold && i - lastHit > quiet) {
      const timeline = offset + (i / rate - trimStart);
      const nearest = Math.round(timeline / beat) * beat;
      residuals.push(timeline - nearest);
      lastHit = i;
    }
  }
  if (residuals.length < 3) return null;

  residuals.sort((a, b) => a - b);
  const median = residuals[Math.floor(residuals.length / 2)];
  return -median;
}
