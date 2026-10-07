import { Text, View } from 'react-native';

import { useAppTheme } from '@/theme/ThemeProvider';

// Same hand-picked bar-height arrays as `apps/web/components/Wordmark.tsx` — ported directly
// (not re-derived) so the two apps' logos read as the exact same shape, not a coincidentally
// similar one. Two separate arrays, not one scaled copy of the other — the much narrower sidebar
// lockup needs a different bar density than the hero does.
const WAVEFORM_LG = [
  18, 34, 14, 46, 24, 58, 20, 40, 64, 28, 50, 16, 60, 22, 44, 12, 36, 66, 20, 52, 26, 42, 14, 38,
  56, 18, 48, 24, 32, 16,
];
const WAVEFORM_SM = [30, 60, 20, 85, 45, 100, 35, 70, 50, 90, 25, 65, 40, 78, 32, 58];

/**
 * The "sheddex" wordmark with waveform bars running behind it — a native port of
 * `apps/web/components/Wordmark.tsx`'s own effect (same two bar arrays, same idea: the bars sit
 * in an absolutely-positioned row behind the text, sized as a percentage of a fixed-height
 * container the caller provides). The text itself is `accent`-colored, not `foreground` — a real
 * difference from this app's own first pass, caught directly against a screenshot.
 *
 * Bar opacity/color use `colors.accent` + a manual `opacity` style rather than NativeWind's own
 * `bg-accent/20` opacity-modifier syntax — this app's theme colors are plain hex strings, and
 * color here is applied via inline `style` rather than a `className` color token at all (see
 * `ThemeProvider.tsx`'s own doc comment for why); a plain `opacity` style on a solid-colored bar
 * gets the identical visual result a `/20` modifier would.
 *
 * Only ever used for the literal "sheddex" wordmark (the Home hero) — a brief detour applied this
 * same bars-behind-text treatment to every page's own title too (`HeaderTitle.tsx`), but was
 * reverted per a direct request ("forget about the bars behind the page titles, remove it") once
 * it became clear a fixed hand-picked bar array doesn't generalize to arbitrary-length title text
 * (a short title left gaps on both sides; a long one either overflowed or, once bars were made
 * `flex: 1` to compensate, ballooned into a handful of chunky blocks instead of thin bars).
 * `HeaderTitle.tsx` now renders plain styled text instead, with no dependency on this component.
 */
export function Wordmark({
  size = 'sm',
  height,
  textClassName = 'text-lg',
}: {
  /** "lg" (the home hero) and "sm" (the sidebar header) each use their own hand-tuned bar
      array/density — not just a scaled-down version of the other. */
  size?: 'sm' | 'lg';
  /** The container's fixed pixel height the bars are sized against (a percentage of this) — the
      caller's own call, since "lg" sits in a big hero and "sm" sits in a compact header. */
  height: number;
  textClassName?: string;
}) {
  const { colors } = useAppTheme();
  const bars = size === 'lg' ? WAVEFORM_LG : WAVEFORM_SM;
  const gap = size === 'lg' ? 3 : 2;
  const barWidth = size === 'lg' ? 4 : 2;

  return (
    <View style={{ height }} className="items-center justify-center">
      <View
        className="absolute inset-0 flex-row items-center justify-center"
        style={{ gap, pointerEvents: 'none' }}
      >
        {bars.map((h, i) => (
          <View
            key={i}
            style={{
              width: barWidth,
              height: `${h}%`,
              backgroundColor: colors.accent,
              opacity: 0.2,
              borderRadius: barWidth,
            }}
          />
        ))}
      </View>
      <Text className={`font-bold font-inter-bold tracking-tight ${textClassName}`} style={{ color: colors.accent }}>
        sheddex
      </Text>
    </View>
  );
}
