"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { NoteValueIcon } from "@/components/MeterFields";
import { BackButton } from "@/components/library/shared";
import ContextMenu, { type MenuItem, type MenuState } from "@/components/ContextMenu";
import LoadingSpinner from "@/components/LoadingSpinner";
import { DownloadIcon, PlayIcon, StopIcon, TrashIcon } from "@/components/tools";
import TranscriptionScore, { type ScoreHandle } from "@/components/bassgenius/TranscriptionScore";
import {
  clearNote,
  setNoteRhythm,
  emptyMeasure,
  writeNote,
  measureCapacity,
  measureTicks,
  midiOf,
  moveCursor,
  nearestPitch,
  newId,
  noteTicks,
  overwriteNote,
  NOTE_VALUE_NAMES,
  parseMeasureChords,
  pitchName,
  previousPitch,
  replaceNote,
  spellMidi,
  TICKS_PER_QUARTER,
  timeline,
  transcriptionFile,
  withPitch,
  HIGHEST_MIDI,
  LOWEST_MIDI,
  type Cursor,
  type NoteValue,
  type Pitch,
  type Step,
  type TNote,
  type Transcription,
} from "@/lib/bassTranscription";
import { getAudioContext } from "@/lib/metronome";
import { loadUprightBass, playUprightBassNote } from "@/lib/uprightBass";

const VALUE_KEYS: Record<string, NoteValue> = { "3": "16", "4": "8", "5": "q", "6": "h", "7": "w" };
const VALUE_ICON: Record<NoteValue, number> = { w: 1, h: 2, q: 4, "8": 8, "16": 16 };
const STEP_KEYS = new Set(["a", "b", "c", "d", "e", "f", "g"]);
const HISTORY = 200;

type BarRange = { from: number; to: number };
type ChordClip = Transcription["measures"][number]["chords"][];
/** Copied chord changes, one list per bar — kept for the session so they can go into another
    transcription too. */
let chordClipboard: ChordClip | null = null;

/** Downloads `data` as a .json file. */
export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function safeFilename(name: string) {
  return name.trim().replace(/[^\w\- ]+/g, "").replace(/\s+/g, "-").toLowerCase() || "transcription";
}

/**
 * Writing a bass transcription: the score (click a note or measure to put the cursor there), a
 * palette for note values, rests, dots, triplets, ties, ghost notes, accidentals and octave, the
 * chords for the measure the cursor is in, and the transcription's details. Everything can also
 * be done from the keyboard (see `KEY_HELP`). Changes autosave; undo/redo cover note and chord
 * edits. Play listens back through Bass Genius's upright bass from the cursor's measure.
 */
export default function TranscriptionEditor({
  initial,
  playerName,
  onSave,
  onBack,
  onDelete,
}: {
  initial: Transcription;
  playerName: string;
  onSave: (t: Transcription) => Promise<void>;
  onBack: () => void;
  onDelete: () => void;
}) {
  const [t, setT] = useState<Transcription>(initial);
  const [cursor, setCursor] = useState<Cursor>({ measure: 0, note: initial.measures[0]?.notes.length ? initial.measures[0].notes.length - 1 : -1 });
  const [value, setValue] = useState<NoteValue>("q");
  const [dotted, setDotted] = useState(false);
  const [triplet, setTriplet] = useState(false);
  const [past, setPast] = useState<Transcription[]>([]);
  const [future, setFuture] = useState<Transcription[]>([]);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const [playing, setPlaying] = useState<{ measure: number; note: number } | null>(null);
  const [loadingSound, setLoadingSound] = useState(false);
  // Whether the selection was picked on purpose (clicked / arrowed to). Then the note-value, dot
  // and triplet buttons change that note; right after typing a note they set the next one instead.
  const [picked, setPicked] = useState(false);
  // The inline chord input above the score: which beat of which bar, where to draw it, the text.
  const [chordEdit, setChordEdit] = useState<{ measure: number; beat: number; left: number; top: number; text: string; error: string | null } | null>(null);
  // Select: clicks only select (a note, or whole bars). Write: clicking the staff adds notes.
  const [mode, setMode] = useState<"select" | "write">("select");
  const [range, setRangeState] = useState<BarRange | null>(null);
  const rangeAnchor = useRef(0);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [clipNote, setClipNote] = useState<string | null>(null);
  const scoreRef = useRef<ScoreHandle>(null);
  /** Set once the chord input has been saved or cancelled, so its blur on the way out does nothing. */
  const chordClosed = useRef(false);
  /** When the chord input last closed by losing focus — the click that did that shouldn't also edit. */
  const chordBlurredAt = useRef(0);
  const justClosedChord = () => Date.now() - chordBlurredAt.current < 400;
  const editorRef = useRef<HTMLDivElement>(null);
  const playTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Autosave, a moment after the last change.
  const latest = useRef(t);
  const dirty = useRef(false);
  useEffect(() => {
    latest.current = t;
    if (!dirty.current) return;
    setSaveState("unsaved");
    const timer = setTimeout(() => {
      setSaveState("saving");
      onSave(t)
        .then(() => {
          if (latest.current === t) {
            dirty.current = false;
            setSaveState("saved");
          }
        })
        .catch(() => setSaveState("error"));
    }, 800);
    return () => clearTimeout(timer);
  }, [t, onSave]);
  // Leaving with unsaved changes: save them now.
  useEffect(
    () => () => {
      if (dirty.current) void onSave(latest.current);
    },
    [onSave],
  );

  /** Applies an edit with undo history. */
  const commit = useCallback((next: Transcription, nextCursor?: Cursor) => {
    dirty.current = true;
    setPast((p) => [...p.slice(-HISTORY + 1), latest.current]);
    setFuture([]);
    setT(next);
    if (nextCursor) setCursor(nextCursor);
  }, []);
  const undo = () => {
    const prev = past[past.length - 1];
    if (!prev) return;
    dirty.current = true;
    setFuture((f) => [t, ...f]);
    setPast((p) => p.slice(0, -1));
    setT(prev);
    setCursor((c) => clampCursor(prev, c));
  };
  const redo = () => {
    const next = future[0];
    if (!next) return;
    dirty.current = true;
    setPast((p) => [...p, t]);
    setFuture((f) => f.slice(1));
    setT(next);
    setCursor((c) => clampCursor(next, c));
  };
  /** Edits the transcription's details (no undo needed for these). */
  const setMeta = (patch: Partial<Transcription>) => {
    dirty.current = true;
    setT((cur) => ({ ...cur, ...patch }));
  };

  const selected: TNote | null = t.measures[cursor.measure]?.notes[cursor.note] ?? null;
  const last = t.measures.length - 1;
  const bars: BarRange | null = range ? { from: Math.min(range.from, last), to: Math.min(range.to, last) } : null;

  // ---- Selecting whole bars, and copying their chord changes ----
  const selectMeasure = (measure: number, extend: boolean) => {
    if (!extend) rangeAnchor.current = measure;
    const a = rangeAnchor.current;
    setRangeState({ from: Math.min(a, measure), to: Math.max(a, measure) });
    // Typing then adds after the bar's last note.
    setCursor({ measure, note: t.measures[measure].notes.length - 1 });
    setPicked(false);
  };
  const clearRange = () => setRangeState(null);
  const flash = (text: string) => {
    setClipNote(text);
    setTimeout(() => setClipNote((c) => (c === text ? null : c)), 1800);
  };
  const barsLabel = (r: BarRange) => (r.from === r.to ? `bar ${r.from + 1}` : `bars ${r.from + 1}–${r.to + 1}`);
  const copyChords = (r: BarRange) => {
    chordClipboard = t.measures.slice(r.from, r.to + 1).map((m) => m.chords.map((c) => ({ ...c })));
    flash(`Copied the chords in ${barsLabel(r)}`);
  };
  /** Pastes the copied chords from the first selected bar, replacing those bars' chords (notes
      untouched). A selection longer than one bar is filled, repeating the copied bars. */
  const pasteChords = (r: BarRange) => {
    const clip = chordClipboard;
    if (!clip?.length) return;
    const count = r.to > r.from ? r.to - r.from + 1 : clip.length;
    const measures = [...t.measures];
    while (measures.length < r.from + count) measures.push(emptyMeasure());
    for (let i = 0; i < count; i++) {
      const mi = r.from + i;
      measures[mi] = { ...measures[mi], chords: clip[i % clip.length].map((c) => ({ ...c })) };
    }
    commit({ ...t, measures });
    setRangeState({ from: r.from, to: r.from + count - 1 });
    flash(`Pasted chords into ${barsLabel({ from: r.from, to: r.from + count - 1 })}`);
  };
  const clearChords = (r: BarRange) => {
    commit({ ...t, measures: t.measures.map((m, i) => (i >= r.from && i <= r.to ? { ...m, chords: [] } : m)) });
  };
  const openMenu = (measure: number | null, x: number, y: number) => {
    if (measure === null) return;
    let r = bars;
    if (!r || measure < r.from || measure > r.to) {
      rangeAnchor.current = measure;
      r = { from: measure, to: measure };
      setRangeState(r);
      setCursor({ measure, note: t.measures[measure].notes.length - 1 });
      setPicked(false);
    }
    const sel = r;
    const items: MenuItem[] = [{ label: `Copy chords (${barsLabel(sel)})`, onSelect: () => copyChords(sel) }];
    if (chordClipboard?.length) {
      const n = chordClipboard.length;
      items.push({ label: `Paste chords (${n} bar${n === 1 ? "" : "s"})`, onSelect: () => pasteChords(sel) });
    }
    items.push({ label: "Clear chords", onSelect: () => clearChords(sel), danger: true });
    setMenu({ x, y, items });
  };

  // ---- Note entry ----
  /** Overwrites the note at `at` (keeping its rhythm), then moves on to the next note so a run can
      be typed over; past the last note, typing goes back to adding. */
  const overwriteAt = (at: Cursor, pitch: Pitch | null) => {
    const next = { ...t, measures: overwriteNote(t, at, pitch) };
    const after = moveCursor(next, at, 1);
    const moved = after.measure !== at.measure || after.note !== at.note;
    commit(next, moved ? after : at);
    setPicked(moved);
  };
  const addNote = (pitch: Pitch | null) => {
    setRangeState(null);
    if (picked && selected) return overwriteAt(cursor, pitch);
    const note: TNote = { id: newId(), value, ...(dotted ? { dots: 1 as const } : {}), ...(triplet ? { triplet: true } : {}) };
    const n = pitch ? withPitch(note, pitch) : note;
    const r = writeNote(t, cursor, n);
    commit({ ...t, measures: r.measures }, r.cursor);
    setPicked(false);
  };
  const addStep = (step: Step) => {
    // Overwriting: the octave nearest the note before the one being replaced.
    const from = picked && selected ? { measure: cursor.measure, note: cursor.note - 1 } : cursor;
    const near = previousPitch(t, from) ?? (selected?.midi ?? 40); // E2 to start
    addNote(nearestPitch(step, 0, near));
  };
  const changeSelected = (change: (n: TNote) => TNote) => {
    if (!selected) return;
    commit({ ...t, measures: replaceNote(t, cursor, change) });
  };
  const transpose = (semitones: number) =>
    changeSelected((n) => {
      if (!n.pitch) return n;
      const midi = midiOf(n.pitch) + semitones;
      if (midi < LOWEST_MIDI || midi > HIGHEST_MIDI) return n;
      const pitch = Math.abs(semitones) === 12 ? { ...n.pitch, octave: n.pitch.octave + semitones / 12 } : spellMidi(midi, semitones < 0);
      return withPitch(n, pitch);
    });
  const setAlter = (alter: Pitch["alter"]) =>
    changeSelected((n) => {
      if (!n.pitch) return n;
      const pitch = { ...n.pitch, alter };
      const m = midiOf(pitch);
      return m < LOWEST_MIDI || m > HIGHEST_MIDI ? n : withPitch(n, pitch);
    });
  /** A picked note's new length — written over what follows, never pushing it along. */
  const [rhythmError, setRhythmError] = useState(false);
  const rhythmSelected = (change: (n: TNote) => Pick<TNote, "value" | "dots" | "triplet">) => {
    if (!selected) return;
    const measures = setNoteRhythm(t, cursor, change(selected));
    if (!measures) {
      setRhythmError(true);
      setTimeout(() => setRhythmError(false), 1800);
      return;
    }
    commit({ ...t, measures });
  };
  const pickValue = (v: NoteValue) => {
    setValue(v);
    if (picked && selected) rhythmSelected((n) => ({ value: v, dots: n.dots, triplet: n.triplet }));
  };
  const toggleDot = () => {
    if (picked && selected) rhythmSelected((n) => ({ value: n.value, dots: n.dots ? 0 : 1, triplet: n.triplet }));
    else setDotted((d) => !d);
  };
  const toggleTriplet = () => {
    if (picked && selected) rhythmSelected((n) => ({ value: n.value, dots: n.dots, triplet: !n.triplet }));
    else setTriplet((v) => !v);
  };
  const toggleTie = () => changeSelected((n) => (n.pitch ? { ...n, tie: !n.tie } : n));
  const toggleGhost = () => changeSelected((n) => (n.pitch ? { ...n, ghost: !n.ghost } : n));
  const removeSelected = () => {
    setRangeState(null);
    if (!selected) {
      setCursor((c) => moveCursor(t, c, -1));
      return;
    }
    const r = clearNote(t, cursor);
    commit({ ...t, measures: r.measures }, r.cursor);
    setPicked(false);
  };

  // ---- Measures ----
  const addMeasureAfter = () => {
    const measures = [...t.measures];
    measures.splice(cursor.measure + 1, 0, emptyMeasure());
    commit({ ...t, measures }, { measure: cursor.measure + 1, note: -1 });
  };
  const deleteMeasure = () => {
    if (t.measures.length <= 1) {
      commit({ ...t, measures: [emptyMeasure()] }, { measure: 0, note: -1 });
      return;
    }
    const measures = t.measures.filter((_, i) => i !== cursor.measure);
    const mi = Math.min(cursor.measure, measures.length - 1);
    commit({ ...t, measures }, { measure: mi, note: measures[mi].notes.length - 1 });
  };
  // ---- Chord symbols (typed straight onto the score, above a note) ----
  /** The beat (in quarters from the bar line) the note at `c` starts on; bar start for none. */
  const beatOf = (c: Cursor) => startBeat(t, c);
  const openChord = (measure: number, beat: number) => {
    const anchor = scoreRef.current?.anchorFor(measure, beat);
    if (!anchor) return;
    const existing = t.measures[measure]?.chords.find((c) => Math.abs(c.beat - beat) < 1e-6);
    chordClosed.current = false;
    setChordEdit({ measure, beat, left: anchor.left, top: anchor.top, text: existing?.symbol ?? "", error: null });
  };
  const addChordAtCursor = () => openChord(cursor.measure, cursor.note >= 0 ? beatOf(cursor) : 0);
  /** Saves the chord being typed (empty removes it). `advance` then opens the next note's. */
  const commitChord = (advance: boolean) => {
    if (!chordEdit || chordClosed.current) return;
    const text = chordEdit.text.trim();
    let symbol: string | null = null;
    if (text) {
      const { chords, unknown } = parseMeasureChords(text, 1);
      if (unknown.length || chords.length !== 1) {
        setChordEdit({ ...chordEdit, error: `Didn't understand “${text}”` });
        return;
      }
      symbol = chords[0].symbol;
    }
    const { measure, beat } = chordEdit;
    const measures = t.measures.map((m, i) => {
      if (i !== measure) return m;
      const others = m.chords.filter((c) => Math.abs(c.beat - beat) > 1e-6);
      return { ...m, chords: symbol ? [...others, { beat, symbol }].sort((a, b) => a.beat - b.beat) : others };
    });
    const next = { ...t, measures };
    const existing = t.measures[measure]?.chords.find((c) => Math.abs(c.beat - beat) < 1e-6)?.symbol ?? null;
    if (existing !== symbol) commit(next);
    chordClosed.current = true;
    setChordEdit(null);
    if (advance) {
      // On to the next note (or the next bar's start).
      const from: Cursor = { measure, note: noteIndexAtBeat(next, measure, beat) };
      const to = moveCursor(next, from, 1);
      if (to.measure !== from.measure || to.note !== from.note) {
        setCursor(to);
        setPicked(true);
        const anchor = scoreRef.current?.anchorFor(to.measure, to.note >= 0 ? startBeat(next, to) : 0);
        const ex = next.measures[to.measure]?.chords.find((c) => Math.abs(c.beat - (to.note >= 0 ? startBeat(next, to) : 0)) < 1e-6);
        chordClosed.current = false;
        if (anchor) setChordEdit({ measure: to.measure, beat: to.note >= 0 ? startBeat(next, to) : 0, left: anchor.left, top: anchor.top, text: ex?.symbol ?? "", error: null });
        return;
      }
    }
    editorRef.current?.focus({ preventScroll: true });
  };

  // ---- Playback ----
  const stopPlayback = useCallback(() => {
    playTimers.current.forEach(clearTimeout);
    playTimers.current = [];
    setPlaying(null);
  }, []);
  useEffect(() => stopPlayback, [stopPlayback]);
  const play = async () => {
    if (playing) return stopPlayback();
    setLoadingSound(true);
    try {
      await loadUprightBass();
    } catch {
      setLoadingSound(false);
      return;
    }
    setLoadingSound(false);
    const ctx = getAudioContext();
    await ctx.resume();
    const bpm = t.tempo ?? 120;
    const tickSec = 60 / bpm / TICKS_PER_QUARTER;
    const cap = measureCapacity(t);
    const from = cursor.measure * cap;
    const start = ctx.currentTime + 0.15;
    // Map timeline notes back to their measure/note index for the highlight.
    const positions: { measure: number; note: number; at: number }[] = [];
    t.measures.forEach((m, mi) => {
      let at = mi * cap;
      m.notes.forEach((n, ni) => {
        positions.push({ measure: mi, note: ni, at });
        at += noteTicks(n);
      });
    });
    const notes = timeline(t).filter((n) => n.start >= from);
    for (const n of notes) {
      const when = start + (n.start - from) * tickSec;
      if (n.midi !== null) playUprightBassNote(n.midi, when, n.ticks * tickSec * (n.ghost ? 0.4 : 1) + 0.01, n.ghost ? 0.3 : 0.62, n.ghost);
    }
    for (const p of positions) {
      if (p.at < from) continue;
      playTimers.current.push(setTimeout(() => setPlaying({ measure: p.measure, note: p.note }), (start - ctx.currentTime + (p.at - from) * tickSec) * 1000));
    }
    const end = t.measures.length * cap;
    playTimers.current.push(setTimeout(() => stopPlayback(), (start - ctx.currentTime + (end - from) * tickSec + 0.3) * 1000));
    setPlaying({ measure: cursor.measure, note: -1 });
  };

  // ---- Keyboard ----
  const onKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable]")) return;
    const k = e.key;
    const mod = e.metaKey || e.ctrlKey;
    let handled = true;
    if (mod && (k === "z" || k === "Z")) {
      if (e.shiftKey) redo();
      else undo();
    }
    else if (mod && k === "y") redo();
    else if (mod && (k === "k" || k === "K")) addChordAtCursor();
    else if (mod && (k === "c" || k === "C") && bars) copyChords(bars);
    else if (mod && (k === "v" || k === "V") && bars) pasteChords(bars);
    else if (mod) handled = false;
    else if (STEP_KEYS.has(k.toLowerCase()) && !e.altKey) addStep(k.toUpperCase() as Step);
    else if (k === "0" || k === "r" || k === "R") addNote(null);
    else if (VALUE_KEYS[k]) pickValue(VALUE_KEYS[k]);
    else if (k === ".") toggleDot();
    else if (k === "t" || k === "T") toggleTriplet();
    else if (k === "+" || k === "=") toggleTie();
    else if (k === "x" || k === "X") toggleGhost();
    else if (k === "#") setAlter(selected?.pitch ? (Math.min(2, selected.pitch.alter + 1) as Pitch["alter"]) : 1);
    else if (k === "-") setAlter(selected?.pitch ? (Math.max(-2, selected.pitch.alter - 1) as Pitch["alter"]) : -1);
    else if (k === "n" || k === "N") setAlter(0);
    else if (k === "ArrowUp") transpose(e.shiftKey ? 12 : 1);
    else if (k === "ArrowDown") transpose(e.shiftKey ? -12 : -1);
    else if (k === "ArrowLeft") {
      setCursor((c) => moveCursor(t, c, -1));
      setPicked(true);
      clearRange();
    } else if (k === "ArrowRight") {
      setCursor((c) => moveCursor(t, c, 1));
      setPicked(true);
      clearRange();
    } else if (k === "Escape") {
      setPicked(false);
      clearRange();
      setMode("select");
    } else if (k === "w" || k === "W") setMode("write");
    else if (k === "Backspace" || k === "Delete") removeSelected();
    else if (k === " ") void play();
    else handled = false;
    if (handled) e.preventDefault();
  };

  const m = t.measures[cursor.measure];
  const filled = m ? measureTicks(m) : 0;
  const cap = measureCapacity(t);

  const btn = (active = false) =>
    `flex h-10 min-w-10 items-center justify-center gap-1 rounded-lg px-2 text-sm font-semibold transition-colors disabled:opacity-40 ${
      active ? "bg-accent text-accent-foreground" : "bg-background text-foreground hover:bg-surface-hover"
    }`;

  return (
    <div className="flex w-full flex-col gap-4 text-left">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <BackButton onClick={onBack} label={playerName} className="mb-2" />
          <input
            value={t.title}
            onChange={(e) => setMeta({ title: e.target.value })}
            aria-label="Title"
            className="w-full min-w-0 rounded-lg bg-transparent text-2xl font-extrabold tracking-tight outline-none ring-accent focus:ring-2"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted" aria-live="polite">
            {saveState === "saving" ? "Saving…" : saveState === "unsaved" ? "Unsaved" : saveState === "error" ? "Couldn't save — retrying on next change" : "Saved"}
          </span>
          <button type="button" onClick={() => void play()} className={btn(!!playing)} title="Play from this measure (space)">
            {loadingSound ? <LoadingSpinner size="sm" inline label="Loading bass" /> : playing ? <StopIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
            {playing ? "Stop" : "Play"}
          </button>
          <button type="button" onClick={() => downloadJson(transcriptionFile(t, playerName), `${safeFilename(t.title)}.json`)} className={btn()} title="Export as JSON">
            <DownloadIcon className="h-4 w-4" /> Export
          </button>
          <button type="button" onClick={onDelete} className={`${btn()} hover:text-danger`} title="Delete transcription" aria-label="Delete transcription">
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <details className="rounded-xl bg-surface px-4 py-2 text-sm">
        <summary className="cursor-pointer py-1 font-semibold text-muted">Details</summary>
        <div className="grid gap-3 py-2 sm:grid-cols-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Tune</span>
            <input value={t.tune} onChange={(e) => setMeta({ tune: e.target.value })} placeholder="All the Things You Are" className="rounded-lg bg-background px-3 py-2 outline-none ring-accent focus:ring-2" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Recording</span>
            <input value={t.source} onChange={(e) => setMeta({ source: e.target.value })} placeholder="Album, track, year, time" className="rounded-lg bg-background px-3 py-2 outline-none ring-accent focus:ring-2" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Tempo (BPM)</span>
            <input
              type="number"
              min={20}
              max={400}
              value={t.tempo ?? ""}
              onChange={(e) => setMeta({ tempo: e.target.value ? Math.max(20, Math.min(400, Math.round(Number(e.target.value)))) : null })}
              placeholder="120"
              className="rounded-lg bg-background px-3 py-2 outline-none ring-accent focus:ring-2"
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-3">
            <span className="text-xs font-medium text-muted">Notes</span>
            <textarea value={t.comments} onChange={(e) => setMeta({ comments: e.target.value })} rows={2} className="rounded-lg bg-background px-3 py-2 outline-none ring-accent focus:ring-2" />
          </label>
        </div>
      </details>

      <div ref={editorRef} tabIndex={0} onKeyDown={onKeyDown} className="flex flex-col gap-3 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent/50">
        {/* Palette */}
        <div className="sticky top-2 z-10 flex flex-col gap-2 rounded-2xl bg-surface p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="flex rounded-lg bg-background p-0.5" role="radiogroup" aria-label="Mouse mode">
              {(
                [
                  ["select", "Select", "Clicks only select a note, or a whole bar (Shift+click for a range). Esc"],
                  ["write", "Write", "Clicking the staff adds a note, or re-pitches the one in that spot. W"],
                ] as const
              ).map(([m, label, title]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  title={title}
                  className={`h-9 rounded-md px-3 text-sm font-semibold transition-colors ${mode === m ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="mx-1 h-6 w-px bg-background" />
            {(["w", "h", "q", "8", "16"] as NoteValue[]).map((v) => (
              <button key={v} type="button" onClick={() => pickValue(v)} className={btn(picked && selected ? selected.value === v : value === v)} title={`${NOTE_VALUE_NAMES[v]} (${Object.keys(VALUE_KEYS).find((k) => VALUE_KEYS[k] === v)})`} aria-label={NOTE_VALUE_NAMES[v]}>
                <NoteValueIcon value={VALUE_ICON[v]} className="h-6 w-3" />
              </button>
            ))}
            <button type="button" onClick={toggleDot} className={btn(picked && selected ? !!selected.dots : dotted)} title="Dotted (.)" aria-label="Dotted">
              <span className="text-xl leading-none">·</span>
            </button>
            <button type="button" onClick={toggleTriplet} className={btn(picked && selected ? !!selected.triplet : triplet)} title="Triplet (T)">
              3
            </button>
            <span className="mx-1 h-6 w-px bg-background" />
            <button type="button" onClick={() => addNote(null)} className={btn()} title="Rest (0 or R)">
              Rest
            </button>
            <button type="button" onClick={toggleTie} disabled={!selected?.pitch} className={btn(!!selected?.tie)} title="Tie to the next note (+)">
              Tie
            </button>
            <button type="button" onClick={toggleGhost} disabled={!selected?.pitch} className={btn(!!selected?.ghost)} title="Ghost note (X)">
              ×
            </button>
            <button type="button" onClick={addChordAtCursor} className={btn(!!chordEdit)} title="Add a chord symbol above the selected note (Ctrl+K)">
              + Chord
            </button>
            <span className="mx-1 h-6 w-px bg-background" />
            <button type="button" onClick={() => setAlter(1)} disabled={!selected?.pitch} className={btn(selected?.pitch?.alter === 1)} title="Sharp (#)">
              ♯
            </button>
            <button type="button" onClick={() => setAlter(-1)} disabled={!selected?.pitch} className={btn(selected?.pitch?.alter === -1)} title="Flat (-)">
              ♭
            </button>
            <button type="button" onClick={() => setAlter(0)} disabled={!selected?.pitch} className={btn()} title="Natural (N)">
              ♮
            </button>
            <button type="button" onClick={() => transpose(12)} disabled={!selected?.pitch} className={btn()} title="Octave up (Shift+↑)">
              8va
            </button>
            <button type="button" onClick={() => transpose(-12)} disabled={!selected?.pitch} className={btn()} title="Octave down (Shift+↓)">
              8vb
            </button>
            <span className="mx-1 h-6 w-px bg-background" />
            <button type="button" onClick={undo} disabled={!past.length} className={btn()} title="Undo (Ctrl+Z)">
              Undo
            </button>
            <button type="button" onClick={redo} disabled={!future.length} className={btn()} title="Redo (Ctrl+Shift+Z)">
              Redo
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(["C", "D", "E", "F", "G", "A", "B"] as Step[]).map((s) => (
              <button key={s} type="button" onClick={() => addStep(s)} className={`${btn()} w-10 text-base`} title={`Add ${s} (${s})`}>
                {s}
              </button>
            ))}
            <button type="button" onClick={removeSelected} className={btn()} title="Delete (Backspace)">
              ⌫
            </button>
            {rhythmError && <span className="text-xs text-danger">That won&apos;t fit in the bar.</span>}
            {clipNote && <span className="text-xs text-accent">{clipNote}</span>}
            <span className="ml-auto text-xs text-muted tabular-nums">
              {selected?.pitch ? pitchName(selected.pitch) : selected ? "Rest" : "—"} · bar {cursor.measure + 1} · {Math.round((filled / cap) * 100) === 100 ? "full" : `${formatBeats(filled / TICKS_PER_QUARTER)} of ${cap / TICKS_PER_QUARTER} beats`}
            </span>
          </div>
        </div>

        {/* Score */}
        <div className="rounded-2xl bg-surface p-3 sm:p-5" onMouseDown={() => editorRef.current?.focus({ preventScroll: true })}>
          <TranscriptionScore
            handleRef={scoreRef}
            onChordClick={(measure, beat) => openChord(measure, beat)}
            overlay={
              chordEdit && (
                <div
                  className="absolute z-20 flex flex-col gap-1"
                  style={{ left: chordEdit.left, top: chordEdit.top }}
                  onClick={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  onMouseMove={(e) => e.stopPropagation()}
                >
                  <input
                    autoFocus
                    value={chordEdit.text}
                    onChange={(e) => setChordEdit({ ...chordEdit, text: e.target.value, error: null })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitChord(false);
                      } else if (e.key === "Tab" || e.key === " ") {
                        e.preventDefault();
                        commitChord(true);
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        chordClosed.current = true;
                        setChordEdit(null);
                        editorRef.current?.focus({ preventScroll: true });
                      }
                    }}
                    onBlur={() => {
                      chordBlurredAt.current = Date.now();
                      if (chordEdit.error === null) commitChord(false);
                    }}
                    placeholder="Dm7"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    aria-label={`Chord at bar ${chordEdit.measure + 1}, beat ${chordEdit.beat + 1}`}
                    className="w-28 rounded-lg border-2 border-accent bg-background px-2 py-1 font-mono text-sm text-foreground shadow-lg outline-none"
                  />
                  {chordEdit.error && <span className="rounded bg-background px-1.5 py-0.5 text-xs text-danger shadow">{chordEdit.error}</span>}
                </div>
              )
            }
            mode={mode}
            range={bars}
            onSelectMeasure={(measure, extend) => {
              if (justClosedChord()) return;
              selectMeasure(measure, extend);
              editorRef.current?.focus({ preventScroll: true });
            }}
            onMenu={openMenu}
            transcription={t} cursor={cursor} playing={playing} onSelect={(c) => {
              if (justClosedChord()) return;
              rangeAnchor.current = c.measure;
              setCursor(c);
              setPicked(true);
              clearRange();
            }}
            onReplace={(measure, note, pitch) => {
              if (justClosedChord()) return;
              overwriteAt({ measure, note }, pitch);
              clearRange();
              editorRef.current?.focus({ preventScroll: true });
            }}
            onAdd={(measure, after, pitch) => {
              if (justClosedChord()) return;
              const note: TNote = withPitch({ id: newId(), value, ...(dotted ? { dots: 1 as const } : {}), ...(triplet ? { triplet: true } : {}) }, pitch);
              const r = writeNote(t, { measure, note: after }, note);
              commit({ ...t, measures: r.measures }, r.cursor);
              setPicked(false);
              clearRange();
              editorRef.current?.focus({ preventScroll: true });
            }} />
          {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
        </div>

        {/* Measure tools */}
        <div className="flex justify-end gap-2 rounded-2xl bg-surface p-3">
          <div className="flex gap-1.5">
            <button type="button" onClick={addMeasureAfter} className={btn()}>
              + Bar after
            </button>
            <button type="button" onClick={deleteMeasure} className={`${btn()} hover:text-danger`}>
              Delete bar
            </button>
          </div>
        </div>

        <p className="px-1 text-xs text-muted">{KEY_HELP}</p>
      </div>
    </div>
  );
}

const KEY_HELP =
  "Select mode (Esc): clicks only select — a note, or a whole bar (click beside its notes; Shift+click another bar for a range); right-click bars to copy, paste or clear their chords (Ctrl+C / Ctrl+V). Write mode (W): clicking the staff adds notes. Keys: A–G add a note (nearest the last one) · 3 4 5 6 7 = 16th, 8th, quarter, half, whole · . dot · T triplet · 0 or R rest · ↑ ↓ semitone, Shift+↑ ↓ octave · # sharp, - flat, N natural · + tie · X ghost note · ← → move · Backspace turns a note into a rest · Space play · Ctrl+Z undo. Chords: select a note, then + Chord (Ctrl+K), type it, Enter — Space/Tab goes on to the next note's, an empty one removes it, click a chord to edit it. In write mode, click the staff to add a note there, or above/below an existing note to change its pitch (the preview shows which); click a note's head (or arrow to it) to select it — typing then overwrites it and moves on, keeping the rhythm — then the note-value, dot and triplet buttons change that note; Esc goes back to entering. New notes go after the cursor.";

/** The beat (in quarters from the bar line) the note at `c` starts on. */
function startBeat(t: Transcription, c: Cursor): number {
  const notes = t.measures[c.measure]?.notes ?? [];
  return notes.slice(0, Math.max(0, c.note)).reduce((s, n) => s + noteTicks(n), 0) / TICKS_PER_QUARTER;
}

/** The note starting at `beat` in bar `measure` (or -1 if none does). */
function noteIndexAtBeat(t: Transcription, measure: number, beat: number): number {
  let at = 0;
  const notes = t.measures[measure]?.notes ?? [];
  for (let i = 0; i < notes.length; i++) {
    if (Math.abs(at / TICKS_PER_QUARTER - beat) < 1e-6) return i;
    at += noteTicks(notes[i]);
  }
  return -1;
}

/** 2, 2.5, 2.67 — beats as a short number. */
function formatBeats(beats: number) {
  return Number.isInteger(beats) ? String(beats) : String(Math.round(beats * 100) / 100);
}

function clampCursor(t: Transcription, c: Cursor): Cursor {
  const measure = Math.min(c.measure, t.measures.length - 1);
  const note = Math.min(c.note, t.measures[measure].notes.length - 1);
  return { measure, note };
}
