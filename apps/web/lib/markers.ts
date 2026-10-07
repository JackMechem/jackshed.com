export type Marker = { id: string; time: number; label: string; note: string };

const KEY = "jam-practice-markers";
const MAX_FILES = 100;

type Store = Record<string, Marker[]>;

function readStore(): Store {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Markers are remembered per file, identified by name and size. */
export function fileKeyOf(file: File): string {
  return `${file.name}|${file.size}`;
}

export function loadMarkers(fileKey: string): Marker[] {
  const list = readStore()[fileKey];
  if (!Array.isArray(list)) return [];
  return list
    .filter(
      (m) =>
        m && typeof m.id === "string" && typeof m.time === "number" && typeof m.label === "string",
    )
    .map((m) => ({ ...m, note: typeof m.note === "string" ? m.note : "" }));
}

export function saveMarkers(fileKey: string, markers: Marker[]): void {
  try {
    const store = readStore();
    delete store[fileKey];
    if (markers.length > 0) store[fileKey] = markers;
    const keys = Object.keys(store);
    // Drop the oldest entries if this ever grows large.
    for (const old of keys.slice(0, Math.max(0, keys.length - MAX_FILES))) delete store[old];
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // storage unavailable
  }
}
