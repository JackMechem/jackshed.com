import { PracticeSession } from "./practiceTimer";

// Same hand-rolled external-store shape as lib/tunesStore.ts (subscribe/getSnapshot/setSessions),
// used only while signed out — signed in, lib/usePracticeSessions.ts reads/writes Convex instead
// and this store (and whatever's in it) is simply never consulted. See that file for the
// no-merge rule.

const STORAGE_KEY = "jam-practice-timer-sessions";

type Listener = () => void;

const EMPTY: PracticeSession[] = [];
let snapshot: PracticeSession[] = EMPTY;
let initialized = false;
const listeners = new Set<Listener>();

function load(): PracticeSession[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : EMPTY;
  } catch {
    return EMPTY;
  }
}

function save(sessions: PracticeSession[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // storage unavailable/full — the in-memory snapshot still updates, it just won't persist
  }
}

function ensureInitialized() {
  if (!initialized && typeof window !== "undefined") {
    snapshot = load();
    initialized = true;
  }
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): PracticeSession[] {
  ensureInitialized();
  return snapshot;
}

export function getServerSnapshot(): PracticeSession[] {
  return EMPTY;
}

export function setSessions(
  update: PracticeSession[] | ((prev: PracticeSession[]) => PracticeSession[]),
): void {
  ensureInitialized();
  const next = typeof update === "function" ? update(snapshot) : update;
  snapshot = next;
  save(snapshot);
  for (const listener of listeners) listener();
}
