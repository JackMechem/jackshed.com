import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useAppTheme } from '@/theme/ThemeProvider';

const RING_SIZE = 120;
const RING_RADIUS = 52;
const RING_STROKE = 6;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
/** Re-renders on a quarter-second interval, not a real 60fps loop — same tradeoff
    `PracticeTimerRing.tsx` already documents: `react-native-svg`'s `Circle` only repaints through
    a normal prop change (no direct-DOM-mutation escape hatch the web version's own ref-based
    `style.strokeDashoffset` write has), and a countdown ring doesn't need 60fps precision to read
    as smooth. */
const TICK_MS = 250;

/**
 * The native sibling of `apps/web/components/CountdownRing.tsx` — a ring that drains as a running
 * timer counts down, shared by every drill-style trainer (Note/Scale/Interval Trainer, Guess the
 * Interval/Chord). Takes the same `{startedAt, durationMs}` shape web's own version keys off of,
 * just read via `Date.now()` instead of `performance.now()` (matching every other timer on this
 * app's native side, not a precision downgrade worth caring about at a 250ms tick). Renders
 * `children` centered inside the ring, so callers can stack a readout (a note name, a countdown
 * label) directly inside it the same way the web version's own absolutely-positioned ring does.
 */
export function CountdownRing({
  active,
  startedAt,
  durationMs,
  danger,
  children,
}: {
  active: boolean;
  startedAt: number;
  durationMs: number;
  /** Paints the ring in the danger color instead of accent — e.g. for a final-seconds warning. */
  danger?: boolean;
  children?: React.ReactNode;
}) {
  const { colors } = useAppTheme();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    // `Date.now()` is only ever read here, inside the effect — never during render, the same
    // purity rule `PracticeTimerRing.tsx` already documents — the render body below only reads
    // the `elapsed` state this sets.
    if (!active) return;
    function tick() {
      setElapsed(Date.now() - startedAt);
    }
    tick();
    const id = setInterval(tick, TICK_MS);
    return () => clearInterval(id);
  }, [active, startedAt]);

  const fraction = active && durationMs > 0 ? Math.min(1, Math.max(0, elapsed / durationMs)) : 0;
  const dashOffset = RING_CIRCUMFERENCE * fraction;

  return (
    <View style={{ width: RING_SIZE, height: RING_SIZE }} className="items-center justify-center">
      {active ? (
        <Svg
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
        >
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke={colors['surface-hover']}
            strokeWidth={RING_STROKE}
          />
          <Circle
            cx={RING_SIZE / 2}
            cy={RING_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            stroke={danger ? colors.danger : colors.accent}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
          />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}
