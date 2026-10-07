"use client";

const DOT_COUNT = 4;

/**
 * A small "marching dots" loading indicator, inspired by the metronome's own beat-circle display
 * (`components/BeatIndicator.tsx` — a row of circles, one lit up at a time as the beat moves
 * through them) but driven by a looping CSS animation instead of real beat timing, since this has
 * to run wherever something's loading with no actual tempo to follow. Pure CSS (`@keyframes
 * loading-dot` in `app/globals.css`, staggered per dot via `animation-delay`) rather than a JS
 * interval — cheaper, and it's already animating the instant it mounts, no first-frame delay.
 *
 * The one shared loading indicator for "something's loading" or "waiting on the server" anywhere
 * in the app — reach for this instead of a bare "Loading…" string or a one-off spinner.
 */
export default function LoadingSpinner({
  label = "Loading",
  showLabel = false,
  size = "md",
  inline,
}: {
  /** Accessible name (via `role="status"`) when `showLabel` is off — the dots themselves are
      decorative either way. */
  label?: string;
  /** Also renders `label` as visible text next to the dots (e.g. "Loading project…"), for a spot
      specific enough that a sighted user benefits from knowing what's loading, not just that
      something is. When on, the visible text itself is what a screen reader picks up (normal
      content inside the `role="status"` region), so `aria-label` is left off rather than doubling
      up on it. */
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  /** Renders inline (`inline-flex`) instead of the default `flex`, for sitting mid-sentence next
      to text rather than as its own block. */
  inline?: boolean;
}) {
  const dim = size === "sm" ? "h-1.5 w-1.5" : size === "lg" ? "h-3 w-3" : "h-2 w-2";
  const gap = size === "sm" ? "gap-1" : "gap-1.5";
  const textSize = size === "lg" ? "text-base" : "text-sm";

  return (
    <div
      role="status"
      aria-label={showLabel ? undefined : label}
      className={`${inline ? "inline-flex" : "flex"} items-center ${showLabel ? "gap-2" : gap}`}
    >
      <div className={`flex items-center ${gap}`}>
        {Array.from({ length: DOT_COUNT }, (_, i) => (
          <span
            key={i}
            aria-hidden
            className={`${dim} shrink-0 animate-loading-dot rounded-full bg-accent`}
            style={{ animationDelay: `${(i / DOT_COUNT) * 1}s` }}
          />
        ))}
      </div>
      {showLabel && <span className={`${textSize} text-muted`}>{label}</span>}
    </div>
  );
}
