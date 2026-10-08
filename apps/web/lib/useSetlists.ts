import { makeId } from "@/lib/types";
import { useSyncedSettings } from "@/lib/useSyncedSettings";

/** A setlist: a named, ordered list of your tunes (by id, from Tunes I Know or Tunes to Learn).
    `shareId` is set once it's been shared by link (`convex/setlists.ts`). Same shape and synced
    key as the mobile app's (`apps/mobile/src/lib/useSetlists.ts`), so setlists show up on both. */
export type Setlist = {
  id: string;
  name: string;
  description: string;
  tuneIds: string[];
  /** Per tune (by id): the key (a root, e.g. "Eb") and/or tempo this setlist plays it in, instead
      of the tune's own — changes here never touch the tune itself. */
  overrides?: Record<string, SetlistOverride>;
  shareId?: string;
  createdAt: number;
  updatedAt: number;
};

export type SetlistOverride = { key?: string; tempo?: number };

const KEY = "jam-practice-setlists";
const DEFAULTS = { setlists: [] as Setlist[] };

/** Your setlists — synced to your account (or this browser, signed out) like every other setting. */
export function useSetlists() {
  const [{ setlists }, update] = useSyncedSettings(KEY, DEFAULTS);

  function save(next: Setlist[]) {
    update({ setlists: next });
  }

  function create(name: string, tuneIds: string[] = [], overrides?: Record<string, SetlistOverride>): Setlist {
    const now = Date.now();
    const setlist: Setlist = {
      id: makeId(),
      name: name.trim() || "Setlist",
      description: "",
      tuneIds,
      ...(overrides && Object.keys(overrides).length ? { overrides } : {}),
      createdAt: now,
      updatedAt: now,
    };
    save([...setlists, setlist]);
    return setlist;
  }

  function patch(id: string, changes: Partial<Omit<Setlist, "id" | "createdAt">>) {
    save(setlists.map((s) => (s.id === id ? { ...s, ...changes, updatedAt: Date.now() } : s)));
  }

  function remove(id: string) {
    save(setlists.filter((s) => s.id !== id));
  }

  return { setlists, create, patch, remove };
}
