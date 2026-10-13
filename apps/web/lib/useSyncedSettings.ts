import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import { usePersistedSettings, viewOf } from "./usePersistedSettings";
import {
  getSyncedValue,
  resetSynced,
  seedSynced,
  setSyncedValue,
  subscribeSynced,
} from "./syncedStore";

/**
 * Drop-in replacement for `usePersistedSettings(key, defaults)` — same signature, same
 * `[settings, update]` return shape, same "defaults must be a stable module-level object" rule —
 * but backed by the signed-in account instead of this device's localStorage whenever one's
 * signed in. Every tool's settings sync this way now: signed out, this is a pure passthrough to
 * the existing hook (zero behavior change, zero regression risk — it's the exact same code
 * underneath, and the Convex query is skipped entirely rather than subscribed-and-ignored, so a
 * signed-out visitor costs this tool nothing backend-side); signed in, it reads/writes through
 * `lib/syncedStore.ts`'s debounced in-memory cache instead, which itself talks to the
 * `syncedSettings` Convex table — see that file for why a plain "call the mutation on every
 * `update()`" first version both dropped rapid edits (a stale-closure race) and hammered the
 * backend with one write per keystroke/slider-tick. Local storage is simply not consulted at all
 * while signed in — no merge, no import prompt, the same rule Practice Timer's saved sessions
 * already established (`lib/usePracticeSessions.ts`).
 *
 * While signed in and no value has loaded/been edited yet, this returns `defaults` — the same
 * thing every tool already renders on the server and on first paint before localStorage loads, so
 * no call site needs to handle a new "loading" state to use this.
 */
export function useSyncedSettings<T extends object>(
  key: string,
  defaults: T,
): [T, (patch: Partial<T>) => void] {
  const { isAuthenticated } = useConvexAuth();
  const [localSettings, updateLocal] = usePersistedSettings(key, defaults);
  const remote = useQuery(api.syncedSettings.get, isAuthenticated ? { key } : "skip");
  const setRemote = useMutation(api.syncedSettings.set);

  // The cache holds the account's *whole* object for this key; each caller views it through its
  // own defaults (see `Store` in usePersistedSettings.ts for why — several hooks share a key).
  const raw = useSyncExternalStore(
    useCallback((listener) => subscribeSynced(key, listener), [key]),
    useCallback(() => getSyncedValue<Record<string, unknown> | null>(key, null), [key]),
    useCallback(() => null, []),
  );
  const synced = raw ? viewOf(raw, defaults) : defaults;

  useEffect(() => {
    if (!isAuthenticated) {
      resetSynced<Record<string, unknown>>(key, (value) => {
        setRemote({ key, value: JSON.stringify(value) });
      });
      return;
    }
    if (remote !== undefined) {
      seedSynced(key, remote?.value ? safeParse(remote.value) : {});
    }
  }, [isAuthenticated, remote, key, setRemote]);

  const update = useCallback(
    (patch: Partial<T>) => {
      if (isAuthenticated) {
        const next = { ...(getSyncedValue<Record<string, unknown> | null>(key, null) ?? {}), ...patch };
        setSyncedValue(key, next, (value) => {
          setRemote({ key, value: JSON.stringify(value) });
        });
        return;
      }
      updateLocal(patch);
    },
    [isAuthenticated, key, setRemote, updateLocal],
  );

  return [isAuthenticated ? synced : localSettings, update];
}

function safeParse(raw: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
