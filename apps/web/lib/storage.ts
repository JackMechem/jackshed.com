import { DEFAULT_TIME_SIGNATURE, Tune } from "./types";

const STORAGE_KEY = "jam-practice-tunes";

export function loadTunes(): Tune[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((t: Tune) => ({
      ...t,
      timeSignature: t.timeSignature || DEFAULT_TIME_SIGNATURE,
      notes: t.notes || "",
    }));
  } catch {
    return [];
  }
}

export function saveTunes(tunes: Tune[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(tunes));
}
