import { useCallback, useSyncExternalStore } from "react";

/** One key's cache holds the *whole* stored object (`raw`), not any one caller's filtered view of
    it: several hooks can read the same key with different defaults (the dashboard reads just the
    ear trainers' stats out of their full settings objects), and caching whichever caller's trimmed
    copy loaded first used to hand every other caller an object missing its own fields — and then
    write that trimmed copy back, dropping the rest. Each caller gets its own view via `viewOf`. */
type Store = {
  raw: Record<string, unknown> | null;
  listeners: Set<() => void>;
};

const stores = new Map<string, Store>();

function getStore(key: string): Store {
  let store = stores.get(key);
  if (!store) {
    store = { raw: null, listeners: new Set() };
    stores.set(key, store);
  }
  return store;
}

/** `raw` filtered/defaulted for one caller's `defaults`, memoized on both object identities so
    `useSyncExternalStore` sees the same reference until the stored value actually changes. */
const views = new WeakMap<object, WeakMap<object, unknown>>();
export function viewOf<T extends object>(raw: object, defaults: T): T {
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

/** Keep only fields of `parsed` whose type matches `defaults`, so bad/stale/foreign data can't
    break the UI — shared by the localStorage path below and `lib/useSyncedSettings.ts`'s
    Convex-backed path, so a value read from an account gets exactly the same defensive treatment
    as one read from this device's own localStorage (same reasoning as "an old saved session
    missing a newer field still shows something sane" elsewhere in this codebase). */
export function mergeWithDefaults<T extends object>(parsed: unknown, defaults: T): T {
  if (!parsed || typeof parsed !== "object") return defaults;
  const merged = { ...defaults } as Record<string, unknown>;
  for (const [field, fallback] of Object.entries(defaults)) {
    const stored = (parsed as Record<string, unknown>)[field];
    const sameType = Array.isArray(fallback)
      ? Array.isArray(stored)
      : typeof stored === typeof fallback;
    if (stored !== undefined && sameType) merged[field] = stored;
  }
  return merged as T;
}

/** The whole stored object for `key` (or `{}`), unfiltered — see `Store`. */
function readRaw(key: string): Record<string, unknown> {
  try {
    const text = window.localStorage.getItem(key);
    const parsed: unknown = text ? JSON.parse(text) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function rawOf(key: string): Record<string, unknown> {
  const store = getStore(key);
  if (!store.raw) store.raw = readRaw(key);
  return store.raw;
}

/** Keep only stored fields whose type matches the default, so bad data can't break the UI. */
export function snapshotOf<T extends object>(key: string, defaults: T): T {
  return viewOf(rawOf(key), defaults);
}

/** Merges `patch` into the whole stored object, so fields other callers of the same key own
    (and anything this caller's `defaults` doesn't know about) are kept. */
export function writeSettings<T extends object>(key: string, _defaults: T, patch: Partial<T>) {
  const store = getStore(key);
  store.raw = { ...rawOf(key), ...patch };
  try {
    window.localStorage.setItem(key, JSON.stringify(store.raw));
  } catch {
    // storage unavailable
  }
  for (const listener of store.listeners) listener();
}

export function subscribeTo(key: string, listener: () => void) {
  const store = getStore(key);
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

/**
 * Settings object persisted to localStorage. `defaults` must be a stable
 * (module-level) object. Renders defaults on the server and first paint,
 * then the saved values.
 */
export function usePersistedSettings<T extends object>(
  key: string,
  defaults: T
): [T, (patch: Partial<T>) => void] {
  const subscribe = useCallback((listener: () => void) => subscribeTo(key, listener), [key]);
  const getSnapshot = useCallback(() => snapshotOf(key, defaults), [key, defaults]);
  const getServerSnapshot = useCallback(() => defaults, [defaults]);

  const settings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const update = useCallback(
    (patch: Partial<T>) => writeSettings(key, defaults, patch),
    [key, defaults]
  );

  return [settings, update];
}
