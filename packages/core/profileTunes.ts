import { Key, Tempo, Tune } from "./types";

export type PublicTune = {
  id: string;
  name: string;
  tempos: Tempo[];
  keys: Key[];
  timeSignature: string;
};

/** Strips a tune down to the same shape a public profile (or a Community tune post — see
    `convex/communityTunes.ts`) exposes: name, tempos, keys, time signature. Never `notes`, which
    could hold private practice notes — the same rule `getPublicByUsername` applies when resolving
    an owner's tune lists live, just run here at the moment of posting instead. */
export function toPublicTune(tune: Tune): PublicTune {
  return {
    id: tune.id,
    name: tune.name,
    tempos: tune.tempos,
    keys: tune.keys,
    timeSignature: tune.timeSignature,
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
    });
  }
  return results;
}
