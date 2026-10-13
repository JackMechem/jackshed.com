import { api } from '@jam-practice/convex/_generated/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConvexAuth } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { useEffect, useRef, useSyncExternalStore } from 'react';

/**
 * The native sibling of `apps/web/lib/useSyncedSettings.ts` — same `[settings, update]` contract
 * as `useDeviceSettings.ts` (a drop-in replacement for it, same "stable module-level defaults
 * object" rule), but synced to the signed-in account's `syncedSettings` Convex table when
 * reachable. Per a direct request ("the options for metronome shuld be pulled from the account...
 * along with all the other tools. i also want the tools to work if offline so if the account data
 * is not available resort to using whatever is stored on the device"), this is **not** a straight
 * port of the web hook — web has no offline story at all (signed in, it reads *only* the in-memory/
 * Convex cache, nothing persists locally); this one always keeps `AsyncStorage` as a real local
 * cache, signed in or not, specifically so a cold app launch with no network still has something
 * to show immediately, and an edit made offline isn't lost.
 *
 * Precedence, per `key`, across the lifetime of one signed-in session (reset on sign-out, see
 * below):
 * 1. `AsyncStorage`'s own stored value, applied the moment it loads (fast, no network needed) —
 *    this alone is enough for a fully offline cold start.
 * 2. The account's own synced value, applied **once**, the first time a real (non-`"skip"`) query
 *    result arrives — this is allowed to override #1 (a signed-in device's local cache might be
 *    stale relative to the account), but only up until #3 happens.
 * 3. A real local edit (`update()`), which always wins from that point on and blocks #2 from ever
 *    overriding it later in this same session — the exact same "last touch wins, no merge" rule
 *    `apps/web/lib/syncedStore.ts` already documents, just extended with a local-storage read
 *    ahead of the server one instead of starting every session from nothing.
 *
 * A module-level cache (keyed by settings `key`, shared across every component reading the same
 * key — same shape as web's `syncedStore.ts`) is what makes a rapid burst of edits collapse into
 * one debounced Convex write instead of one per keystroke, and what keeps two call sites reading
 * the same key from fighting over which one's stale closure is "current."
 */

const DEBOUNCE_MS = 600;

type Entry = {
  value: unknown;
  hasValue: boolean;
  /** A real local edit happened this signed-in session — blocks the one-time server seed below. */
  localEdited: boolean;
  /** The one-time "apply the server's value, if any" step has already run (or been skipped
      because signed out) for this session. */
  serverApplied: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  /** This device's AsyncStorage copy has been read (whether or not there was one). */
  localLoaded: boolean;
  listeners: Set<() => void>;
};

const entries = new Map<string, Entry>();

function getEntry(key: string): Entry {
  let entry = entries.get(key);
  if (!entry) {
    entry = {
      value: undefined,
      hasValue: false,
      localEdited: false,
      serverApplied: false,
      timer: null,
      localLoaded: false,
      listeners: new Set(),
    };
    entries.set(key, entry);
  }
  return entry;
}

/** The cache holds the *whole* stored object for a key, never one caller's filtered copy: several
    screens can read the same key with different defaults (Home and the profile read the shared
    ear-training progress; tools read their own full settings), and caching whichever caller's
    trimmed copy loaded first used to hand the others an object missing their fields — and then
    write that trimmed copy back, dropping fields this app (or the website, which shares these
    keys) doesn't know about. Each caller sees it through `viewOf`. */
function asRecord(parsed: unknown): Record<string, unknown> | null {
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
}

const views = new WeakMap<object, WeakMap<object, unknown>>();
/** `raw` filtered/defaulted for one caller's `defaults`, memoized on both identities so
    `useSyncExternalStore` gets the same reference until the stored value changes. */
function viewOf<T extends object>(raw: object, defaults: T): T {
  let byDefaults = views.get(raw);
  if (!byDefaults) {
    byDefaults = new WeakMap();
    views.set(raw, byDefaults);
  }
  let view = byDefaults.get(defaults) as T | undefined;
  if (!view) {
    view = mergeWithDefaults(raw, defaults);
    byDefaults.set(defaults, view);
  }
  return view;
}

function notify(key: string) {
  for (const listener of getEntry(key).listeners) listener();
}

/** Keeps only fields whose type matches the corresponding default field — same defensive shape as
    `useDeviceSettings.ts`'s own `mergeWithDefaults`, applied identically to a value loaded from
    `AsyncStorage` or one that arrived from the account. */
function mergeWithDefaults<T extends object>(parsed: unknown, defaults: T): T {
  if (typeof parsed !== 'object' || parsed === null) return defaults;
  const result = { ...defaults } as Record<string, unknown>;
  const defaultsRecord = defaults as Record<string, unknown>;
  for (const key of Object.keys(defaultsRecord)) {
    const value = (parsed as Record<string, unknown>)[key];
    if (value === undefined) continue;
    const defaultValue = defaultsRecord[key];
    if (Array.isArray(defaultValue)) {
      if (Array.isArray(value)) result[key] = value;
    } else if (typeof value === typeof defaultValue) {
      result[key] = value;
    }
  }
  return result as T;
}

export function useSyncedSettings<T extends object>(
  key: string,
  defaults: T,
): [T, (patch: Partial<T>) => void, boolean] {
  const { isAuthenticated } = useConvexAuth();
  const wasAuthenticatedRef = useRef(isAuthenticated);

  // `useSyncExternalStore`, not a `useState`+`forceRender`+listener-effect combo — this entry's
  // value lives in a plain module-level mutable (`entries`, outside React's own state mechanism
  // entirely), and the React Compiler's auto-memoization doesn't recognize a value read that way
  // as a reactive source: a derived value computed from this hook's own return (e.g. `useMemo`
  // over `settings`, or an implicitly-memoized expression under the compiler) can silently freeze
  // at its first-computed result even while `forceRender` keeps this *component* re-rendering
  // correctly. Found and fixed after a parallel port of `useChordChartsLibrary.ts` hit exactly
  // this symptom for real (a derived count staying stale after an import, traced to the identical
  // pattern) — `useSyncExternalStore` is the React-blessed primitive for "a value that lives
  // outside React and can change between renders," which the compiler does correctly track.
  const settings = useSyncExternalStore(
    (callback) => {
      const entry = getEntry(key);
      entry.listeners.add(callback);
      return () => {
        entry.listeners.delete(callback);
      };
    },
    () => (getEntry(key).hasValue ? viewOf(getEntry(key).value as object, defaults) : defaults),
  );

  // `ready`: this device's saved copy has been read, so `settings` is the real value rather than
  // `defaults` standing in for it — screens show a loading spinner until then instead of
  // flashing default settings that then jump to the saved ones. Deliberately *not* waiting on the
  // account's copy too: that never arrives offline, and AsyncStorage already mirrors it.
  const ready = useSyncExternalStore(
    (callback) => {
      const entry = getEntry(key);
      entry.listeners.add(callback);
      return () => {
        entry.listeners.delete(callback);
      };
    },
    () => getEntry(key).localLoaded || getEntry(key).hasValue,
  );

  // Load from AsyncStorage once per key — only applies if nothing (server or a local edit) has
  // already claimed the entry by the time it resolves.
  useEffect(() => {
    let cancelled = false;
    if (getEntry(key).localLoaded) return;
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (cancelled || !raw) return;
        const entry = getEntry(key);
        if (entry.hasValue) return;
        try {
          const parsed = asRecord(JSON.parse(raw));
          if (!parsed) return;
          entry.value = parsed;
          entry.hasValue = true;
          notify(key);
        } catch {
          // corrupt local data — leave the entry unset, defaults still show
        }
      })
      .catch(() => {
        // storage unavailable — the in-memory/server path still works this session
      })
      .finally(() => {
        const entry = getEntry(key);
        if (!entry.localLoaded) {
          entry.localLoaded = true;
          notify(key);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const remote = useQuery(api.syncedSettings.get, isAuthenticated ? { key } : 'skip');
  const setRemote = useMutation(api.syncedSettings.set);

  // The one-time "apply the account's own value" step, and the sign-out reset that lets a
  // *different* account signing in later re-seed fresh instead of quietly keeping whatever the
  // previous session cached.
  useEffect(() => {
    if (!isAuthenticated) {
      if (wasAuthenticatedRef.current) {
        const entry = getEntry(key);
        // A real edit made right before signing out should still reach the account rather than
        // being silently dropped with the timer that was carrying it.
        if (entry.timer) {
          clearTimeout(entry.timer);
          entry.timer = null;
          if (entry.hasValue) {
            setRemote({ key, value: JSON.stringify(entry.value) }).catch(() => {
              // offline at the exact moment of sign-out — nothing more to do, the account's own
              // row simply stays one edit behind until the next successful sync.
            });
          }
        }
        entry.localEdited = false;
        entry.serverApplied = false;
      }
      wasAuthenticatedRef.current = false;
      return;
    }
    wasAuthenticatedRef.current = true;

    if (remote === undefined) return; // still loading
    const entry = getEntry(key);
    if (entry.serverApplied) return;
    entry.serverApplied = true;
    if (!entry.localEdited && remote?.value) {
      try {
        const parsed = asRecord(JSON.parse(remote.value));
        if (parsed) {
          entry.value = parsed;
          entry.hasValue = true;
          notify(key);
          void AsyncStorage.setItem(key, remote.value);
        }
      } catch {
        // corrupt server data — keep whatever's currently showing
      }
    }
  }, [isAuthenticated, remote, key, setRemote]);

  function update(patch: Partial<T>) {
    const entry = getEntry(key);
    // Merged into the whole stored object, so fields other callers own are kept.
    const current = entry.hasValue ? (entry.value as Record<string, unknown>) : {};
    const next = { ...current, ...patch };
    entry.value = next;
    entry.hasValue = true;
    entry.localEdited = true;
    notify(key);
    void AsyncStorage.setItem(key, JSON.stringify(next));

    if (isAuthenticated) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.timer = setTimeout(() => {
        entry.timer = null;
        setRemote({ key, value: JSON.stringify(getEntry(key).value) }).catch(() => {
          // offline, or the account write otherwise failed — the local edit already landed in
          // AsyncStorage above, so nothing is lost; it'll sync next time a write succeeds.
        });
      }, DEBOUNCE_MS);
    }
  }

  return [settings, update, ready];
}
