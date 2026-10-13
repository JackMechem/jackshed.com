import {
  emptyMeasure,
  midiOf,
  newId,
  TICKS_PER_QUARTER,
  type NoteValue,
  type Pitch,
  type Step,
  type TChord,
  type TMeasure,
  type TNote,
  type Transcription,
} from "./bassTranscription";
import { parseTypedChord } from "./typedProgression";
import { child, children, find, parseXml, textOf, type XmlElement } from "./xml";

// MusicXML (from MuseScore, Sibelius, Finale, Dorico, an OMR program, …) into a Bass Genius
// transcription. One part is taken — the bass part if there are several — and its first voice.
// Written pitches become sounding ones the way the part says (its <transpose>); a part with no
// transposition is read as a bass part written the usual way (an octave above where it sounds),
// so the notes look the same in the editor as they did on the page. Chord symbols (<harmony>)
// become normalized iReal-style symbols at their beat. Anything that had to be simplified is
// listed in `warnings`.

/** A MusicXML file's bytes as text: UTF-8, or UTF-16 (some programs, e.g. Finale, write that),
    told apart by the byte-order mark or the zero bytes of an ASCII "<?xml". */
export function decodeXmlBytes(bytes: Uint8Array): string {
  const le = (bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0x3c && bytes[1] === 0x00);
  const be = (bytes[0] === 0xfe && bytes[1] === 0xff) || (bytes[0] === 0x00 && bytes[1] === 0x3c);
  if (le || be) {
    let out = "";
    const start = bytes[0] === 0xff || bytes[0] === 0xfe ? 2 : 0;
    for (let i = start; i + 1 < bytes.length; i += 2) {
      out += String.fromCharCode(le ? bytes[i] | (bytes[i + 1] << 8) : (bytes[i] << 8) | bytes[i + 1]);
    }
    return out;
  }
  const start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  return new TextDecoder("utf-8").decode(bytes.subarray(start));
}

export type MusicXmlImport = { transcription: Transcription; partName: string; warnings: string[] };

const TYPE_VALUE: Record<string, NoteValue> = { whole: "w", half: "h", quarter: "q", eighth: "8", "16th": "16" };
const VALUE_TICKS: Record<NoteValue, number> = { w: 192, h: 96, q: 48, "8": 24, "16": 12 };
const STEPS = new Set(["C", "D", "E", "F", "G", "A", "B"]);

/** MusicXML <kind> values to iReal suffixes. */
const KIND_SUFFIX: Record<string, string> = {
  major: "",
  minor: "-",
  augmented: "+",
  diminished: "o",
  dominant: "7",
  "major-seventh": "^7",
  "minor-seventh": "-7",
  "diminished-seventh": "o7",
  "augmented-seventh": "+7",
  "half-diminished": "h7",
  "major-minor": "-^7",
  "major-sixth": "6",
  "minor-sixth": "-6",
  "dominant-ninth": "9",
  "major-ninth": "^9",
  "minor-ninth": "-9",
  "dominant-11th": "11",
  "major-11th": "^9#11",
  "minor-11th": "-11",
  "dominant-13th": "13",
  "major-13th": "^13",
  "minor-13th": "-13",
  "suspended-second": "sus2",
  "suspended-fourth": "sus",
  power: "5",
};

function harmonySymbol(h: XmlElement): string | null {
  const root = child(h, "root");
  const kindEl = child(h, "kind");
  const kind = textOf(kindEl);
  if (!root || kind === "none") return null;
  const step = textOf(root, "root-step").toUpperCase();
  if (!STEPS.has(step)) return null;
  const alter = Math.round(Number(textOf(root, "root-alter")) || 0);
  let suffix = KIND_SUFFIX[kind];
  if (suffix === undefined) {
    // Unusual kinds: fall back to how the file prints it.
    const shown = parseTypedChord(`C${kindEl?.attrs.text ?? ""}`, 0)?.slot;
    suffix = shown?.kind === "chord" ? shown.quality : "";
  }
  for (const d of children(h, "degree")) {
    const value = textOf(d, "degree-value");
    const dAlter = Math.round(Number(textOf(d, "degree-alter")) || 0);
    const type = textOf(d, "degree-type");
    const acc = dAlter < 0 ? "b" : dAlter > 0 ? "#" : "";
    if (type === "add") suffix += acc ? `${acc}${value}` : `add${value}`;
    else if (type === "alter") suffix += `${acc}${value}`;
  }
  const bassEl = child(h, "bass");
  let bass = "";
  if (bassEl) {
    const bStep = textOf(bassEl, "bass-step").toUpperCase();
    const bAlter = Math.round(Number(textOf(bassEl, "bass-alter")) || 0);
    if (STEPS.has(bStep)) bass = `/${bStep}${bAlter < 0 ? "b" : bAlter > 0 ? "#" : ""}`;
  }
  const raw = `${step}${alter < 0 ? "b" : alter > 0 ? "#" : ""}${suffix}${bass}`;
  const parsed = parseTypedChord(raw, 0);
  if (parsed?.slot.kind === "chord") {
    const s = parsed.slot;
    return `${s.letter}${s.accidental ?? ""}${s.quality}${s.bass ? `/${s.bass.letter}${s.bass.accidental ?? ""}` : ""}`;
  }
  // Keep at least the root and basic quality.
  const basic = parseTypedChord(`${step}${alter < 0 ? "b" : alter > 0 ? "#" : ""}${KIND_SUFFIX[kind] ?? ""}`, 0);
  if (basic?.slot.kind === "chord") return `${basic.slot.letter}${basic.slot.accidental ?? ""}${basic.slot.quality}`;
  return null;
}

/** Note value (+ dot) closest to a length in ticks, for notes without a <type>. */
function valueForTicks(ticks: number): { value: NoteValue; dots: 0 | 1 } {
  let best: { value: NoteValue; dots: 0 | 1 } = { value: "q", dots: 0 };
  let bestDiff = Infinity;
  for (const value of Object.keys(VALUE_TICKS) as NoteValue[]) {
    for (const dots of [0, 1] as const) {
      const t = VALUE_TICKS[value] * (dots ? 1.5 : 1);
      if (Math.abs(t - ticks) < bestDiff) {
        best = { value, dots };
        bestDiff = Math.abs(t - ticks);
      }
    }
  }
  return best;
}

function partIsBass(part: XmlElement, scorePart: XmlElement | undefined): boolean {
  const name = `${textOf(scorePart, "part-name")} ${textOf(find(scorePart, "instrument-name"))}`.toLowerCase();
  if (/bass|contrabass|basse|bajo/.test(name) && !/drum|clarinet|trombone/.test(name)) return true;
  const clef = find(part, "clef");
  return textOf(clef, "sign") === "F";
}

export function importMusicXml(xml: string): MusicXmlImport {
  const doc = parseXml(xml);
  const score = child(doc, "score-partwise");
  if (!score) {
    if (child(doc, "score-timewise")) throw new Error("This MusicXML file is “timewise”, which isn't supported. Re-export it from your notation program (the usual “partwise” kind).");
    throw new Error("That isn't a MusicXML score.");
  }
  const warnings: string[] = [];
  const partList = child(score, "part-list");
  const scoreParts = children(partList, "score-part");
  const parts = children(score, "part");
  if (!parts.length) throw new Error("This score has no parts.");
  const part = parts.find((p) => partIsBass(p, scoreParts.find((sp) => sp.attrs.id === p.attrs.id))) ?? parts[0];
  const scorePart = scoreParts.find((sp) => sp.attrs.id === part.attrs.id);
  const partName = textOf(scorePart, "part-name") || "Part 1";
  if (parts.length > 1) warnings.push(`The score has ${parts.length} parts; imported “${partName}”.`);

  const title = textOf(find(score, "work"), "work-title") || textOf(score, "movement-title") || "Imported transcription";
  let tempo: number | null = null;

  let divisions = 1;
  let transposeSemis: number | null = null;
  let voice: string | null = null;
  const measures: TMeasure[] = [];
  const counts = { chordNotes: 0, grace: 0, otherVoices: 0, short: 0, doubleDots: 0, odd: 0 };
  let timeWarned = false;

  for (const mEl of children(part, "measure")) {
    const measure: TMeasure = { id: newId(), chords: [], notes: [] };
    let pos = 0; // in divisions, for chord placement

    for (const el of mEl.children) {
      if (el.name === "attributes") {
        const d = Number(textOf(el, "divisions"));
        if (d > 0) divisions = d;
        const time = child(el, "time");
        if (time && !timeWarned) {
          const beats = textOf(time, "beats");
          const type = textOf(time, "beat-type");
          if (beats && (beats !== "4" || type !== "4")) {
            warnings.push(`It's in ${beats}/${type}; transcriptions are 4/4 for now, so bars won't line up exactly.`);
            timeWarned = true;
          }
        }
        const tr = child(el, "transpose");
        if (tr) transposeSemis = (Number(textOf(tr, "chromatic")) || 0) + 12 * (Number(textOf(tr, "octave-change")) || 0);
      } else if (el.name === "direction") {
        const perMinute = Number(textOf(find(el, "metronome"), "per-minute"));
        const sound = Number(child(el, "sound")?.attrs.tempo);
        if (!tempo && (perMinute > 0 || sound > 0)) tempo = Math.round(perMinute > 0 ? perMinute : sound);
      } else if (el.name === "sound") {
        const s = Number(el.attrs.tempo);
        if (!tempo && s > 0) tempo = Math.round(s);
      } else if (el.name === "harmony") {
        const sym = harmonySymbol(el);
        const offset = Number(textOf(el, "offset")) || 0;
        if (sym) {
          const beat = Math.max(0, Math.min(3, Math.round(((pos + offset) / divisions) * 2) / 2));
          if (!measure.chords.some((c) => c.beat === beat)) measure.chords.push({ beat, symbol: sym });
        }
      } else if (el.name === "backup") {
        pos -= Number(textOf(el, "duration")) || 0;
      } else if (el.name === "forward") {
        pos += Number(textOf(el, "duration")) || 0;
      } else if (el.name === "note") {
        const v = textOf(el, "voice") || "1";
        const duration = Number(textOf(el, "duration")) || 0;
        const isChordTone = !!child(el, "chord");
        if (child(el, "grace")) {
          counts.grace++;
          continue;
        }
        if (voice === null) voice = v;
        if (v !== voice) {
          counts.otherVoices++;
          if (!isChordTone) pos += duration;
          continue;
        }
        if (isChordTone) {
          counts.chordNotes++;
          continue;
        }

        const restEl = child(el, "rest");
        const type = textOf(el, "type");
        const dotCount = children(el, "dot").length;
        if (dotCount > 1) counts.doubleDots++;
        const tm = child(el, "time-modification");
        const actual = Number(textOf(tm, "actual-notes"));
        const normal = Number(textOf(tm, "normal-notes"));
        const triplet = actual === 3 && normal === 2;
        if (tm && !triplet) counts.odd++;

        let value: NoteValue;
        let dots: 0 | 1 = dotCount ? 1 : 0;
        if (type && TYPE_VALUE[type]) value = TYPE_VALUE[type];
        else if (type && /32nd|64th|128th/.test(type)) {
          value = "16";
          counts.short++;
        } else if (restEl?.attrs.measure === "yes" || (!type && restEl)) {
          // A whole-bar rest.
          value = "w";
          dots = 0;
        } else {
          const fit = valueForTicks(((duration / divisions) * TICKS_PER_QUARTER) / (triplet ? 2 / 3 : 1));
          value = fit.value;
          dots = fit.dots;
        }

        const note: TNote = { id: newId(), value, ...(dots ? { dots } : {}), ...(triplet ? { triplet: true } : {}) };

        const pitchEl = child(el, "pitch");
        if (!restEl && pitchEl) {
          const step = textOf(pitchEl, "step").toUpperCase();
          const alter = Math.max(-2, Math.min(2, Math.round(Number(textOf(pitchEl, "alter")) || 0))) as Pitch["alter"];
          const writtenOctave = Number(textOf(pitchEl, "octave"));
          if (STEPS.has(step) && Number.isFinite(writtenOctave)) {
            const shift = transposeSemis ?? -12;
            // Keep the written spelling; move the octave (and, for an unusual non-octave
            // transposition, respell from MIDI).
            let pitch: Pitch = { step: step as Step, alter, octave: writtenOctave };
            if (shift % 12 === 0) pitch = { ...pitch, octave: writtenOctave + shift / 12 };
            else {
              const midi = midiOf(pitch) + shift;
              const names: [Step, Pitch["alter"]][] = [["C", 0], ["D", -1], ["D", 0], ["E", -1], ["E", 0], ["F", 0], ["G", -1], ["G", 0], ["A", -1], ["A", 0], ["B", -1], ["B", 0]];
              const [s2, a2] = names[((midi % 12) + 12) % 12];
              pitch = { step: s2, alter: a2, octave: Math.floor(midi / 12) - 1 };
            }
            note.pitch = pitch;
            note.midi = midiOf(pitch);
            if (children(el, "tie").some((t) => t.attrs.type === "start") || children(find(el, "notations"), "tied").some((t) => t.attrs.type === "start")) note.tie = true;
            const head = textOf(el, "notehead");
            if (head === "x" || head === "cross" || head === "circle-x") note.ghost = true;
          }
        }
        measure.notes.push(note);
        pos += duration;
      }
    }
    measures.push(measure);
  }

  if (counts.chordNotes) warnings.push(`Kept the first note of ${counts.chordNotes} double stop${counts.chordNotes === 1 ? "" : "s"}.`);
  if (counts.otherVoices) warnings.push(`Skipped ${counts.otherVoices} note${counts.otherVoices === 1 ? "" : "s"} in other voices.`);
  if (counts.grace) warnings.push(`Skipped ${counts.grace} grace note${counts.grace === 1 ? "" : "s"}.`);
  if (counts.short) warnings.push(`Wrote ${counts.short} note${counts.short === 1 ? "" : "s"} shorter than a 16th as 16ths.`);
  if (counts.doubleDots) warnings.push(`Double dots became single dots (${counts.doubleDots}).`);
  if (counts.odd) warnings.push(`${counts.odd} note${counts.odd === 1 ? " is" : "s are"} in tuplets other than triplets; they're written plain.`);

  const chordsOk = (c: TChord[]) => c.sort((a, b) => a.beat - b.beat);
  return {
    transcription: {
      title,
      tune: "",
      source: "",
      tempo,
      comments: "",
      timeSignature: { top: 4, bottom: 4 },
      measures: measures.length ? measures.map((m) => ({ ...m, chords: chordsOk(m.chords) })) : [emptyMeasure()],
    },
    partName,
    warnings,
  };
}
