import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  snapshotOf,
  subscribeTo,
  usePersistedSettings,
  writeSettings,
} from "@/lib/usePersistedSettings";

export const PANEL_DEFAULTS = { open: true, showHints: false };

export function panelKey(id: string) {
  return `jam-practice-panel-${id}`;
}

/** Whether any of the given panels is open, plus a way to open or close them all at once. */
export function usePanelsToggle(ids: string[]) {
  const joined = ids.join(",");
  const keys = useMemo(() => joined.split(",").map(panelKey), [joined]);

  const subscribe = useCallback(
    (listener: () => void) => {
      const unsubscribers = keys.map((key) => subscribeTo(key, listener));
      return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
    },
    [keys],
  );
  const getSnapshot = useCallback(
    () => keys.some((key) => snapshotOf(key, PANEL_DEFAULTS).open),
    [keys],
  );
  const anyOpen = useSyncExternalStore(subscribe, getSnapshot, () => true);

  const setAll = useCallback(
    (open: boolean) => {
      for (const key of keys) writeSettings(key, PANEL_DEFAULTS, { open });
    },
    [keys],
  );

  return { anyOpen, setAll };
}

const OPTIONS_KEY = "jam-practice-options";
const OPTIONS_DEFAULTS = { hidden: false };

/** Whether the options column is hidden on the tool pages (one setting shared by all of them). */
export function useOptionsHidden(): [boolean, (hidden: boolean) => void] {
  const [{ hidden }, update] = usePersistedSettings(OPTIONS_KEY, OPTIONS_DEFAULTS);
  return [hidden, (next) => update({ hidden: next })];
}

const SIDE_PANEL_KEY = "jam-practice-side-panel";
const SIDE_PANEL_DEFAULTS = { hidden: false };

/** Same idea as `useOptionsHidden`, for the optional right-hand side panel. */
export function useSidePanelHidden(): [boolean, (hidden: boolean) => void] {
  const [{ hidden }, update] = usePersistedSettings(SIDE_PANEL_KEY, SIDE_PANEL_DEFAULTS);
  return [hidden, (next) => update({ hidden: next })];
}

const NAV_CATEGORIES_KEY = "jam-practice-nav-categories";
const NAV_CATEGORIES_DEFAULTS = { collapsed: {} as Record<string, boolean> };

/** Which of the sidebar's own category sections (`components/Sidebar.tsx`'s `NavItems`) are
    collapsed — a device-local display preference, same category as `useOptionsHidden` above, not
    real tool data. Absence from the record means expanded, so a category added later (or by
    someone on an older saved copy of this record) defaults open rather than needing a migration. */
export function useCollapsedCategories(): [Record<string, boolean>, (category: string, collapsed: boolean) => void] {
  const [{ collapsed }, update] = usePersistedSettings(NAV_CATEGORIES_KEY, NAV_CATEGORIES_DEFAULTS);
  return [
    collapsed,
    (category, value) => update({ collapsed: { ...collapsed, [category]: value } }),
  ];
}
