"use client";

import { useEffect, useState } from "react";

/** The same `lg` breakpoint `NAV_LINKS`' own `desktopOnly` flag and `CommandPalette.tsx`'s `/`
    shortcut already gate on. Defaults to `false` (not `true`) so there's never even a one-frame
    flash of desktop-only UI on a phone before this resolves — the opposite tradeoff would matter
    for something meant to be visible immediately, but nothing using this hook is. */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);
  return isDesktop;
}
