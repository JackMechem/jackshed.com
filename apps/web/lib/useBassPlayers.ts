import { useConvexAuth } from "@convex-dev/auth/react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import { cleanTranscription, newId, type Transcription } from "./bassTranscription";

// Bass Genius's bass players and transcriptions. Signed in they're in the account
// (`convex/bassPlayers.ts`, one row per transcription); signed out they're kept in this browser
// only, same shape, so the editor works either way.

export type BassPlayerMeta = { id: string; name: string; description: string; createdAt: number; updatedAt: number };
export type TranscriptionMeta = { id: string; playerId: string; title: string; measureCount: number; createdAt: number; updatedAt: number };

type LocalTranscription = { id: string; playerId: string; data: Transcription; createdAt: number; updatedAt: number };
type LocalStore = { players: BassPlayerMeta[]; transcriptions: LocalTranscription[] };

const LOCAL_KEY = "jam-practice-bass-players";
const LOCAL_DEFAULTS: LocalStore = { players: [], transcriptions: [] };

// The signed-out copy: a tiny localStorage-backed store that always updates from the latest value
// (several quick edits in a row never overwrite each other).
let localCache: LocalStore | null = null;
const localListeners = new Set<() => void>();
function readLocal(): LocalStore {
  if (localCache) return localCache;
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(LOCAL_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<LocalStore>) : null;
    localCache = { players: Array.isArray(parsed?.players) ? parsed.players : [], transcriptions: Array.isArray(parsed?.transcriptions) ? parsed.transcriptions : [] };
  } catch {
    localCache = LOCAL_DEFAULTS;
  }
  return localCache;
}
function updateLocal(change: (s: LocalStore) => Partial<LocalStore>) {
  localCache = { ...readLocal(), ...change(readLocal()) };
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(localCache));
  } catch {
    // Full or blocked storage: keep it in memory for this tab.
  }
  for (const fn of localListeners) fn();
}
function useLocalStore(): LocalStore {
  return useSyncExternalStore(
    (fn) => {
      localListeners.add(fn);
      return () => localListeners.delete(fn);
    },
    readLocal,
    () => LOCAL_DEFAULTS,
  );
}

/** Deep-copies through JSON, so what's saved never shares objects with editor state. */
const plain = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

export function useBassPlayers() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const local = useLocalStore();
  const remote = useQuery(api.bassPlayers.library, isAuthenticated ? {} : "skip");
  const createPlayerM = useMutation(api.bassPlayers.createPlayer);
  const updatePlayerM = useMutation(api.bassPlayers.updatePlayer);
  const deletePlayerM = useMutation(api.bassPlayers.deletePlayer);
  const createTranscriptionM = useMutation(api.bassPlayers.createTranscription);
  const deleteTranscriptionM = useMutation(api.bassPlayers.deleteTranscription);
  const moveTranscriptionM = useMutation(api.bassPlayers.moveTranscription);
  const convex = useConvex();

  const players: BassPlayerMeta[] = useMemo(
    () => [...(isAuthenticated ? (remote?.players ?? []) : local.players)].sort((a, b) => a.name.localeCompare(b.name)),
    [isAuthenticated, remote, local.players],
  );
  const transcriptions: TranscriptionMeta[] = useMemo(() => {
    const list: TranscriptionMeta[] = isAuthenticated
      ? (remote?.transcriptions ?? [])
      : local.transcriptions.map((t) => ({ id: t.id, playerId: t.playerId, title: t.data.title, measureCount: t.data.measures.length, createdAt: t.createdAt, updatedAt: t.updatedAt }));
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [isAuthenticated, remote, local.transcriptions]);

  const loading = authLoading || (isAuthenticated && remote === undefined);

  const createPlayer = useCallback(
    async (name: string, description = ""): Promise<string> => {
      if (isAuthenticated) return await createPlayerM({ name, description });
      const now = Date.now();
      const id = newId();
      updateLocal((s) => ({ players: [...s.players, { id, name: name.trim() || "Bass player", description, createdAt: now, updatedAt: now }] }));
      return id;
    },
    [isAuthenticated, createPlayerM],
  );

  const updatePlayer = useCallback(
    async (id: string, patch: { name?: string; description?: string }) => {
      if (isAuthenticated) return void (await updatePlayerM({ playerId: id as Id<"bassPlayers">, ...patch }));
      updateLocal((s) => ({ players: s.players.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)) }));
    },
    [isAuthenticated, updatePlayerM],
  );

  const deletePlayer = useCallback(
    async (id: string) => {
      if (isAuthenticated) return void (await deletePlayerM({ playerId: id as Id<"bassPlayers"> }));
      updateLocal((s) => ({ players: s.players.filter((p) => p.id !== id), transcriptions: s.transcriptions.filter((t) => t.playerId !== id) }));
    },
    [isAuthenticated, deletePlayerM],
  );

  const createTranscription = useCallback(
    async (playerId: string, data: Transcription): Promise<string> => {
      if (isAuthenticated) return await createTranscriptionM({ playerId: playerId as Id<"bassPlayers">, data: plain(data) });
      const now = Date.now();
      const id = newId();
      updateLocal((s) => ({ transcriptions: [...s.transcriptions, { id, playerId, data: plain(data), createdAt: now, updatedAt: now }] }));
      return id;
    },
    [isAuthenticated, createTranscriptionM],
  );

  const deleteTranscription = useCallback(
    async (id: string) => {
      if (isAuthenticated) return void (await deleteTranscriptionM({ transcriptionId: id as Id<"bassTranscriptions"> }));
      updateLocal((s) => ({ transcriptions: s.transcriptions.filter((t) => t.id !== id) }));
    },
    [isAuthenticated, deleteTranscriptionM],
  );

  const moveTranscription = useCallback(
    async (id: string, playerId: string) => {
      if (isAuthenticated) return void (await moveTranscriptionM({ transcriptionId: id as Id<"bassTranscriptions">, playerId: playerId as Id<"bassPlayers"> }));
      updateLocal((s) => ({ transcriptions: s.transcriptions.map((t) => (t.id === id ? { ...t, playerId, updatedAt: Date.now() } : t)) }));
    },
    [isAuthenticated, moveTranscriptionM],
  );

  /** One transcription's notes, fetched once (for exporting a whole player). */
  const fetchTranscription = useCallback(
    async (id: string): Promise<unknown> => {
      if (isAuthenticated) return (await convex.query(api.bassPlayers.getTranscription, { transcriptionId: id }))?.data ?? null;
      return readLocal().transcriptions.find((t) => t.id === id)?.data ?? null;
    },
    [isAuthenticated, convex],
  );

  return { signedIn: isAuthenticated, loading, players, transcriptions, fetchTranscription, createPlayer, updatePlayer, deletePlayer, createTranscription, deleteTranscription, moveTranscription };
}

/** One transcription's notes, and a way to save them (the editor autosaves through this). */
export function useTranscription(id: string | null) {
  const { isAuthenticated } = useConvexAuth();
  const local = useLocalStore();
  const remote = useQuery(api.bassPlayers.getTranscription, isAuthenticated && id ? { transcriptionId: id } : "skip");
  const saveM = useMutation(api.bassPlayers.saveTranscription);

  const data: Transcription | null | undefined = useMemo(() => {
    if (!id) return null;
    if (isAuthenticated) {
      if (remote === undefined) return undefined;
      return remote ? cleanTranscription(remote.data) : null;
    }
    const row = local.transcriptions.find((t) => t.id === id);
    return row ? cleanTranscription(row.data) : null;
    // Recomputed as saves land; the editor only takes it once, when it loads a transcription.
  }, [id, isAuthenticated, remote, local.transcriptions]);

  const save = useCallback(
    async (next: Transcription) => {
      if (!id) return;
      if (isAuthenticated) return void (await saveM({ transcriptionId: id as Id<"bassTranscriptions">, data: plain(next) }));
      updateLocal((s) => ({ transcriptions: s.transcriptions.map((t) => (t.id === id ? { ...t, data: plain(next), updatedAt: Date.now() } : t)) }));
    },
    [id, isAuthenticated, saveM],
  );

  const playerId = isAuthenticated ? (remote?.playerId ?? null) : (local.transcriptions.find((t) => t.id === id)?.playerId ?? null);
  return { data, save, playerId };
}
