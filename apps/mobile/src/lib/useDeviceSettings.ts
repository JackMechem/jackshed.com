import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The native analog of `apps/web/lib/usePersistedSettings.ts` — same `[settings, update]`
 * contract (always a stable module-level `defaults` object, `update` shallow-merges a partial
 * patch and persists the result), backed by `AsyncStorage` instead of `localStorage`. Renders
 * `defaults` immediately (AsyncStorage is always async, so there's no synchronous first read the
 * way `localStorage` allows) and swaps in the real stored value once it resolves — same "shows
 * defaults then arrives" shape the web hook already has for its own server-snapshot case, so a
 * call site never needs a separate loading state.
 *
 * Deliberately device-local only, not account-synced — this app doesn't yet have a generic
 * Convex-backed settings-sync mechanism the way `apps/web/lib/useSyncedSettings.ts` does (Convex
 * itself was only wired up this same session). A real, acknowledged gap versus web's own
 * cross-device sync, not an oversight — extending sync to every tool's settings is a bigger,
 * separate task from getting one tool's settings persisted at all.
 */
export function useDeviceSettings<T extends object>(
  key: string,
  defaults: T,
): [T, (patch: Partial<T>) => void] {
  const [value, setValue] = useState<T>(defaults);
  const loadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed = JSON.parse(raw);
        setValue(mergeWithDefaults(parsed, defaults));
      })
      .catch(() => {
        // storage unavailable — stay on defaults
      })
      .finally(() => {
        loadedRef.current = true;
      });
    return () => {
      cancelled = true;
    };
    // `defaults` is required to be a stable module-level object, same rule as the web hook — not
    // a dependency, since a caller passing a fresh literal every render would otherwise re-run
    // this load loop on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const update = useCallback(
    (patch: Partial<T>) => {
      setValue((prev) => {
        const next = { ...prev, ...patch };
        AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {
          // storage unavailable — the in-memory value above still updates this session
        });
        return next;
      });
    },
    [key],
  );

  return [value, update];
}

/** Keeps only fields whose type matches the corresponding default field — the same defensive
    shape `apps/web/lib/usePersistedSettings.ts`'s own `mergeWithDefaults` uses, so a stale/corrupt/
    foreign stored value (an old settings shape, hand-edited storage, ...) can't break the UI. */
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
