"use client";

import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { Accidental, Beam, Dot, Formatter, Fraction, Renderer, Stave, StaveNote, StaveTie, Tuplet, Voice } from "vexflow";
import {
  HIGHEST_MIDI,
  LOWEST_MIDI,
  midiOf,
  pitchName,
  STEPS,
  measureCapacity,
  noteTicks,
  TICKS_PER_QUARTER,
  type Cursor,
  type Pitch,
  type TNote,
  type Transcription,
} from "@/lib/bassTranscription";
import { chordFont, chordSymbolFont, SMUFL_CHORD_GLYPH } from "@/components/ChordChart";
import { prettyQuality } from "@/lib/iRealPro";

// Draws a transcription as engraved notation (VexFlow): bass clef, 4/4, measures wrapped into
// rows, chord symbols above each measure, beams per beat, triplet brackets, ties, dots, ghost
// (x) notes and accidentals (with naturals within a measure). Unfinished measures are padded with
// grey rests that aren't part of the transcription. Bass parts are written an octave above where
// they sound, so a note's stored (sounding) octave is drawn one higher.
//
// Clicking a note selects it; clicking elsewhere in a measure selects that measure's last note
// (new notes go in after the selection). The selected note is drawn in the accent colour with a
// caret after it; a playing note too.

const ROW_HEIGHT = 150;
const STAVE_Y = 40;
const MIN_MEASURE = 210;

type Hit =
  | { kind: "note"; measure: number; note: number; x: number; y: number; w: number; h: number }
  | { kind: "chord"; measure: number; beat: number; x: number; y: number; w: number; h: number }
  | { kind: "measure"; measure: number; x: number; y: number; w: number; h: number; noteStart: number; noteEnd: number; noteXs: number[]; noteStarts: number[]; full: boolean };

/** What the editor can ask the score: where (in the score's own box) a chord at this beat sits. */
export type ScoreHandle = { anchorFor: (measure: number, beat: number) => { left: number; top: number } | null };

/** Where the pointer is over the staff: the note it would add there. */
type Hover = {
  row: number;
  rowTop: number;
  x: number;
  y: number;
  ledgers: number[];
  pitch: Pitch;
  measure: number;
  /** Adding: insert after this note. */
  after: number;
  /** Over an existing note's column: overwrite that note instead. */
  replace: number | null;
};

/** Diatonic index (C0 = 0) of the written top line of the bass clef, A3. */
const TOP_LINE_INDEX = 3 * 7 + 5;

const VALUE_DURATION: Record<TNote["value"], string> = { w: "w", h: "h", q: "q", "8": "8", "16": "16" };
const ACC: Record<number, string> = { [-2]: "bb", [-1]: "b", 0: "n", 1: "#", 2: "##" };

/** Rests that fill `ticks`, from `start` ticks into the measure (aligned to beats where it can). */
function paddingRests(start: number, ticks: number): string[] {
  const out: string[] = [];
  let at = start;
  let left = ticks;
  const sizes: [number, string][] = [
    [192, "w"],
    [96, "h"],
    [48, "q"],
    [24, "8"],
    [12, "16"],
  ];
  while (left >= 12) {
    const fit = sizes.find(([t]) => t <= left && at % t === 0) ?? sizes.find(([t]) => t <= left)!;
    out.push(fit[1]);
    at += fit[0];
    left -= fit[0];
  }
  return out;
}

const CHORD_RE = /^([A-G])([b#]?)([^/]*)(?:\/([A-G])([b#]?))?$/;
const ACCIDENTAL: Record<string, string> = { b: "♭", "#": "♯" };

/** A chord symbol drawn like the chord charts' (`ChordChart`'s `ChordLabel`): a big hand-inked
    root in Petaluma Script, its accidental raised, the quality smaller beside it (Δ and ° as
    Petaluma's engraved chord-symbol glyphs) and a muted slash bass. */
function chordText(symbol: string, x: number, y: number, muted: string): SVGTextElement {
  const ns = "http://www.w3.org/2000/svg";
  const text = document.createElementNS(ns, "text");
  text.setAttribute("x", String(x));
  text.setAttribute("y", String(y));
  text.setAttribute("stroke", "none");
  const script = chordFont.style.fontFamily;
  const symbols = chordSymbolFont.style.fontFamily;
  const span = (content: string, size: number, opts: { family?: string; dy?: number; dx?: number; fill?: string } = {}) => {
    const t = document.createElementNS(ns, "tspan");
    t.textContent = content;
    t.setAttribute("font-family", opts.family ?? script);
    t.setAttribute("font-size", String(size));
    if (opts.dy) t.setAttribute("dy", String(opts.dy));
    if (opts.dx) t.setAttribute("dx", String(opts.dx));
    if (opts.fill) t.setAttribute("fill", opts.fill);
    text.appendChild(t);
  };
  const m = CHORD_RE.exec(symbol);
  if (!m) {
    span(prettyQuality(symbol), 18);
    return text;
  }
  const [, letter, acc, quality, bassLetter, bassAcc] = m;
  span(letter, 27);
  let raised = 0;
  if (acc) {
    span(ACCIDENTAL[acc], 14, { dy: -10 });
    raised = 10;
  }
  if (quality) {
    [...prettyQuality(quality)].forEach((ch, i) => {
      const glyph = SMUFL_CHORD_GLYPH[ch];
      span(glyph ?? ch, 17, { family: glyph ? symbols : script, dy: i === 0 ? raised : 0, dx: i === 0 ? 2 : 0 });
    });
    raised = 0;
  }
  if (bassLetter) span(`/${bassLetter}${bassAcc ? ACCIDENTAL[bassAcc] : ""}`, 14, { dy: raised, dx: 3, fill: muted });
  return text;
}

function themeColor(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

export default function TranscriptionScore({
  transcription,
  cursor,
  playing,
  onSelect,
  onAdd,
  onReplace,
  onChordClick,
  handleRef,
  overlay,
}: {
  transcription: Transcription;
  cursor: Cursor | null;
  /** The note being heard, if playing. */
  playing: { measure: number; note: number } | null;
  onSelect: (cursor: Cursor) => void;
  /** Clicking the staff away from a note: add `pitch` after note `after` (-1 = at the start). */
  onAdd: (measure: number, after: number, pitch: Pitch) => void;
  /** Clicking above/below an existing note (in its column): change that note to `pitch`. */
  onReplace: (measure: number, note: number, pitch: Pitch) => void;
  /** Clicking a chord symbol (to edit it). */
  onChordClick: (measure: number, beat: number) => void;
  handleRef?: React.Ref<ScoreHandle>;
  /** Drawn over the score (the editor's inline chord input). */
  overlay?: React.ReactNode;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const geomRef = useRef<{ topY: number; spacing: number }>({ topY: STAVE_Y + 10, spacing: 10 });
  const [hover, setHover] = useState<Hover | null>(null);
  const [width, setWidth] = useState(0);
  const hitsRef = useRef<Hit[][]>([]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || width <= 0) return;
    wrap.innerHTML = "";
    const accent = themeColor("--accent", "#6366f1");
    const muted = themeColor("--muted", "#888");
    const cap = measureCapacity(transcription);
    const perRow = Math.max(1, Math.min(4, Math.floor(width / MIN_MEASURE)));
    const measures = transcription.measures;
    const rows: number[][] = [];
    for (let i = 0; i < measures.length; i += perRow) rows.push(measures.slice(i, i + perRow).map((_, k) => i + k));
    hitsRef.current = [];

    // Ties that cross into the next row: remember the note that starts them.
    let pendingTie: StaveNote | null = null;

    rows.forEach((row, ri) => {
      const div = document.createElement("div");
      div.dataset.row = String(ri);
      wrap.appendChild(div);
      const renderer = new Renderer(div, Renderer.Backends.SVG);
      renderer.resize(width, ROW_HEIGHT);
      const ctx = renderer.getContext();
      const hits: Hit[] = [];
      // Only the very first measure carries the clef and time signature.
      const openingExtra = ri === 0 ? 80 : 0;
      const measureWidth = (width - 2 - openingExtra) / perRow;
      const chordMarks: { x: number; symbol: string; measure: number; beat: number }[] = [];
      let x = 1;
      const rowNotes: { note: StaveNote; src: TNote | null; measure: number; index: number }[] = [];
      const ties: StaveTie[] = [];
      const beams: Beam[] = [];
      const tuplets: Tuplet[] = [];

      row.forEach((mi, k) => {
        const m = measures[mi];
        const first = k === 0;
        const w = measureWidth + (first ? openingExtra : 0);
        const stave = new Stave(x, STAVE_Y, w);
        geomRef.current = { topY: stave.getYForLine(0), spacing: stave.getSpacingBetweenLines() };
        if (first && ri === 0) stave.addClef("bass");
        if (first && ri === 0) stave.addTimeSignature(`${transcription.timeSignature.top}/${transcription.timeSignature.bottom}`);
        if (mi === measures.length - 1) stave.setEndBarType(3); // final barline
        stave.setContext(ctx).draw();

        // Measure number on each row's first measure.
        if (first) {
          ctx.save();
          ctx.setFont("Inter, sans-serif", 10, "normal");
          ctx.setFillStyle(muted);
          ctx.fillText(String(mi + 1), x + 2, STAVE_Y + 8);
          ctx.restore();
        }

        // Notes, with accidentals as needed within the measure.
        const shown = new Map<string, number>();
        const notes: StaveNote[] = [];
        const sources: (TNote | null)[] = [];
        let used = 0;
        m.notes.forEach((n) => {
          let sn: StaveNote;
          if (n.pitch) {
            const written = n.pitch.octave + 1;
            const key = `${n.pitch.step.toLowerCase()}/${written}`;
            sn = new StaveNote({ keys: [key], duration: VALUE_DURATION[n.value] + (n.dots ? "d" : ""), clef: "bass", type: n.ghost ? "x" : "n", autoStem: true });
            const id = `${n.pitch.step}${written}`;
            const prev = shown.get(id) ?? 0;
            if (n.pitch.alter !== prev && !n.ghost) sn.addModifier(new Accidental(ACC[n.pitch.alter]), 0);
            shown.set(id, n.pitch.alter);
          } else {
            sn = new StaveNote({ keys: ["d/3"], duration: VALUE_DURATION[n.value] + (n.dots ? "d" : "") + "r", clef: "bass" });
          }
          if (n.dots) Dot.buildAndAttach([sn], { all: true });
          notes.push(sn);
          sources.push(n);
          used += noteTicks(n);
        });
        // Grey padding rests for what's left.
        for (const d of paddingRests(used, Math.max(0, cap - used))) {
          const rest = new StaveNote({ keys: ["d/3"], duration: d + "r", clef: "bass" });
          rest.setStyle({ fillStyle: muted, strokeStyle: muted });
          rest.setGroupStyle({ fillStyle: muted, strokeStyle: muted });
          notes.push(rest);
          sources.push(null);
        }

        // Triplets: runs of three triplet notes of the same value.
        let i = 0;
        while (i < sources.length) {
          const s = sources[i];
          if (s?.triplet) {
            let j = i;
            while (j < sources.length && sources[j]?.triplet && sources[j]?.value === s.value && j - i < 3) j++;
            if (j - i === 3) tuplets.push(new Tuplet(notes.slice(i, j), { numNotes: 3, notesOccupied: 2 }));
            i = j;
          } else i++;
        }

        const voice = new Voice({ numBeats: transcription.timeSignature.top, beatValue: transcription.timeSignature.bottom });
        voice.setStrict(false);
        voice.addTickables(notes);
        beams.push(...Beam.generateBeams(notes.filter((n, idx) => sources[idx] !== null) as StaveNote[], { groups: [new Fraction(1, 4)] }));
        new Formatter().joinVoices([voice]).format([voice], Math.max(40, stave.getNoteEndX() - stave.getNoteStartX() - 10));
        notes.forEach((sn, idx) => {
          const src = sources[idx];
          if (!src) return;
          const isSel = cursor && cursor.measure === mi && cursor.note === idx;
          const isPlay = playing && playing.measure === mi && playing.note === idx;
          if (isSel || isPlay) {
            const color = isPlay ? "#f59e0b" : accent;
            sn.setStyle({ fillStyle: color, strokeStyle: color });
          }
          rowNotes.push({ note: sn, src, measure: mi, index: idx });
        });
        voice.draw(ctx, stave);
        // Mark the real notes' SVG groups (not the grey padding rests).
        notes.forEach((sn, idx) => {
          if (sources[idx]) sn.getSVGElement()?.setAttribute("data-note", `${mi}:${idx}`);
        });

        // Chord symbols above, at their beat.
        const startX = stave.getNoteStartX();
        const endX = stave.getNoteEndX();
        const beatX = (beat: number) => {
          // Prefer the x of a note starting on that beat.
          let at = 0;
          for (let idx = 0; idx < notes.length; idx++) {
            if (Math.abs(at - beat * TICKS_PER_QUARTER) < 1) return notes[idx].getAbsoluteX();
            const src = sources[idx];
            at += src ? noteTicks(src) : 0;
            if (!src) break;
          }
          return startX + ((endX - startX) * beat) / transcription.timeSignature.top;
        };
        for (const c of m.chords) chordMarks.push({ x: beatX(c.beat) - 4, symbol: c.symbol, measure: mi, beat: c.beat });
        // Note starts (in ticks) alongside their x, for placing chords on a note.
        const starts: number[] = [];
        {
          let acc = 0;
          sources.forEach((src) => {
            if (!src) return;
            starts.push(acc);
            acc += noteTicks(src);
          });
        }

        hits.push({
          kind: "measure",
          measure: mi,
          x,
          y: 0,
          w,
          h: ROW_HEIGHT,
          noteStart: startX,
          noteEnd: endX,
          noteStarts: starts,
          noteXs: notes.filter((_, idx) => sources[idx] !== null).map((sn) => sn.getAbsoluteX()),
          full: used >= cap,
        });
        x += w;
      });

      // Ties between consecutive notes on this row (and partial ones across rows).
      for (let n = 0; n < rowNotes.length; n++) {
        const cur = rowNotes[n];
        if (n === 0 && pendingTie) {
          ties.push(new StaveTie({ lastNote: cur.note, lastIndexes: [0] }));
          pendingTie = null;
        }
        if (!cur.src?.tie || !cur.src.pitch) continue;
        const next = rowNotes[n + 1];
        if (next && next.src?.pitch) ties.push(new StaveTie({ firstNote: cur.note, lastNote: next.note, firstIndexes: [0], lastIndexes: [0] }));
        else if (!next) {
          ties.push(new StaveTie({ firstNote: cur.note, firstIndexes: [0] }));
          pendingTie = cur.note;
        }
      }
      beams.forEach((b) => b.setContext(ctx).draw());
      tuplets.forEach((t) => t.setContext(ctx).draw());
      ties.forEach((t) => t.setContext(ctx).draw());

      // Hit boxes and the caret.
      for (const rn of rowNotes) {
        const bb = rn.note.getBoundingBox();
        if (bb) hits.unshift({ kind: "note", measure: rn.measure, note: rn.index, x: bb.getX() - 3, y: bb.getY() - 3, w: bb.getW() + 6, h: bb.getH() + 6 });
      }
      if (cursor && row.includes(cursor.measure)) {
        const sel = rowNotes.find((rn) => rn.measure === cursor.measure && rn.index === cursor.note);
        const measureHit = hits.find((h) => h.kind === "measure" && h.measure === cursor.measure);
        let caretX: number | null = null;
        if (sel) {
          const bb = sel.note.getBoundingBox();
          caretX = bb ? bb.getX() + bb.getW() + 5 : null;
        } else if (measureHit?.kind === "measure") caretX = measureHit.noteStart - 6;
        const svg = div.querySelector("svg");
        if (svg && measureHit) {
          const ns = "http://www.w3.org/2000/svg";
          const bg = document.createElementNS(ns, "rect");
          bg.setAttribute("x", String(measureHit.x));
          bg.setAttribute("y", String(STAVE_Y - 24));
          bg.setAttribute("width", String(measureHit.w));
          bg.setAttribute("height", String(80));
          bg.setAttribute("rx", "6");
          bg.setAttribute("fill", accent);
          bg.setAttribute("fill-opacity", "0.07");
          bg.setAttribute("stroke", "none");
          svg.insertBefore(bg, svg.firstChild);
          if (caretX !== null) {
            const line = document.createElementNS(ns, "rect");
            line.setAttribute("x", String(caretX));
            line.setAttribute("y", String(STAVE_Y + 2));
            line.setAttribute("width", "2");
            line.setAttribute("height", "46");
            line.setAttribute("fill", accent);
            line.setAttribute("stroke", "none");
            line.setAttribute("class", "notation-caret");
            svg.appendChild(line);
          }
        }
      }
      const rowSvg = div.querySelector("svg");
      if (rowSvg)
        for (const mark of chordMarks) {
          const el = chordText(mark.symbol, mark.x, STAVE_Y - 8, muted);
          rowSvg.appendChild(el);
          const bb = el.getBBox();
          hits.unshift({ kind: "chord", measure: mark.measure, beat: mark.beat, x: bb.x - 3, y: bb.y - 3, w: bb.width + 6, h: bb.height + 6 });
        }
      hitsRef.current[ri] = hits;

      const svg = div.querySelector("svg");
      if (svg) {
        svg.setAttribute("fill", "currentColor");
        svg.setAttribute("stroke", "currentColor");
        svg.style.display = "block";
        svg.style.overflow = "visible";
      }
    });
  }, [transcription, cursor, playing, width]);

  useImperativeHandle(
    handleRef,
    () => ({
      anchorFor(measure, beat) {
        const wrap = wrapRef.current;
        if (!wrap) return null;
        for (let ri = 0; ri < hitsRef.current.length; ri++) {
          const mh = hitsRef.current[ri]?.find((h) => h.kind === "measure" && h.measure === measure);
          if (!mh || mh.kind !== "measure") continue;
          const rowEl = wrap.querySelector(`[data-row="${ri}"]`) as HTMLElement | null;
          const k = mh.noteStarts.findIndex((st) => Math.abs(st - beat * TICKS_PER_QUARTER) < 1);
          const x = k >= 0 ? mh.noteXs[k] : mh.noteStart + ((mh.noteEnd - mh.noteStart) * beat) / transcription.timeSignature.top;
          return { left: x - 6, top: (rowEl?.offsetTop ?? 0) + STAVE_Y - 34 };
        }
        return null;
      },
    }),
    [transcription.timeSignature.top],
  );

  /** What's under the pointer: a note, a spot on the staff (and the note it'd add), or a measure. */
  const locate = (e: React.MouseEvent) => {
    const rowEl = (e.target as HTMLElement).closest("[data-row]") as HTMLElement | null;
    if (!rowEl) return null;
    const row = Number(rowEl.dataset.row);
    const rect = rowEl.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hits = hitsRef.current[row] ?? [];
    const chord = hits.find((h) => h.kind === "chord" && x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
    if (chord && chord.kind === "chord") return { kind: "chord" as const, chord };
    const note = hits.find((h) => h.kind === "note" && x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);
    if (note && note.kind === "note") return { kind: "note" as const, note };
    const measure = hits.find((h) => h.kind === "measure" && x >= h.x && x <= h.x + h.w);
    if (!measure || measure.kind !== "measure") return null;
    const { topY, spacing } = geomRef.current;
    const steps = Math.round(((y - topY) / spacing) * 2); // 0 = top line, each step a line or space
    const onStaff = steps >= -9 && steps <= 17;
    if (!onStaff) return { kind: "measure" as const, measure };
    const index = TOP_LINE_INDEX - steps;
    const pitch: Pitch = { step: STEPS[((index % 7) + 7) % 7], alter: 0, octave: Math.floor(index / 7) - 1 };
    const midi = midiOf(pitch);
    if (midi < LOWEST_MIDI || midi > HIGHEST_MIDI) return { kind: "measure" as const, measure };
    // Which note's column the pointer is in (halfway to each neighbour); past the last note of a
    // bar with room left is the place to add one. A full bar only ever overwrites.
    const xs = measure.noteXs;
    let replace: number | null = null;
    for (let i = 0; i < xs.length; i++) {
      const left = i === 0 ? measure.x : (xs[i - 1] + xs[i]) / 2 + 6;
      const right = i === xs.length - 1 ? (measure.full ? measure.x + measure.w : xs[i] + 24) : (xs[i] + xs[i + 1]) / 2 + 6;
      if (x >= left && x < right) replace = i;
    }
    const after = xs.length - 1;
    const ledgers: number[] = [];
    for (let s2 = -2; s2 >= steps; s2 -= 2) ledgers.push(topY + (s2 / 2) * spacing);
    for (let s2 = 10; s2 <= steps; s2 += 2) ledgers.push(topY + (s2 / 2) * spacing);
    return {
      kind: "staff" as const,
      measure,
      hover: {
        row,
        rowTop: rowEl.offsetTop,
        x: replace !== null ? xs[replace] + 6 : x,
        y: topY + (steps / 2) * spacing,
        ledgers,
        pitch,
        measure: measure.measure,
        after,
        replace,
      } satisfies Hover,
    };
  };

  const onMove = (e: React.MouseEvent) => {
    const at = locate(e);
    const next = at?.kind === "staff" ? at.hover : null;
    setHover((h) => (h && next && h.row === next.row && h.y === next.y && Math.abs(h.x - next.x) < 2 && h.after === next.after && h.replace === next.replace ? h : next));
  };

  const onClick = (e: React.MouseEvent) => {
    const at = locate(e);
    if (!at) return;
    if (at.kind === "chord") onChordClick(at.chord.measure, at.chord.beat);
    else if (at.kind === "note") onSelect({ measure: at.note.measure, note: at.note.note });
    else if (at.kind === "staff") {
      if (at.hover.replace !== null) onReplace(at.hover.measure, at.hover.replace, at.hover.pitch);
      else onAdd(at.hover.measure, at.hover.after, at.hover.pitch);
    }
    else onSelect({ measure: at.measure.measure, note: transcription.measures[at.measure.measure].notes.length - 1 });
  };

  const accentVar = "var(--accent)";
  return (
    <div className="relative w-full" onMouseMove={onMove} onMouseLeave={() => setHover(null)} onClick={onClick} style={{ cursor: hover ? "copy" : "default" }}>
      <div ref={wrapRef} className="w-full select-none text-foreground" aria-label="Notation" />
      {overlay}
      {hover && (
        <svg className="pointer-events-none absolute left-0 w-full overflow-visible" style={{ top: hover.rowTop, height: ROW_HEIGHT }} aria-hidden>
          {hover.ledgers.map((ly) => (
            <line key={ly} x1={hover.x - 11} x2={hover.x + 11} y1={ly} y2={ly} stroke={accentVar} strokeOpacity={0.6} strokeWidth={1.2} />
          ))}
          <ellipse cx={hover.x} cy={hover.y} rx={6.2} ry={4.6} transform={`rotate(-20 ${hover.x} ${hover.y})`} fill={accentVar} fillOpacity={0.5} />
          <text x={hover.x + 11} y={hover.y - 9} fontSize={11} fontWeight={700} fill={accentVar} stroke="var(--surface)" strokeWidth={3} paintOrder="stroke">
            {pitchName(hover.pitch)}
          </text>
        </svg>
      )}
    </div>
  );
}
