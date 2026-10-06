"use client";

import { useHintsVisible } from "@/lib/hints";

/**
 * An option/setting description, only rendered while the enclosing CollapsiblePanel's or
 * OptionsCard's "?" toggle is on. Use this directly for description text that isn't already
 * routed through SwitchRow's or AdvancedSlider's own `hint` prop (which render one of these
 * internally).
 */
export default function Hint({ children }: { children: React.ReactNode }) {
  if (!useHintsVisible()) return null;
  return <p className="text-xs text-muted">{children}</p>;
}
