"use client";

import { useEffect, useRef } from "react";

const RING_RADIUS = 46;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/** A ring that drains as a running timer counts down. Shared by the drill-style trainers. */
export default function CountdownRing({
  active,
  timerRef,
}: {
  active: boolean;
  timerRef: React.RefObject<{ startedAt: number; durationMs: number }>;
  // (useRef always returns a non-null current here, so RefObject is fine as the prop type)
}) {
  const circleRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const tick = () => {
      const { startedAt, durationMs } = timerRef.current;
      const fraction = Math.min(
        1,
        Math.max(0, (performance.now() - startedAt) / durationMs),
      );
      circleRef.current?.style.setProperty(
        "stroke-dashoffset",
        String(RING_CIRCUMFERENCE * fraction),
      );
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, timerRef]);

  if (!active) return null;

  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      className="pointer-events-none absolute inset-0 h-full w-full -rotate-90"
    >
      <circle
        cx="50"
        cy="50"
        r={RING_RADIUS}
        fill="none"
        strokeWidth="4"
        className="stroke-surface-hover"
      />
      <circle
        ref={circleRef}
        cx="50"
        cy="50"
        r={RING_RADIUS}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        className="stroke-accent"
        style={{
          strokeDasharray: RING_CIRCUMFERENCE,
          strokeDashoffset: 0,
          transition: "stroke-dashoffset 0.1s linear",
        }}
      />
    </svg>
  );
}
