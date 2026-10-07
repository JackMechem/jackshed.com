import { Key, Tempo, Tune } from "./types";

/** A fully-resolved snapshot of a linked chord chart — the same shape `IRealSong` already has
    (`./iRealPro`, not imported directly here to avoid a circular/heavy dependency for what's
    otherwise a tiny file), deliberately duplicated rather than referenced so this file stays
    decoupled from the chord-chart parser. Embedding the *whole* chart (not just its id) is what
    lets a public-profile visitor — who doesn't own the tune owner's private chord-chart library
    and never could — still see and read the actual chart, the same "snapshot, not a live
    cross-user reference" rule this app already applies to Community chord-chart/tune posts. */
export type PublicLinkedChart = {
  title: string;
  composer: string;
  style: string;
  key: string;
  timeSignature: { top: number; bottom: number };
  bars: unknown[];
};

export type PublicTune = {
  id: string;
  name: string;
  tempos: Tempo[];
  keys: Key[];
  timeSignature: string;
  /** Set only by `toPublicTune` below, as a *raw, unresolved* id — a signal to whichever Convex
      function receives this (`communityTunes.create`) that it still needs to look the chart up
      (scoped to the *poster's own* `chordChartSongs`, server-side) and replace this with a real
      `linkedChart` snapshot before anything is stored or returned publicly. Never present on a
      `PublicTune` that's actually left a Convex function — `getPublicByUsername` and
      `communityTunes.create` both strip it in favor of `linkedChart`, so no raw, only-meaningful-
      to-the-owner id ever reaches a public response. */
  chordChartId?: string;
  /** The resolved chart, if this tune has one — always either fully present or entirely absent,
      never a dangling reference a viewer can't do anything with. */
  linkedChart?: PublicLinkedChart;
};

/** Strips a tune down to the same shape a public profile (or a Community tune post — see
    `convex/communityTunes.ts`) exposes: name, tempos, keys, time signature. Never `notes`, which
    could hold private practice notes — the same rule `getPublicByUsername` applies when resolving
    an owner's tune lists live, just run here at the moment of posting instead. Passes a linked
    chart's id through *unresolved* (see `PublicTune.chordChartId`'s own comment) — this function
    has no database access to resolve it into a real snapshot itself; the calling Convex mutation
    does that server-side. */
export function toPublicTune(tune: Tune): PublicTune {
  return {
    id: tune.id,
    name: tune.name,
    tempos: tune.tempos,
    keys: tune.keys,
    timeSignature: tune.timeSignature,
    ...(tune.chordChartId ? { chordChartId: tune.chordChartId } : {}),
  };
}

function isTempo(value: unknown): value is Tempo {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).id === "string" &&
    typeof (value as Record<string, unknown>).value === "number" &&
    typeof (value as Record<string, unknown>).enabled === "boolean"
  );
}

function isKey(value: unknown): value is Key {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).id === "string" &&
    typeof (value as Record<string, unknown>).value === "string" &&
    typeof (value as Record<string, unknown>).enabled === "boolean"
  );
}

/** Parses a raw `syncedSettings` tune-list JSON blob (`lib/useSyncedTunes.ts`'s/
    `lib/useTunesToLearn.ts`'s stored shape — `Tune[]` from `lib/types.ts`, JSON-stringified whole)
    into every tune it contains, in full — name, tempos, keys, and time signature — except
    `notes`, which could hold private practice notes and is never exposed to a public profile's
    viewers. Unlike the old `resolveKnownTuneNames` this replaced, there's no id filter: a public
    profile shows its owner's *entire* tune list rather than a hand-picked subset, per an explicit
    request to stop asking which tunes to show and just show all of them. Used by
    `convex/profiles.ts`'s `getPublicByUsername` — the one query in this app that reads across
    users' data by design (someone else's tune list, not the caller's own). Tolerant of missing/
    malformed input (an owner who's never saved any tunes, or genuinely corrupt stored JSON) —
    returns an empty list rather than throwing either way, and drops any individual tempo/key
    entry that doesn't look right rather than failing the whole tune over it. */
export function resolvePublicTunes(tunesJson: string | null | undefined): PublicTune[] {
  if (!tunesJson) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(tunesJson);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const results: PublicTune[] = [];
  for (const entry of parsed) {
    if (
      !entry ||
      typeof entry !== "object" ||
      typeof (entry as Record<string, unknown>).id !== "string" ||
      typeof (entry as Record<string, unknown>).name !== "string"
    ) {
      continue;
    }
    const e = entry as Record<string, unknown>;
    results.push({
      id: e.id as string,
      name: e.name as string,
      tempos: Array.isArray(e.tempos) ? e.tempos.filter(isTempo) : [],
      keys: Array.isArray(e.keys) ? e.keys.filter(isKey) : [],
      timeSignature: typeof e.timeSignature === "string" ? e.timeSignature : "4/4",
      // Passed through *unresolved*, same reasoning as `toPublicTune`'s own comment — this
      // function has no database access either. `getPublicByUsername` resolves it into a real
      // `linkedChart` snapshot (or drops it) right after calling this.
      ...(typeof e.chordChartId === "string" ? { chordChartId: e.chordChartId } : {}),
    });
  }
  return results;
}
