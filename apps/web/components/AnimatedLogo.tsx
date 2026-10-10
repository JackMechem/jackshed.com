"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import Logo from "@/components/Logo";
import { strikeSticks } from "@/lib/stickStrike";

/** The sidebar's logo: the sticks strike every time the page changes, in time with the page
    transition (`AppShell`). */
export default function AnimatedLogo({ height }: { height: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    strikeSticks(ref.current);
  }, [pathname]);
  return (
    <span ref={ref} className="inline-flex">
      <Logo height={height} />
    </span>
  );
}
