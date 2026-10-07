import type { Bar, ChordSlot, IRealSong } from '@jam-practice/core/iRealPro';
import { formatComposer } from '@jam-practice/core/iRealPro';
import { useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';

import { ChordQualityText } from '@/components/ChordQualityText';
import { useAppTheme } from '@/theme/ThemeProvider';

/**
 * Native port of `apps/web/components/ChordChart.tsx` — the chart notation renderer. Ported
 * concept-for-concept, not a reskin: web's `PageFit` measures natural (unscaled) content size via
 * `ResizeObserver` and applies `transform: scale()` so a chart of any length fits its box without
 * ever needing to scroll internally; here, `onLayout` on an outer "box" View and an inner
 * absolutely-positioned "content" View gives the same two measurements (RN's `transform` is
 * visual-only, exactly like CSS transform, so it never feeds back into the measured layout size —
 * confirmed by reasoning through RN's own layout model, the same guarantee web's code already
 * relies on). `groupRows`, `Row`, `BarContent`, `COL_WIDTH`, `BAR_HEIGHT`, `QUALITY_SIZE`,
 * `BADGE_SIZE` are exported for `ChordChartEditor.tsx` (the mobile chart builder) to reuse
 * wholesale — "the editor IS the chart, not a second approximation of one," the same principle
 * `PROJECT.md`'s own Chord Charts history says web's builder was redesigned around.
 *
 * One deliberate scope-down from web, in the name of a working first native pass rather than a
 * pixel-perfect one: web's `PageFit` has two modes (`fitHeight={true}` for the full-screen
 * "maximize" overlay, `fitHeight={false}` for the normal in-page view). Mobile has no "maximize"
 * affordance at all yet (the main screen is already close to full width), so this file only ports
 * the `fitHeight={false}` behavior — grow/shrink to fill the available width (capped at
 * `MAX_SCALE`), with the resulting height following the content. A fullscreen mode can be added
 * later the same way web's second branch works, if a "maximize" button is ever added here too.
 *
 * Font-size/width constants below are the exact web values converted from `rem` to `px` at the
 * same 16px base (`COL_WIDTH` 7.5rem -> 120, `BAR_HEIGHT` 5.25rem -> 84, etc.) — not re-tuned —
 * since this is meant to be the same chart, not a different one.
 */

export const COL_WIDTH = 120;
export const BAR_HEIGHT = 84;
const ROOT_SIZE = 36;
const ROOT_ACCIDENTAL_SIZE = 18;
export const QUALITY_SIZE = 22;
const BASS_SIZE = 18;
const REPEAT_SIZE = 28;
const SYMBOL_SIZE = 18;
const SMALL_LABEL_SIZE = 13;
export const BADGE_SIZE = 12;
const TIME_SIG_SIZE = 28;

// A short chart is allowed to scale *up* past its natural size to better fill the available width
// (a 4-bar tune at 1:1 would otherwise sit small with a lot of empty space around it) — capped
// well short of comically large, same as web.
const MAX_SCALE = 1.6;

const ACCIDENTAL_GLYPH: Record<'b' | '#', string> = { b: '♭', '#': '♯' };

// SMuFL codepoints read directly out of the real bundled Petaluma.otf's cmap (the same
// verification method `ChordQualityText.tsx` and `apps/web/components/ChordChart.tsx` already
// used for every glyph in this chart) — repeat1Bar (U+E500), segno (U+E047), coda (U+E048).
const GLYPH_REPEAT_BAR = '';
const GLYPH_SEGNO = '';
const GLYPH_CODA = '';

export default function ChordChartView({
  song,
  barsPerRow = 4,
  headerActions,
}: {
  song: IRealSong;
  barsPerRow?: number;
  /** Rendered above the composer, in the header's own top-right column — e.g. a transpose
      dropdown/delete button a caller wants sharing the title row instead of a separate row of its
      own above it (`app/tool/chord-charts-view.tsx`'s own reason for this prop). The only other
      real call site, `LinkedChartModal.tsx`, leaves this unset, so its header renders exactly as
      it always has. */
  headerActions?: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  const rows = groupRows(song.bars, barsPerRow);

  return (
    <View style={{ gap: 16 }}>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.background,
          paddingBottom: 12,
        }}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            className="font-inter-bold"
            style={{ fontSize: 22, fontWeight: '700', color: colors.foreground }}
          >
            {song.title || 'Untitled'}
          </Text>
          <Text className="font-inter" style={{ fontSize: 13, color: colors.muted }}>
            {song.style}
            {song.style ? ' · ' : ''}
            {song.key} · {song.timeSignature.top}/{song.timeSignature.bottom}
          </Text>
        </View>
        {headerActions || song.composer ? (
          <View style={{ alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
            {headerActions}
            {song.composer ? (
              <Text className="font-inter" style={{ fontSize: 13, color: colors.muted }}>
                {formatComposer(song.composer)}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>

      {song.bars.length === 0 ? (
        <Text className="font-inter" style={{ fontSize: 13, color: colors.muted }}>
          No chords found in this chart.
        </Text>
      ) : (
        <PageFit>
          {rows.map((row, i) => (
            <Row
              key={i}
              bars={row}
              barsPerRow={barsPerRow}
              isFirstRow={i === 0}
              isLastRow={i === rows.length - 1}
              timeSignature={i === 0 ? song.timeSignature : undefined}
            />
          ))}
        </PageFit>
      )}
    </View>
  );
}

/** Measures its children's natural (unscaled) size and applies one uniform scale so the whole
    chart fits the available width, however many rows it takes — see this file's own doc comment
    for the pixel-math derivation (manually computed top offset, no reliance on a `transformOrigin`
    style prop, to stay safe across RN versions). Exported for `ChordChartEditor.tsx`'s own bar
    grid, same as web's `PageFit`. */
export function PageFit({ children }: { children: React.ReactNode }) {
  const [boxWidth, setBoxWidth] = useState(0);
  const [natural, setNatural] = useState({ w: 0, h: 0 });

  const scale = boxWidth > 0 && natural.w > 0 ? Math.min(MAX_SCALE, boxWidth / natural.w) : 1;
  // Manually emulates CSS `transform-origin: top center` without needing RN's own
  // `transformOrigin` style prop (whose support varies by RN version): scaling around the
  // element's own default center would move its top edge down when shrinking, so the vertical
  // position is pre-shifted by half the height delta the scale introduces, keeping the visual top
  // edge pinned at y=0 and the horizontal center pinned at the box's own center either way.
  const top = natural.h > 0 ? (natural.h / 2) * (scale - 1) : 0;
  const left = boxWidth / 2 - natural.w / 2;

  function onBoxLayout(e: LayoutChangeEvent) {
    setBoxWidth(e.nativeEvent.layout.width);
  }
  function onContentLayout(e: LayoutChangeEvent) {
    setNatural({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  }

  return (
    <View
      style={{ width: '100%', height: natural.h > 0 ? natural.h * scale : undefined, overflow: 'hidden' }}
      onLayout={onBoxLayout}
    >
      <View
        onLayout={onContentLayout}
        style={{
          position: 'absolute',
          left,
          top,
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: 12,
          transform: [{ scale }],
        }}
      >
        {children}
      </View>
    </View>
  );
}

/** Pure logic, no rendering — exported for `ChordChartEditor.tsx` so "break into rows of
    `barsPerRow`, starting a fresh row early at a `newRow` bar" is the exact same rule in both
    places. Identical to web's version. */
export function groupRows(bars: Bar[], barsPerRow: number): Bar[][] {
  const rows: Bar[][] = [];
  let current: Bar[] = [];
  for (const bar of bars) {
    if (current.length > 0 && (bar.newRow || current.length >= barsPerRow)) {
      rows.push(current);
      current = [];
    }
    current.push(bar);
  }
  if (current.length > 0) rows.push(current);
  return rows;
}

function endingSpans(bars: Bar[]): { label: string; start: number; span: number }[] {
  const spans: { label: string; start: number; span: number }[] = [];
  let i = 0;
  while (i < bars.length) {
    const label = bars[i].endingLabel;
    if (!label) {
      i += 1;
      continue;
    }
    let j = i;
    while (j < bars.length && bars[j].endingLabel === label) j += 1;
    spans.push({ label, start: i, span: j - i });
    i = j;
  }
  return spans;
}

/** Exported for `ChordChartEditor.tsx`, which reuses this wholesale for its own bar grid via one
    optional addition it passes that this file's own default export never does: `renderBarContent`
    lets the builder override what's shown *inside* the bar currently being typed into (a text
    input instead of the normal rendered chord symbols), while every other bar still renders
    through the normal `BarContent` path; `trailing` appends one more item after the row's own
    bars (the builder's "Add bar" button).

    Unlike web's CSS-grid version, this is a plain flex row — a trailing item simply sits where it
    naturally falls as the next flex child, no column-index math needed. Blank filler cells still
    pad a short row out to `barsPerRow` columns (matching how a real chart never changes bar width
    mid-line just because a line ends early), accounting for whether a trailing item took one of
    the slots. */
export function Row({
  bars,
  barsPerRow,
  isFirstRow,
  isLastRow,
  timeSignature,
  renderBarContent,
  trailing,
}: {
  bars: Bar[];
  barsPerRow: number;
  isFirstRow: boolean;
  isLastRow: boolean;
  timeSignature?: { top: number; bottom: number };
  renderBarContent?: (bar: Bar, indexInRow: number) => React.ReactNode;
  trailing?: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  // The section letter is drawn inside the row's first bar, not a gutter column of its own — same
  // reasoning as web: a gutter would eat into the width available to the bars themselves.
  const section = bars[0]?.section;
  const spans = endingSpans(bars);
  const hasEndings = spans.length > 0;
  const fillerCount = Math.max(0, barsPerRow - bars.length - (trailing ? 1 : 0));

  return (
    <View>
      {hasEndings ? (
        <View style={{ height: 20, flexDirection: 'row' }}>
          {spans.map((s) => (
            <View
              key={s.start}
              style={{
                position: 'absolute',
                left: s.start * COL_WIDTH,
                width: s.span * COL_WIDTH,
                borderTopWidth: 2,
                borderTopColor: `${colors.foreground}B3`,
                paddingLeft: 4,
              }}
            >
              <Text
                className="font-inter-semibold"
                style={{ fontSize: SMALL_LABEL_SIZE, fontWeight: '600', color: colors.muted }}
              >
                {s.label}.
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: 'row' }}>
        {bars.map((bar, i) => (
          <BarCell
            key={i}
            bar={bar}
            section={i === 0 ? section : undefined}
            timeSignature={i === 0 ? timeSignature : undefined}
            isFirst={i === 0}
            isLast={i === bars.length - 1}
            isFirstOfChart={isFirstRow && i === 0}
            isLastOfChart={isLastRow && i === bars.length - 1}
            content={renderBarContent?.(bar, i)}
          />
        ))}
        {trailing}
        {Array.from({ length: fillerCount }).map((_, i) => (
          <View key={`filler-${i}`} style={{ width: COL_WIDTH, height: BAR_HEIGHT }} />
        ))}
      </View>
    </View>
  );
}

function BarCell({
  bar,
  section,
  timeSignature,
  isFirst,
  isLast,
  isFirstOfChart,
  isLastOfChart,
  content,
}: {
  bar: Bar;
  section?: string;
  timeSignature?: { top: number; bottom: number };
  isFirst: boolean;
  isLast: boolean;
  isFirstOfChart: boolean;
  isLastOfChart: boolean;
  content?: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  // iReal Pro always draws the chart's very opening barline thick/doubled, independent of whether
  // that bar also carries an explicit repeat-open marker — matched here too.
  const leftWidth = bar.startRepeat || isFirstOfChart ? 4 : isFirst ? 1 : 0;
  const leftColor = bar.startRepeat || isFirstOfChart ? colors.foreground : `${colors.muted}66`;
  const rightWidth = bar.endRepeat ? 4 : isLast && isLastOfChart ? 4 : isLast ? 1 : 1;
  const rightColor = bar.endRepeat || (isLast && isLastOfChart) ? colors.foreground : `${colors.muted}66`;

  return (
    <View
      style={{
        width: COL_WIDTH,
        height: BAR_HEIGHT,
        borderLeftWidth: leftWidth,
        borderLeftColor: leftColor,
        borderRightWidth: rightWidth,
        borderRightColor: rightColor,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: 4,
        paddingHorizontal: 2,
      }}
    >
      {bar.startRepeat ? <RepeatDots side="left" /> : null}
      {bar.endRepeat ? <RepeatDots side="right" /> : null}
      {section ? (
        <View
          style={{
            position: 'absolute',
            left: 2,
            top: 2,
            minWidth: BADGE_SIZE * 1.6,
            height: BADGE_SIZE * 1.6,
            paddingHorizontal: 4,
            borderRadius: 4,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: 'PetalumaScript', fontSize: BADGE_SIZE, fontWeight: '700', color: colors['accent-foreground'] }}>
            {section}
          </Text>
        </View>
      ) : null}
      {bar.segno || bar.coda ? (
        <Text
          style={{ position: 'absolute', right: 2, top: 2, fontFamily: 'Petaluma', fontSize: SYMBOL_SIZE, color: colors.accent }}
        >
          {bar.segno ? GLYPH_SEGNO : GLYPH_CODA}
        </Text>
      ) : null}
      {timeSignature ? <TimeSignatureGlyph timeSignature={timeSignature} /> : null}
      {content ?? <BarContent bar={bar} />}
    </View>
  );
}

function TimeSignatureGlyph({ timeSignature }: { timeSignature: { top: number; bottom: number } }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ alignItems: 'center', marginRight: 2 }}>
      <Text style={{ fontFamily: 'PetalumaScript', fontSize: TIME_SIG_SIZE, lineHeight: TIME_SIG_SIZE * 0.9, color: colors.foreground }}>
        {timeSignature.top}
      </Text>
      <Text style={{ fontFamily: 'PetalumaScript', fontSize: TIME_SIG_SIZE, lineHeight: TIME_SIG_SIZE * 0.9, color: colors.foreground }}>
        {timeSignature.bottom}
      </Text>
    </View>
  );
}

function RepeatDots({ side }: { side: 'left' | 'right' }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={{
        position: 'absolute',
        top: '50%',
        transform: [{ translateY: -8 }],
        gap: 3,
        ...(side === 'left' ? { left: 5 } : { right: 5 }),
      }}
    >
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.foreground }} />
      <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: colors.foreground }} />
    </View>
  );
}

/** Exported for `ChordChartEditor.tsx`, which wraps this in its own `Pressable` (to activate a bar
    for editing) around every bar that isn't the one currently being typed into — reusing this
    directly rather than a second "blank cell / % / chord labels" render path to keep in sync. */
export function BarContent({ bar }: { bar: Bar }) {
  const { colors } = useAppTheme();
  if (bar.content.kind === 'repeat') {
    return (
      <Text style={{ fontFamily: 'Petaluma', fontSize: REPEAT_SIZE, color: colors.muted }}>
        {GLYPH_REPEAT_BAR}
      </Text>
    );
  }
  const { slots } = bar.content;
  if (slots.length === 0) return null;
  return (
    <FitChordRow>
      {slots.map((slot, i) => (
        <ChordLabel key={i} slot={slot} />
      ))}
    </FitChordRow>
  );
}

/** Keeps a bar's chords on one line no matter how many there are: measures its own natural
    (unscaled) width against the available width and, only once it doesn't fit, horizontally
    compresses via `transform: [{ scaleX }]` (visual-only, same as web's CSS `scaleX` — the text's
    height is untouched). Orthogonal to `PageFit` above (which scales the *whole chart*) — this
    handles one bar with more chords than its fixed `COL_WIDTH` comfortably holds at natural size.
    The `alignItems: 'center'` + unconstrained-width-child technique is what lets the inner `View`
    report its true intrinsic width via `onLayout` even though its parent is narrower — the native
    equivalent of web's `overflow-hidden` + absolutely-positioned content trick. */
function FitChordRow({ children }: { children: React.ReactNode }) {
  const [availW, setAvailW] = useState(0);
  const [natW, setNatW] = useState(0);
  const scale = availW > 0 && natW > 0 ? Math.min(1, availW / natW) : 1;

  return (
    <View
      style={{ width: '100%', overflow: 'hidden', alignItems: 'center' }}
      onLayout={(e) => setAvailW(e.nativeEvent.layout.width)}
    >
      <View
        onLayout={(e) => setNatW(e.nativeEvent.layout.width)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          transform: scale < 1 ? [{ scaleX: scale }] : undefined,
        }}
      >
        {children}
      </View>
    </View>
  );
}

function ChordLabel({ slot }: { slot: ChordSlot }) {
  const { colors } = useAppTheme();
  if (slot.kind === 'nc') {
    return (
      <Text style={{ fontFamily: 'PetalumaScript', fontSize: QUALITY_SIZE, fontWeight: '500', color: colors.muted }}>
        N.C.
      </Text>
    );
  }
  if (slot.kind === 'slash') {
    return (
      <Text style={{ fontFamily: 'PetalumaScript', fontSize: QUALITY_SIZE, color: colors.muted }}>/</Text>
    );
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
      <Text style={{ fontFamily: 'PetalumaScript', fontSize: ROOT_SIZE, fontWeight: '500', color: colors.foreground }}>
        {slot.letter}
        {slot.accidental ? (
          <Text style={{ fontSize: ROOT_ACCIDENTAL_SIZE }}>{ACCIDENTAL_GLYPH[slot.accidental]}</Text>
        ) : null}
      </Text>
      {slot.quality ? (
        <View style={{ marginLeft: 4 }}>
          <ChordQualityText
            quality={slot.quality}
            style={{ fontSize: QUALITY_SIZE, fontWeight: '500', color: colors.foreground }}
          />
        </View>
      ) : null}
      {slot.bass ? (
        <Text style={{ marginLeft: 6, fontSize: BASS_SIZE, fontFamily: 'PetalumaScript', color: colors.muted }}>
          /{slot.bass.letter}
          {slot.bass.accidental ? ACCIDENTAL_GLYPH[slot.bass.accidental] : ''}
        </Text>
      ) : null}
    </View>
  );
}
