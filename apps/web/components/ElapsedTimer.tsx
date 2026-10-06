"use client";

import { useEffect, useRef } from "react";
import { formatDuration } from "@/lib/trainerUtils";

/** A ticking "0:07.3" readout while a session runs. Writes straight to the DOM via rAF, like
    CountdownRing, so it doesn't force the whole page to re-render every frame. Shared by the
    drill-style trainers. */
export default function ElapsedTimer({
  active,
  startRef,
}: {
  active: boolean;
  startRef: React.RefObject<number | null>;
}) {
  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const tick = () => {
      const startedAt = startRef.current;
      if (startedAt !== null && spanRef.current) {
        spanRef.current.textContent = formatDuration(
          performance.now() - startedAt,
        );
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [active, startRef]);

  if (!active) return null;

  return <span className="tabular-nums" ref={spanRef} />;
}
