import { detectPitch } from '@jam-practice/core/pitchDetect';
import { requestRecordingPermissionsAsync } from 'expo-audio';
import { AudioRecorder } from 'react-native-audio-api';

/**
 * The native sibling of `apps/web/lib/audioInput.ts` — same shape (open the mic, report a pitch
 * reading, `stop()` to release it), built on `react-native-audio-api`'s `AudioRecorder` instead of
 * `getUserMedia`/`AnalyserNode`. No input-device picker on native (unlike web, which lists
 * `MediaDeviceInfo`s) — `AudioRecorder` always records through whatever the OS currently treats as
 * the active input, and there's no equivalent device-enumeration API exposed here to pick a
 * specific one from.
 *
 * **A real, confirmed-on-device bug, not a hypothetical one, shaped this file's own design**:
 * the first version requested `AudioRecorder.onAudioReady` buffers at `ANALYSIS_WINDOW` (4096)
 * samples directly, matching web's own `AnalyserNode.fftSize` — reported back as "the pitch
 * indicator is very choppy and slow, like it's 10fps." That's exactly what the math predicts:
 * `onAudioReady` is push-based, one callback per `bufferLength` samples delivered, so a 4096-sample
 * request means one update every `4096 / 44100 ≈ 93ms` — about 10.7Hz, matching the reported
 * symptom precisely. Web never had this problem because `AnalyserNode` is a continuously-updating
 * ring buffer the app polls independently of its own FFT size (`lib/audioInput.ts`'s own
 * `FRAME_INTERVAL_MS = 30`, decoupled from `FFT_SIZE`) — every poll re-reads the *latest* window
 * regardless of how much genuinely-new audio arrived since the last one.
 *
 * Fixed by reproducing that same decoupling here: request much smaller chunks
 * (`CHUNK_LENGTH`, ~23ms worth) so callbacks arrive far more often, and maintain a rolling
 * `ANALYSIS_WINDOW`-sized buffer (a manual FIFO — shift left by the new chunk's length, append the
 * chunk at the end) that `detectPitch` reads from — so the window always has fresh recent history
 * regardless of how small each individual delivered chunk is.
 *
 * **That fix then caused a real, confirmed-on-device regression of its own: "the whole app
 * freezes when I start the tuner."** Running `detectPitch` — an O(maxTau × window/2) YIN search,
 * several million operations per call — on *every* ~23ms callback (4× more often than the original
 * 93ms bug) overloaded the JS thread: Hermes (React Native's JS engine) has nowhere near V8's
 * JIT optimization for tight numeric loops, so each call plausibly took longer than the 23ms it had
 * to run in, and callbacks piled up faster than they could be processed — the same JS thread also
 * owns touch handling and rendering, so a backlog there reads as the whole app hanging, not just
 * the tuner. Fixed by decoupling the two: the cheap FIFO window update still runs on *every*
 * callback (trivial — one `copyWithin` plus a bounded loop over `CHUNK_LENGTH` samples), but the
 * expensive RMS + `detectPitch` + `onFrame` only runs when `ANALYSIS_INTERVAL_MS` has genuinely
 * elapsed since the last one — throttled well inside Hermes's real budget, not just "less often
 * than before" by feel.
 *
 * **A second real, reported gap**: "not nearly sensitive enough... on Total Energy I can tune my
 * bass guitar without an amp." `react-native-audio-api`'s `AudioRecorder` captures through
 * Android's `VOICE_RECOGNITION` audio source (confirmed on-device via `logcat`, not configurable
 * from this library's JS API at all — `AudioManager`'s own `SessionOptions` is entirely
 * `ios*`-prefixed, no Android source/gain knob exists to reach for here), which applies
 * comparatively conservative hardware gain versus whatever a dedicated tuner app like Total Energy
 * does internally.
 *
 * The first attempt at fixing this was a **fixed** software multiplier (`×8`) — reported back as
 * still not detecting a quiet unamplified bass pluck at all. A fixed multiplier was always the
 * wrong shape for this: there's no one right constant that works both for a loud slap and a quiet
 * open-string pluck. Replaced with **adaptive peak normalization**: before every analysis pass,
 * measure the *current* window's own peak amplitude and scale the whole window so that peak lands
 * at `TARGET_PEAK`, clamped to `MAX_GAIN` so near-total silence isn't amplified into a false
 * "there's a signal here." Still reported back as barely registering.
 *
 * **Diagnostic logging (temporarily added directly to this file, see `console.log` calls below)
 * revealed the real problem, not guessed**: RMS stayed elevated (roughly 0.08–0.24) and
 * essentially *flat* regardless of how much gain the adaptive step applied (which itself swung
 * from 6.6× to 46.8× across the same few seconds) — the signature of the *peak itself* being
 * dominated by broadband noise rather than the bass tone, not a signal that's merely quiet. Gain
 * cannot fix this: amplifying a signal that's already noise-dominated amplifies the noise and the
 * tone by the same ratio, so the signal-to-noise ratio — the actual thing standing between "YIN
 * can find a clean periodic dip" and "it can't" — never improves, no matter how large the
 * multiplier. Confirmed directly by the same log: real detections (`freq=55.1`/`55.2`, matching
 * A1 — the bass's own A string — at 55.00Hz almost exactly) *did* appear, just as rare, isolated
 * single frames swamped by `null`s on every side, which is exactly why `tunerEngine.ts`'s own
 * "two consecutive matching frames before committing to a reading" smoothing almost never got to
 * fire.
 *
 * Fixed at the actual source: a one-pole low-pass filter (`LOWPASS_ALPHA`, cutoff
 * `LOWPASS_CUTOFF_HZ`) applied to every incoming chunk, *before* anything else touches it —
 * suppressing broadband/high-frequency noise so the peak the adaptive-gain step measures (and the
 * waveform `detectPitch` actually analyzes) is dominated by the bass's own fundamental and its
 * lowest harmonics again, not noise riding on top of a quiet tone. The filter's own state
 * (`lpState`) is a single running value carried across every callback for the life of one
 * `startAudioInput` call — a true continuous IIR filter, not reset per chunk or per analysis
 * window, which matters: resetting it at a chunk boundary would reintroduce exactly the kind of
 * discontinuity (a sudden jump back toward zero) this filter exists to avoid. `detectPitch`'s own
 * YIN algorithm is still amplitude-invariant either way, so filtering doesn't change *which* pitch
 * it finds — it changes whether the window handed to it is clean enough to find one at all.
 */
export type InputFrame = {
  /** Detected fundamental in Hz, or null when nothing clear is being played. */
  freq: number | null;
  /** Signal strength as an RMS value (0–1). */
  level: number;
};

export type AudioInput = { stop: () => void };

/** How quiet a signal can be before it's treated as silence — same labels/values as web's own. */
export const SENSITIVITY: Record<string, { label: string; rms: number }> = {
  low: { label: 'Low (noisy room)', rms: 0.02 },
  normal: { label: 'Normal', rms: 0.008 },
  high: { label: 'High (quiet input)', rms: 0.003 },
};

/** The window size handed to `detectPitch` on every callback — large enough for YIN to resolve a
    low bass string's fundamental (B0 ≈ 31Hz needs roughly `sampleRate / 31 ≈ 1420` samples of
    history just for one period; this is a comfortable multiple of that). */
const ANALYSIS_WINDOW = 4096;
/** How many samples `AudioRecorder` is asked to deliver per callback — small on purpose, so
    callbacks (and therefore pitch updates) arrive roughly every `CHUNK_LENGTH / sampleRate ≈ 23ms`
    (~43Hz), independent of `ANALYSIS_WINDOW`'s own size. See this file's own doc comment for the
    real, on-device-confirmed bug this fixes. */
const CHUNK_LENGTH = 1024;
/** How often the expensive RMS + `detectPitch` pass actually runs — deliberately well above
    `CHUNK_LENGTH`'s own ~23ms delivery cadence (see this file's own doc comment for the real,
    on-device thread-starvation bug that taught this the hard way). 50ms (20Hz) is comfortably
    smoother than the original 93ms bug while leaving real headroom for Hermes to finish each YIN
    pass before the next one is due, rather than cutting it as close as the delivery cadence would
    allow. */
const ANALYSIS_INTERVAL_MS = 50;
const SILENCE_RMS = 0.008;
/** Adaptive-gain constants — see this file's own doc comment for why a fixed multiplier was tried
    first and replaced with this. Every analysis pass scales the current window so its own peak
    lands at `TARGET_PEAK`, clamped to `MAX_GAIN` so near-silence isn't amplified into a false
    signal; `MIN_PEAK_FOR_GAIN` is the floor `TARGET_PEAK / peak` divides by, so a literally-zero
    peak can't divide by zero. */
const TARGET_PEAK = 0.5;
const MAX_GAIN = 60;
const MIN_PEAK_FOR_GAIN = 0.0005;
const SAMPLE_RATE = 44100;
/** A one-pole low-pass filter cutoff. 600Hz — well above a 4-string bass's fundamental range
    (E1 ≈ 41Hz up to G2 ≈ 98Hz; B0 ≈ 31Hz on a 5-string) but low enough to suppress real broadband
    noise — showed a clear, repeated, multi-string improvement in live on-device logging: real
    detections went from ~1-in-60 isolated frames to short clusters of 2-4 consecutive hits across
    both an E1 and an A1 pluck. A follow-up try at 300Hz (reasoned as "even less room for noise to
    hide in") instead measured *zero* detections in its own on-device trial — but that comparison
    wasn't a controlled one (unconfirmed whether a pluck actually landed inside that capture
    window, and the logged sensitivity setting had also changed between the two runs), so it isn't
    trusted as proof 300Hz is actually worse, just not evidence it's better either. Kept at the one
    value with an actual clean, repeated track record rather than keep tuning blind against
    single noisy trials — see this file's own doc comment above for the full story. */
const LOWPASS_CUTOFF_HZ = 600;
/** `dt / (RC + dt)` for a standard one-pole RC low-pass, `RC = 1 / (2π·cutoff)`, `dt = 1/sampleRate`
    — precomputed once since both inputs are fixed constants. */
const LOWPASS_ALPHA = (() => {
  const rc = 1 / (2 * Math.PI * LOWPASS_CUTOFF_HZ);
  const dt = 1 / SAMPLE_RATE;
  return dt / (rc + dt);
})();

/** Opens the mic and reports a detected pitch roughly 40+ times a second (see this file's own doc
    comment for why that's decoupled from the analysis window size). Rejects if the recording
    permission is denied or the native recorder fails to start — callers should treat that the same
    as web's own `getUserMedia` rejection. */
export async function startAudioInput(
  onFrame: (frame: InputFrame) => void,
  /** Signals quieter than this RMS are treated as silence. Read on every frame. */
  getSilenceRms: () => number = () => SILENCE_RMS,
): Promise<AudioInput> {
  const { granted } = await requestRecordingPermissionsAsync();
  if (!granted) throw new Error('Microphone permission not granted');

  const recorder = new AudioRecorder();
  let stopped = false;

  // A manual FIFO ring buffer: each incoming (small) chunk shifts the window left by its own
  // length and appends itself at the end, so analysis always reads the most recent
  // `ANALYSIS_WINDOW` samples regardless of how small each individual delivered chunk is. Holds
  // *low-pass-filtered* samples (see the low-pass block below) but *unboosted* ones — gain is
  // derived fresh from this window's own true (filtered) peak on every analysis pass, not
  // compounded from previously-boosted samples still sitting in the overlap. This part runs on
  // *every* callback — it's cheap (one `copyWithin` plus a bounded loop over `CHUNK_LENGTH`
  // samples) and keeps the window's history fresh even on callbacks where the expensive analysis
  // below is skipped.
  const window = new Float32Array(ANALYSIS_WINDOW);
  // The gain-adjusted copy actually handed to `detectPitch` — separate from `window` so boosting
  // never mutates the raw history other callbacks still read from.
  const scratch = new Float32Array(ANALYSIS_WINDOW);
  // A reusable scratch buffer for the low-pass-filtered version of each incoming chunk — sized
  // for the common case (`CHUNK_LENGTH`) and grown on the rare occasion a device delivers a
  // bigger one, rather than allocating fresh on every single callback.
  let filteredChunk = new Float32Array(CHUNK_LENGTH);
  let lpState = 0;
  let filled = 0;
  let lastAnalysisAt = 0;

  recorder.onAudioReady(
    { sampleRate: SAMPLE_RATE, bufferLength: CHUNK_LENGTH, channelCount: 1 },
    ({ buffer }) => {
      if (stopped) return;
      const chunk = buffer.getChannelData(0);
      const n = chunk.length;

      // Continuous one-pole low-pass, applied to every chunk before anything else touches it —
      // `lpState` carries across calls so this is a genuine running filter, not reset per chunk.
      if (filteredChunk.length < n) filteredChunk = new Float32Array(n);
      let y = lpState;
      for (let i = 0; i < n; i++) {
        y += LOWPASS_ALPHA * (chunk[i] - y);
        filteredChunk[i] = y;
      }
      lpState = y;

      if (n >= ANALYSIS_WINDOW) {
        window.set(filteredChunk.subarray(n - ANALYSIS_WINDOW, n));
        filled = ANALYSIS_WINDOW;
      } else {
        window.copyWithin(0, n);
        window.set(filteredChunk.subarray(0, n), ANALYSIS_WINDOW - n);
        filled = Math.min(ANALYSIS_WINDOW, filled + n);
      }
      // Not enough real history yet (the first few callbacks right after starting) — a window
      // that's part silence-padding would misread as a false "detected" pitch.
      if (filled < ANALYSIS_WINDOW) return;

      // The expensive part (peak scan + RMS + YIN) is throttled separately from how often chunks
      // arrive — see this file's own doc comment for the real thread-starvation bug this fixes.
      const now = Date.now();
      if (now - lastAnalysisAt < ANALYSIS_INTERVAL_MS) return;
      lastAnalysisAt = now;

      let peak = 0;
      for (let i = 0; i < window.length; i++) {
        const abs = Math.abs(window[i]);
        if (abs > peak) peak = abs;
      }
      const gain = Math.min(MAX_GAIN, TARGET_PEAK / Math.max(peak, MIN_PEAK_FOR_GAIN));

      let sumSquares = 0;
      for (let i = 0; i < window.length; i++) {
        const boosted = window[i] * gain;
        scratch[i] = boosted;
        sumSquares += boosted * boosted;
      }
      const rms = Math.sqrt(sumSquares / scratch.length);
      const freq = rms < getSilenceRms() ? null : detectPitch(scratch, buffer.sampleRate);
      onFrame({ freq, level: rms });
    },
  );

  const result = await recorder.start();
  if (result.status !== 'success') {
    recorder.clearOnAudioReady();
    throw new Error('Failed to start the audio recorder');
  }

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      recorder.clearOnAudioReady();
      void recorder.stop();
    },
  };
}
