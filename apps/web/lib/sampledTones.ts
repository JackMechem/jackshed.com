import { noteToFrequency } from "@/lib/noteRange";

/**
 * Real recorded instrument samples for the "Piano" and "Rhodes" tones, replacing what used to be
 * from-scratch Web Audio synthesis (`lib/tones.ts`'s old `pianoTone`/`rhodesTone`) — this app's
 * first actual audio *assets*. Samples aren't bundled in the repo; they're fetched from their
 * origin CDN the first time a given note is actually needed (matching a normal browser's own HTTP
 * caching after that — no bespoke persistence layer needed here) and decoded once into an
 * `AudioBuffer`, then reused for every later play of that exact sample. A requested note that
 * doesn't have its own recording gets the *nearest* recorded one, pitch-shifted via
 * `playbackRate` up or down to the exact target frequency — continuous, not limited to semitone
 * steps, the same as the synthesized tones could render any frequency exactly.
 *
 * Both sets are CC-BY 3.0 — attribution lives on `/credits`, linked from the site footer.
 */

type SampleNote = { note: string; freq: number; file: string };
type SampleSet = { baseUrl: string; notes: SampleNote[] };
export type SampledInstrumentId = "piano" | "rhodes";

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/** This app's own note-name spelling (sharps, e.g. "C#4") for a MIDI note number, so each sample
    can be run through the same `noteToFrequency` every other note name in this app already uses. */
function midiToAppName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${SHARP_NAMES[pc]}${octave}`;
}

/** The flat-spelled note name (e.g. "Db4") the electric piano set's own filenames use. */
function midiToFlatName(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${FLAT_NAMES[pc]}${octave}`;
}

function buildSampleNote(note: string, file: string): SampleNote {
  const freq = noteToFrequency(note);
  if (freq === null) throw new Error(`Invalid sample note name: ${note}`);
  return { note, freq, file: `${file}.mp3` };
}

// Salamander Grand Piano (Alexander Holm, CC-BY 3.0), rendered to mp3 and hosted by the Tone.js
// project. Sampled at A/C/D#/F# every octave from A0 to C8 (30 notes) — sparser than the electric
// piano set below, so a played note further from its nearest sample gets pitch-shifted a bit
// more, but still reads as a real piano rather than a synth.
const PIANO_SAMPLES: [note: string, file: string][] = [
  ["A0", "A0"],
  ["C1", "C1"], ["D#1", "Ds1"], ["F#1", "Fs1"], ["A1", "A1"],
  ["C2", "C2"], ["D#2", "Ds2"], ["F#2", "Fs2"], ["A2", "A2"],
  ["C3", "C3"], ["D#3", "Ds3"], ["F#3", "Fs3"], ["A3", "A3"],
  ["C4", "C4"], ["D#4", "Ds4"], ["F#4", "Fs4"], ["A4", "A4"],
  ["C5", "C5"], ["D#5", "Ds5"], ["F#5", "Fs5"], ["A5", "A5"],
  ["C6", "C6"], ["D#6", "Ds6"], ["F#6", "Fs6"], ["A6", "A6"],
  ["C7", "C7"], ["D#7", "Ds7"], ["F#7", "Fs7"], ["A7", "A7"],
  ["C8", "C8"],
];

// FluidR3 GM SoundFont's "Electric Piano 1" (Rhodes-style) patch, converted to per-note mp3s by
// the midi-js-soundfonts project (CC-BY 3.0). Sampled at every semitone across the same A0–C8
// range (88 notes, the full range of an acoustic piano) — generated rather than hand-listed since
// it's dense enough that typing 88 entries by hand would just be a typo risk for no benefit; the
// pattern (every semitone, flat-spelled filenames) is exactly what the source hosts.
const ELECTRIC_PIANO_SAMPLES: [note: string, file: string][] = (() => {
  const pairs: [string, string][] = [];
  for (let midi = 21; midi <= 108; midi++) {
    // MIDI 21 = A0, 108 = C8 — the full 88-key range this set covers.
    const flatName = midiToFlatName(midi);
    pairs.push([midiToAppName(midi), flatName]);
  }
  return pairs;
})();

const SAMPLE_SETS: Record<SampledInstrumentId, SampleSet> = {
  piano: {
    baseUrl: "https://tonejs.github.io/audio/salamander/",
    notes: PIANO_SAMPLES.map(([note, file]) => buildSampleNote(note, file)),
  },
  rhodes: {
    baseUrl: "https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM/electric_piano_1-mp3/",
    notes: ELECTRIC_PIANO_SAMPLES.map(([note, file]) => buildSampleNote(note, file)),
  },
};

/** Decoded sample cache, keyed by full URL — shared across every call site in the app (all the
    trainers, Guess the Interval/Chord, Practice Timer's transition chime) and across every
    `AudioContext` this app ever creates (there's normally just the one, from
    `lib/metronome.ts`'s `getAudioContext`), so a sample already played once by any tool is instant
    everywhere else too, for the rest of the tab's lifetime. */
const bufferCache = new Map<string, Promise<AudioBuffer>>();

function loadBuffer(ctx: AudioContext, url: string): Promise<AudioBuffer> {
  let promise = bufferCache.get(url);
  if (!promise) {
    promise = fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`Sample fetch failed (${res.status}): ${url}`);
        return res.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data));
    bufferCache.set(url, promise);
    // A failed fetch/decode (offline, a CDN hiccup, ...) shouldn't stay cached as a permanently-
    // rejected promise blocking every future attempt at this note — drop it so a later call tries
    // fresh instead of failing forever for the rest of the session.
    promise.catch(() => bufferCache.delete(url));
  }
  return promise;
}

/** Nearest-in-pitch sample to `freq` (by semitone distance, i.e. log-frequency, not linear Hz). */
function nearestSample(set: SampleSet, freq: number): SampleNote {
  let best = set.notes[0];
  let bestDistance = Math.abs(Math.log2(freq / best.freq));
  for (const candidate of set.notes) {
    const distance = Math.abs(Math.log2(freq / candidate.freq));
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** Makes sure `freq`'s nearest sample is fetched+decoded and sitting in `bufferCache` — without
    playing anything. This is what `lib/tones.ts`'s `playNotesTogether` awaits, for every note of a
    chord/interval, *before* calling `playSampledNote` on any of them: a fetch's completion time
    isn't something scheduling a future Web Audio start time can paper over (a sample that isn't
    downloaded yet simply cannot play before it exists, no matter what `when` you pass to
    `.start()`), so the only way several notes can actually start together on a first play — not
    just on a replay once everything's already cached — is to wait for every one of them to finish
    loading before starting any of them. */
export function prepareSampledNote(
  ctx: AudioContext,
  instrumentId: SampledInstrumentId,
  freq: number,
): Promise<void> {
  const set = SAMPLE_SETS[instrumentId];
  const sample = nearestSample(set, freq);
  const url = set.baseUrl + sample.file;
  return loadBuffer(ctx, url).then(
    () => undefined,
    () => undefined, // a failed fetch here isn't fatal — playSampledNote's own .catch handles it
  );
}

/** Plays `freq` using the nearest recorded sample from `instrumentId`'s set, pitch-shifted to the
    exact target frequency, starting at `startTime` (an `AudioContext.currentTime`-relative
    timestamp — for a single, standalone note this is just "now"; Web Audio's own `.start(when)`
    already clamps a `when` in the past to "immediately", so passing this straight through is
    correct with no extra clamping needed here). If the sample hasn't been fetched+decoded yet,
    this kicks that off itself and plays as soon as it resolves — the note starts late (however
    long the fetch/decode took) rather than being dropped, same as before `prepareSampledNote`
    existed; for the "several notes together" case, `playNotesTogether` prepares every note first
    so this always resolves near-instantly by the time it's actually called, which is what makes
    them start in sync. A genuinely failed fetch (offline, the CDN unreachable, ...) just means
    that one note is silent — no synthesized fallback, since silently swapping to a
    different-sounding tone mid-session would be more confusing than one missed note. */
export function playSampledNote(
  ctx: AudioContext,
  instrumentId: SampledInstrumentId,
  freq: number,
  durationSeconds: number,
  startTime: number,
) {
  const set = SAMPLE_SETS[instrumentId];
  const sample = nearestSample(set, freq);
  const url = set.baseUrl + sample.file;

  loadBuffer(ctx, url)
    .then((buffer) => {
      const now = Math.max(startTime, ctx.currentTime);
      const end = now + durationSeconds;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = freq / sample.freq;

      const gain = ctx.createGain();
      // Both sample sets are stereo recordings (real mic'd pianos, not synthesized), each with
      // its own inherent left/right balance baked into the recording itself — unlike every other
      // tone here (a single mono oscillator, inherently centered), so without this they'd play
      // off-center. Forcing this node's input down to a single, explicitly-interpreted channel
      // sums L+R into a properly centered mono signal (the Web Audio spec's standard stereo->mono
      // downmix, "speakers" interpretation) before it reaches `ctx.destination`, which then
      // upmixes that mono signal back out to both speakers equally.
      gain.channelCount = 1;
      gain.channelCountMode = "explicit";
      gain.channelInterpretation = "speakers";
      // A real recording already has its own natural attack baked in — no envelope needed there,
      // just a short release ramp at the end so cutting the note off doesn't click.
      const releaseStart = Math.max(now, end - 0.08);
      gain.gain.setValueAtTime(1, releaseStart);
      gain.gain.linearRampToValueAtTime(0, end);

      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(now);
      source.stop(end);
    })
    .catch(() => {
      // See the doc comment above — a missed note, not a fallback tone.
    });
}
