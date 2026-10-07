const YIN_THRESHOLD = 0.15;

/**
 * Estimates the fundamental frequency of a mono buffer with the YIN algorithm.
 * Returns null when no clear pitch is found (silence, noise, chords).
 */
export function detectPitch(
  buffer: Float32Array,
  sampleRate: number,
  minHz = 30,
  maxHz = 2000,
): number | null {
  const half = buffer.length >> 1;
  const maxTau = Math.min(half - 1, Math.floor(sampleRate / minHz));
  const minTau = Math.max(2, Math.floor(sampleRate / maxHz));

  // Difference function with cumulative mean normalisation.
  const cmnd = new Float32Array(maxTau + 1);
  cmnd[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < half; i++) {
      const delta = buffer[i] - buffer[i + tau];
      sum += delta * delta;
    }
    runningSum += sum;
    cmnd[tau] = runningSum === 0 ? 1 : (sum * tau) / runningSum;
  }

  // First dip below the threshold, followed down to its local minimum.
  let tau = minTau;
  while (tau <= maxTau) {
    if (cmnd[tau] < YIN_THRESHOLD) {
      while (tau + 1 <= maxTau && cmnd[tau + 1] < cmnd[tau]) tau++;
      break;
    }
    tau++;
  }
  if (tau > maxTau) return null;

  // Parabolic interpolation around the minimum for sub-sample accuracy.
  const prev = cmnd[tau - 1];
  const next = tau + 1 <= maxTau ? cmnd[tau + 1] : cmnd[tau];
  const denominator = prev + next - 2 * cmnd[tau];
  const shift = denominator === 0 ? 0 : (prev - next) / (2 * denominator);
  return sampleRate / (tau + shift);
}
