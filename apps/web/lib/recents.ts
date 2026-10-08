import { usePersistedSettings } from "./usePersistedSettings";

/** Recently opened chord charts and tunes, device-local (what you just played on this device) —
    the "Recently opened" rows on the Chord Charts and Tunes pages. */
const CHARTS_KEY = "jam-practice-chord-charts-recent";
const TUNES_KEY = "jam-practice-tunes-recent";
const DEFAULTS = { ids: [] as string[] };
const MAX = 10;

export function useRecentCharts() {
  const [{ ids }, update] = usePersistedSettings(CHARTS_KEY, DEFAULTS);
  return {
    ids,
    record: (id: string) => update({ ids: [id, ...ids.filter((x) => x !== id)].slice(0, MAX) }),
    forget: (id: string) => update({ ids: ids.filter((x) => x !== id) }),
  };
}

export function useRecentTunes() {
  const [{ ids }, update] = usePersistedSettings(TUNES_KEY, DEFAULTS);
  return {
    ids,
    record: (id: string) => update({ ids: [id, ...ids.filter((x) => x !== id)].slice(0, MAX) }),
    forget: (id: string) => update({ ids: ids.filter((x) => x !== id) }),
  };
}
