import { memo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import type { DrawItem } from '@/lib/notation/vexflowNative';
import type { NotationRow } from '@/lib/notation/stickNotation';

/** Gap between wrapped rows — web's `gap-3`. */
export const NOTATION_ROW_GAP = 12;

/**
 * The phone's `StickControlStave`: the pattern engraved by VexFlow exactly as on the website (see
 * `lib/notation/vexflowNative.ts` for how VexFlow runs here), drawn with `react-native-svg`. Rows
 * arrive already justified to one width and cropped to their drawn content
 * (`renderPatternRows`); each is scaled to exactly `width` px, which the screen picks so both
 * staves fit without scrolling. The currently playing
 * bar gets web's highlight — a faint accent fill with a 2px accent ring — as a plain overlay, so a
 * playback tick never redraws the notation itself.
 */
export function StickNotation({
  rows,
  width,
  activeBarIndex,
  ink,
  accent,
}: {
  rows: NotationRow[];
  width: number;
  activeBarIndex: number | null;
  /** Notation colour (web: foreground mixed 20% toward black). */
  ink: string;
  accent: string;
}) {
  return (
    <View style={{ gap: NOTATION_ROW_GAP, alignItems: 'center' }}>
      {rows.map((row, i) => {
        const scale = width / row.width;
        return (
          <View key={i} style={{ width, height: row.height * scale }}>
            <RowSvg row={row} scale={scale} ink={ink} />
            {row.barRects.map((rect, b) =>
              activeBarIndex === row.firstBar + b ? (
                <View
                  key={b}
                  style={{
                    pointerEvents: 'none',
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: rect.x * scale,
                    width: rect.width * scale,
                    borderRadius: 6,
                    borderWidth: 2,
                    borderColor: accent,
                    backgroundColor: `${accent}1A`,
                  }}
                />
              ) : null,
            )}
          </View>
        );
      })}
    </View>
  );
}

function resolve(paint: string, ink: string) {
  return paint === 'ink' ? ink : paint;
}

const RowSvg = memo(function RowSvg({ row, scale, ink }: { row: NotationRow; scale: number; ink: string }) {
  return (
    <Svg
      width={row.width * scale}
      height={row.height * scale}
      viewBox={`0 ${row.top} ${row.width} ${row.height}`}
    >
      {row.items.map((item, i) => (
        <Item key={i} item={item} ink={ink} />
      ))}
    </Svg>
  );
});

function Item({ item, ink }: { item: DrawItem; ink: string }) {
  const fill = resolve(item.fill, ink);
  const stroke = resolve(item.stroke, ink);
  if (item.kind === 'rect') {
    return (
      <Rect
        x={item.x}
        y={item.y}
        width={item.width}
        height={item.height}
        fill={fill}
        stroke={stroke}
        strokeWidth={stroke === 'none' ? 0 : item.strokeWidth}
      />
    );
  }
  return (
    <Path
      d={item.d}
      fill={fill}
      stroke={stroke}
      strokeWidth={stroke === 'none' ? 0 : item.strokeWidth}
      strokeDasharray={item.strokeDasharray}
      strokeLinecap={item.strokeLinecap}
      transform={
        item.glyph ? `translate(${item.glyph.x}, ${item.glyph.y}) scale(${item.glyph.scale})` : undefined
      }
    />
  );
}
