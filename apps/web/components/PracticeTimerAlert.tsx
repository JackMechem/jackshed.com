"use client";

import { useSyncExternalStore } from "react";
import { PlayIcon, StopIcon, StopwatchIcon } from "@/components/tools";
import {
  getServerSnapshot,
  getSnapshot,
  skip,
  stop,
  subscribe,
} from "@/lib/practiceTimerEngine";

/**
 * A full-screen "time's up" takeover, shown app-wide (mounted once in `app/layout.tsx`, alongside
 * `PracticeTimerWidget`) whenever the running Practice Timer session is `alarming` *and* its
 * `fullScreenAlert` setting is on — the whole point of that setting: interrupt whatever you're
 * doing elsewhere in the app, not just wherever you happen to already be looking.
 *
 * Deliberately not dismissible by clicking the backdrop or pressing Escape, unlike
 * `ConfirmDialog`'s own overlay convention — this is meant to be genuinely sticky, like a real
 * alarm clock, until you make an actual choice: Continue (dismiss the alarm and move on to the
 * next segment — the same thing `skip()` already does everywhere else) or Stop (end the session).
 * The repeating alarm sound itself is driven entirely by the engine
 * (`lib/practiceTimerEngine.ts`'s `startAlarmSound`) — this component only reflects state, it
 * doesn't own any audio of its own.
 */
export default function PracticeTimerAlert() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (!state || !state.alarming || !state.fullScreenAlert) return null;

  return (
    <div
      role="alertdialog"
      aria-label="Segment time is up"
      className="fixed inset-0 z-[200] flex flex-col items-center justify-center gap-6 bg-background/97 p-6 text-center backdrop-blur-sm"
    >
      <StopwatchIcon className="h-16 w-16 animate-pulse text-danger" />
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-semibold uppercase tracking-widest text-danger">
          Time&apos;s up
        </p>
        <h1 className="break-words text-3xl font-bold sm:text-5xl">{state.current.title}</h1>
        {state.next ? (
          <p className="text-lg text-muted">Next: {state.next.title}</p>
        ) : (
          <p className="text-lg text-muted">Last step of this session.</p>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={skip}
          autoFocus
          className="flex items-center gap-2 rounded-full bg-accent px-8 py-3 text-base font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
        >
          <PlayIcon className="h-5 w-5" /> Continue
        </button>
        <button
          type="button"
          onClick={stop}
          className="flex items-center gap-2 rounded-full bg-surface px-6 py-3 text-base font-medium text-danger transition-colors hover:bg-surface-hover"
        >
          <StopIcon className="h-4 w-4" /> Stop
        </button>
      </div>
    </div>
  );
}
