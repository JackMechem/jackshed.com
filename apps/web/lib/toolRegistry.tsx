"use client";

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import Wordmark from "@/components/Wordmark";
import { NAV_LINKS } from "@/components/tools";

/** Same animated wordmark `app/loading.tsx` shows for a normal page navigation — kept narrower
    (`max-w-full` so it never forces a scrollbar in a genuinely narrow pane) since a tiling pane
    can be much slimmer than a full page. */
function PaneLoading() {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <Wordmark
        size="lg"
        animate
        className="h-12 w-48 max-w-full justify-center"
        textClassName="text-xl sm:text-2xl"
      />
    </div>
  );
}

/** href -> that tool's own component, lazily imported. A hand-written mapping, not derived from
    `NAV_LINKS` automatically — `next/dynamic`'s `import()` needs a static, literal path for
    webpack/Next's bundler to code-split correctly, so it can't be built from a variable the way
    `NAV_LINKS` itself is read generically elsewhere. This is what lets `TilingLayout` mount any
    tool in any pane directly (bypassing the Next.js router entirely for everything but the one
    pane whose href happens to match the current URL), instead of needing every pane to be a real,
    separately-routed page. */
export const TOOL_COMPONENTS: Record<string, ComponentType> = {
  "/": dynamic(() => import("@/components/Home"), { loading: PaneLoading }),
  "/jam-practice": dynamic(() => import("@/components/JamPractice"), { loading: PaneLoading }),
  "/note-trainer": dynamic(() => import("@/components/NoteTrainer"), { loading: PaneLoading }),
  "/scale-trainer": dynamic(() => import("@/components/ScaleTrainer"), { loading: PaneLoading }),
  "/interval-trainer": dynamic(() => import("@/components/IntervalTrainer"), { loading: PaneLoading }),
  "/guess-the-interval": dynamic(() => import("@/components/GuessTheInterval"), { loading: PaneLoading }),
  "/guess-the-chord": dynamic(() => import("@/components/GuessTheChord"), { loading: PaneLoading }),
  "/practice-timer": dynamic(() => import("@/components/PracticeTimer"), { loading: PaneLoading }),
  "/metronome": dynamic(() => import("@/components/Metronome"), { loading: PaneLoading }),
  "/random-metric-modulation": dynamic(() => import("@/components/RandomMetricModulation"), {
    loading: PaneLoading,
  }),
  "/tempo-trainer": dynamic(() => import("@/components/TempoTrainer"), { loading: PaneLoading }),
  "/tuner": dynamic(() => import("@/components/Tuner"), { loading: PaneLoading }),
  "/slow-downer": dynamic(() => import("@/components/SlowDowner"), { loading: PaneLoading }),
  "/chord-charts": dynamic(() => import("@/components/ChordCharts"), { loading: PaneLoading }),
  "/recorder": dynamic(() => import("@/components/Recorder"), { loading: PaneLoading }),
  "/random-sticking-warmup": dynamic(() => import("@/components/StickControl"), {
    loading: PaneLoading,
  }),
  "/community": dynamic(() => import("@/components/Community"), { loading: PaneLoading }),
  "/account": dynamic(() => import("@/components/AccountPage"), { loading: PaneLoading }),
  // "/privacy", "/terms", and "/credits" aren't here — unlike every page above, those three don't
  // have a separate importable component at all; their content is written directly inline in
  // their own `app/*/page.tsx` file (`app/privacy/page.tsx` etc.), so there's nothing to
  // `dynamic(() => import(...))` without first pulling that content out into its own component, a
  // larger refactor this feature doesn't need for three static prose pages that are unlikely to
  // be tiled next to a practice tool anyway. Navigating to one of them while tiling is active still
  // falls back to the pane's own "this tool isn't available anymore" message.
};

/** Every page `TilingLayout` can actually show in a pane — `NAV_LINKS` plus the handful of real
    pages (home, account) that aren't sidebar nav items at all. Deliberately *not* used to build
    the `/` command palette's own search results (that's still `NAV_LINKS` alone, via
    `filterLinks`) — being renderable in a pane and being something you'd *search for* are
    different questions; Account isn't globally searchable anywhere else in this app either, and
    this doesn't change that. */
export const TILEABLE_LINKS = NAV_LINKS.filter((link) => link.href in TOOL_COMPONENTS);
