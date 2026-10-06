import { Tune } from "./types";
import { loadTunes, saveTunes } from "./storage";

type Listener = () => void;

const EMPTY: Tune[] = [];
let snapshot: Tune[] = EMPTY;
let initialized = false;
const listeners = new Set<Listener>();

function ensureInitialized() {
  if (!initialized && typeof window !== "undefined") {
    snapshot = loadTunes();
    initialized = true;
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): Tune[] {
  ensureInitialized();
  return snapshot;
}

export function getServerSnapshot(): Tune[] {
  return EMPTY;
}

export function setTunes(update: Tune[] | ((prev: Tune[]) => Tune[])): void {
  ensureInitialized();
  const next = typeof update === "function" ? update(snapshot) : update;
  snapshot = next;
  saveTunes(snapshot);
  for (const listener of listeners) listener();
}
