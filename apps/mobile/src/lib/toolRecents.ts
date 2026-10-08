import AsyncStorage from '@react-native-async-storage/async-storage';
import { NAV_LINKS_DATA, hrefToSlug } from '@jam-practice/core/navLinks';
import { usePathname } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';

/** The tools opened most recently on this device (their nav hrefs, newest first) — Home's
    "Jump back in" row. Device-local, like the chart/tune recents (`chordChartRecents.ts`). */
const KEY = 'jam-practice-tool-recents';
const MAX = 8;

let value: string[] = [];
let loaded = false;
const listeners = new Set<() => void>();

function set(next: string[]) {
  value = next;
  for (const l of listeners) l();
  AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function load() {
  if (loaded) return;
  loaded = true;
  AsyncStorage.getItem(KEY)
    .then((raw) => {
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) {
        set([...value, ...parsed.filter((x): x is string => typeof x === 'string' && !value.includes(x))].slice(0, MAX));
      }
    })
    .catch(() => {});
}

const SLUG_TO_HREF = new Map(NAV_LINKS_DATA.map((l) => [hrefToSlug(l.href), l.href]));

/** Mounted once (in `_layout.tsx`): notes every tool screen (`/tool/<slug>`) that's opened. */
export function useRecordToolVisits() {
  const pathname = usePathname();
  useEffect(() => {
    load();
    const m = /^\/tool\/([^/]+)$/.exec(pathname);
    const href = m ? SLUG_TO_HREF.get(m[1]) : undefined;
    if (href) set([href, ...value.filter((h) => h !== href)].slice(0, MAX));
  }, [pathname]);
}

/** Recently opened tools' hrefs, newest first. */
export function useRecentTools(): string[] {
  useEffect(load, []);
  return useSyncExternalStore(subscribe, () => value);
}
