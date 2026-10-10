/** The logo's drum hit: the two sticks swing apart and strike back into the x (with a little
    overshoot), and the off-beat dashes pop out on the hit. Works on anything rendering
    `components/Logo.tsx`'s sticks (`data-stick`, `data-ticks`). Web Animations, so nothing
    re-renders; a no-op under reduced motion. */
export function strikeSticks(root: Element | null, { duration = 520, spread = 34 } = {}) {
  if (!root || prefersReducedMotion()) return;
  const ease = "cubic-bezier(0.3, 0.7, 0.2, 1)";
  for (const [sel, dir] of [["[data-stick='a']", -1], ["[data-stick='b']", 1]] as const) {
    root.querySelector(sel)?.animate(
      [
        { transform: `rotate(${dir * spread}deg)` },
        { transform: `rotate(${-dir * 5}deg)`, offset: 0.55 },
        { transform: "rotate(0deg)" },
      ],
      { duration, easing: ease },
    );
  }
  root.querySelector("[data-ticks]")?.animate(
    [{ transform: "scaleX(0)", opacity: 0 }, { transform: "scaleX(1.5)", opacity: 1, offset: 0.4 }, { transform: "scaleX(1)", opacity: 1 }],
    { duration: duration * 0.6, delay: duration * 0.45, easing: ease, fill: "backwards" },
  );
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
