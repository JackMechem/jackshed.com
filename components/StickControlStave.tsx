"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Annotation,
  AnnotationVerticalJustify,
  Beam,
  Formatter,
  Renderer,
  Stave,
  StaveNote,
  Tuplet,
  Voice,
} from "vexflow";
import type { GeneratedPattern, NoteCell } from "@/lib/stickControl";

// Renders a Stick Control pattern as actual engraved notation (via VexFlow, this app's first use
// of a real sheet-music library — reused rather than hand-rolling a drum-notation renderer the
// way e.g. ChordChart.tsx hand-rolls chord notation, since the request specifically asked for
// "some kind of sheet music library"), each stroke's sticking letter printed below it exactly
// like the book's own "R"/"L" captions.
//
// Every bar used to get its own separate `Renderer`/card; fixed into one continuous system per a
// direct follow-up ("bars should not be in separate containers... right next to each other in one
// line with nothing separating them"). That worked well up to a handful of bars, but a pattern
// that needs many (an 11- or 13-stroke roll can need 11-13 bars to realign with the bar line —
// see `lib/stickControl.ts`'s own `minimalBarsFor`) then had to squeeze onto one ever-shrinking
// line, reported back directly as illegible. Fixed again, this time with real line-wrapping: bars
// are grouped into *rows* of at most `MAX_BARS_PER_ROW`, each row rendered as its own continuous
// multi-bar system (reusing the exact same "abutting Staves on one shared canvas" approach the
// single-line version already used) and stacked vertically — real sheet music's own "system
// break" convention, not a one-off. How many bars actually fit in a row is measured against the
// container's own real width (via `ResizeObserver`, the same technique `ChordChart.tsx`'s
// `PageFit` already uses elsewhere in this app) using each bar's own already-measured natural
// width, capped at `MAX_BARS_PER_ROW` — "adjusting to screen size" in the literal sense: a wide
// desktop window gets up to 4 bars per row, a narrow phone gets fewer, whatever actually fits
// without needing to shrink below a reasonable size.

const BAR_HEIGHT = 130;
const STAVE_Y = 10;
// Extra room *before* the first note of a bar that doesn't already get it from a clef: a bare
// stave needs only a little, immediately after the previous bar's own closing barline.
const LEFT_PAD_PLAIN = 16;
const LEFT_PAD_CLEF = 70;
const RIGHT_PAD = 20;
const MAX_BARS_PER_ROW = 4;
// Before the container's real width has ever been measured (the very first paint), assume a
// generous desktop-ish width rather than 0 — avoids a flash of "1 bar per row" that would
// immediately reflow wider the instant `ResizeObserver` reports in.
const DEFAULT_CONTAINER_WIDTH = 900;
// A little darker than the theme's own full-strength `--foreground` (per a direct follow-up:
// "make the notes a little darker on both light and dark themes") — `color-mix` so this tracks
// whichever theme/custom colors are active rather than a fixed hex, the same technique
// `lib/theme.ts`'s own `overlayValue` already uses elsewhere in this app. Mixing toward black
// specifically (not the theme's own background, which is *lighter* than foreground in a light
// theme) keeps the direction of "darker" consistent across both themes rather than flipping sign
// in light mode.
const NOTATION_COLOR = "color-mix(in srgb, var(--foreground) 80%, black)";

type BarRect = { x: number; width: number };

function buildNote(hand: string, dur: string) {
  const note = new StaveNote({ keys: ["b/4"], duration: dur, clef: "percussion" });
  const annotation = new Annotation(hand);
  annotation.setVerticalJustification(AnnotationVerticalJustify.BOTTOM);
  note.addModifier(annotation, 0);
  return note;
}

/** Groups `cells` into one beam per *beat*, tracked by accumulated time rather than a fixed cell
    count — a beat of normal cells is exactly `subdivision` of them, but a beat of `fast` cells
    (half a normal cell's time each) is `subdivision * 2` of them, so a fixed-count grouping would
    split a roll segment's beats in the wrong place. */
function buildBeamGroups(cells: NoteCell[], subdivision: number, duration: string, fastDuration: string) {
  const groups: StaveNote[][] = [];
  let current: StaveNote[] = [];
  let timeInBeat = 0;
  cells.forEach((cell) => {
    current.push(buildNote(cell.hand, cell.fast ? fastDuration : duration));
    timeInBeat += cell.fast ? 0.5 : 1;
    if (timeInBeat >= subdivision - 1e-6) {
      groups.push(current);
      current = [];
      timeInBeat = 0;
    }
  });
  if (current.length > 0) groups.push(current);
  return groups;
}

/** One row's worth of a multi-bar system, rendered into its own shared `Renderer`/SVG — bars
    positioned side by side with no gap, same as the single-line version this was built from. */
function StickControlRow({
  rowBars,
  subdivision,
  beatsPerBar,
  activeIndexInRow,
}: {
  rowBars: NoteCell[][];
  subdivision: number;
  beatsPerBar: number;
  activeIndexInRow: number | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [barRects, setBarRects] = useState<BarRect[]>([]);
  const [totalWidth, setTotalWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = "";

    const duration = subdivision === 4 ? "16" : "8";
    const fastDuration = subdivision === 4 ? "32" : "16";

    // Pass 1: build each bar's own notes/voice and measure its own natural minimum width.
    const barData = rowBars.map((cells, i) => {
      const beamGroups = buildBeamGroups(cells, subdivision, duration, fastDuration);
      const staveNotes = beamGroups.flat();
      const voice = new Voice({ numBeats: beatsPerBar, beatValue: 4 });
      voice.setStrict(false);
      voice.addTickables(staveNotes);
      const formatter = new Formatter().joinVoices([voice]);
      const minWidth = formatter.preCalculateMinTotalWidth([voice]);
      const leftPad = i === 0 ? LEFT_PAD_CLEF : LEFT_PAD_PLAIN;
      const isLast = i === rowBars.length - 1;
      const width = Math.ceil(minWidth) + leftPad + (isLast ? RIGHT_PAD : 0);
      return { beamGroups, voice, formatter, minWidth, width };
    });

    const fullWidth = barData.reduce((sum, b) => sum + b.width, 0);

    const renderer = new Renderer(el, Renderer.Backends.SVG);
    renderer.resize(fullWidth, BAR_HEIGHT);
    const context = renderer.getContext();

    // Pass 2: lay every bar's own `Stave` side by side, each starting exactly where the previous
    // one's own width ends.
    const allBeams: Beam[] = [];
    const allTuplets: Tuplet[] = [];
    const rects: BarRect[] = [];
    let x = 0;
    for (let i = 0; i < barData.length; i++) {
      const { voice, formatter, minWidth, width, beamGroups } = barData[i];
      const stave = new Stave(x, STAVE_Y, width);
      if (i === 0) stave.addClef("percussion");
      stave.setContext(context).draw();

      formatter.format([voice], minWidth);

      // Beams (and tuplets) have to exist *before* the voice is drawn — see this file's own doc
      // comment history; only the drawing of the beams/tuplets themselves happens after.
      for (const group of beamGroups) {
        if (group.length < 2) continue;
        allBeams.push(new Beam(group));
        if (subdivision === 3) allTuplets.push(new Tuplet(group));
      }

      voice.draw(context, stave);
      rects.push({ x, width });
      x += width;
    }
    allBeams.forEach((b) => b.setContext(context).draw());
    allTuplets.forEach((t) => t.setContext(context).draw());

    const svg = el.querySelector("svg");
    if (svg) {
      svg.setAttribute("viewBox", `0 0 ${fullWidth} ${BAR_HEIGHT}`);
      svg.removeAttribute("width");
      svg.removeAttribute("height");
      svg.style.width = "100%";
      svg.style.height = "auto";
      svg.style.display = "block";
      // VexFlow's own SVG context hardcodes `fill="black" stroke="black"` on the root <svg> —
      // every notehead/stem/beam/barline/annotation below it leaves its own fill/stroke unset and
      // just inherits that, which reads fine against a light theme's own white page but is close
      // to invisible against a dark theme's own dark background (reported directly, with a
      // screenshot). `currentColor` resolves through the same CSS inheritance to the wrapping
      // `containerRef` div below, which sets its own `color` to a slightly dimmed version of the
      // theme's own foreground — not the full-strength color text uses — per a direct follow-up
      // ("make the notes a little darker on both light and dark themes") once pure `--foreground`
      // read as too stark/glary once actually seen. One override here recolors every one of those
      // descendants at once, correctly following whichever theme is currently active.
      svg.setAttribute("fill", "currentColor");
      svg.setAttribute("stroke", "currentColor");
    }

    setBarRects(rects);
    setTotalWidth(fullWidth);
    // `rowBars` only ever changes reference when the pattern itself is regenerated or the row
    // layout changes — a tick-driven re-render for `activeIndexInRow` alone leaves it
    // referentially stable, so this effect correctly skips redrawing the SVG for those.
  }, [rowBars, subdivision, beatsPerBar]);

  return (
    <div className="relative mx-auto w-full" style={totalWidth ? { maxWidth: totalWidth } : undefined}>
      <div ref={containerRef} style={{ color: NOTATION_COLOR }} />
      {totalWidth > 0 &&
        barRects.map((rect, i) => (
          <div
            key={i}
            aria-hidden
            className={`pointer-events-none absolute inset-y-0 rounded-md transition-colors ${
              activeIndexInRow === i ? "bg-accent/10 ring-2 ring-inset ring-accent" : ""
            }`}
            style={{
              left: `${(rect.x / totalWidth) * 100}%`,
              width: `${(rect.width / totalWidth) * 100}%`,
            }}
          />
        ))}
    </div>
  );
}

export default function StickControlStave({
  pattern,
  activeBarIndex,
  background = "surface",
}: {
  pattern: GeneratedPattern;
  activeBarIndex: number | null;
  /** "background" renders a slightly darker card than the default "surface" — used for the
      upcoming-pattern preview below the current one, so it reads as a step removed from what's
      actually playing without needing a second visual treatment invented just for this. Both
      tokens are deliberately already-darker-background-than-surface in both themes (see
      `app/globals.css`), not a one-off opacity hack. */
  background?: "surface" | "background";
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(DEFAULT_CONTAINER_WIDTH);

  useLayoutEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) setContainerWidth(Math.round(width));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { subdivision, beatsPerBar, bars } = pattern;

  // How many bars fit in one row, measured against the container's real width using each bar's
  // own natural (unscaled) width — capped at `MAX_BARS_PER_ROW` regardless of how much room is
  // available, and never below 1 even if a single bar alone would need to shrink to fit. Memoized
  // since `bars`/`subdivision`/`beatsPerBar` only change when the pattern is actually
  // regenerated — without this, a tick-driven re-render for `activeBarIndex` alone (every
  // playback tick) would rebuild every bar's `Voice`/`Formatter` just to re-derive the same
  // answer.
  const { rows, barsPerRow } = useMemo(() => {
    const duration = subdivision === 4 ? "16" : "8";
    const fastDuration = subdivision === 4 ? "32" : "16";

    function naturalBarWidth(cells: NoteCell[]): number {
      const beamGroups = buildBeamGroups(cells, subdivision, duration, fastDuration);
      const voice = new Voice({ numBeats: beatsPerBar, beatValue: 4 });
      voice.setStrict(false);
      voice.addTickables(beamGroups.flat());
      return new Formatter().joinVoices([voice]).preCalculateMinTotalWidth([voice]);
    }

    let perRow = Math.min(MAX_BARS_PER_ROW, bars.length);
    while (perRow > 1) {
      const widths = bars
        .slice(0, perRow)
        .map((cells, i) => Math.ceil(naturalBarWidth(cells)) + (i === 0 ? LEFT_PAD_CLEF : LEFT_PAD_PLAIN));
      const rowWidth = widths.reduce((a, b) => a + b, 0) + RIGHT_PAD;
      if (rowWidth <= containerWidth) break;
      perRow--;
    }

    const grouped: NoteCell[][][] = [];
    for (let i = 0; i < bars.length; i += perRow) {
      grouped.push(bars.slice(i, i + perRow));
    }
    return { rows: grouped, barsPerRow: perRow };
  }, [bars, subdivision, beatsPerBar, containerWidth]);

  return (
    <div
      ref={wrapperRef}
      className={`flex w-full flex-col gap-3 rounded-xl p-2 ${
        background === "background" ? "bg-background" : "bg-surface"
      }`}
    >
      {rows.map((rowBars, rowIndex) => {
        const rowStart = rowIndex * barsPerRow;
        const activeIndexInRow =
          activeBarIndex !== null && activeBarIndex >= rowStart && activeBarIndex < rowStart + rowBars.length
            ? activeBarIndex - rowStart
            : null;
        return (
          <StickControlRow
            key={rowIndex}
            rowBars={rowBars}
            subdivision={subdivision}
            beatsPerBar={beatsPerBar}
            activeIndexInRow={activeIndexInRow}
          />
        );
      })}
    </div>
  );
}
