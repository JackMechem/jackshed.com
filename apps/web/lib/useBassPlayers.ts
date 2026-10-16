import { useConvexAuth } from "@convex-dev/auth/react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import { BUILT_IN_PLAYERS, builtInExtrasFor, isBuiltInId } from "./bassBuiltIns";
import { cleanTranscription, newId, type Transcription } from "./bassTranscription";

/** A built-in transcription by id. */
function builtInTranscription(id: string) {
  for (const p of BUILT_IN_PLAYERS) {
    const t = p.transcriptions.find((x) => x.id === id);
    if (t) return { ...t, playerId: p.id };
  }
  return null;
}

// Bass Genius's bass players and transcriptions. Signed in they're in the account
// (`convex/bassPlayers.ts`, one row per transcription); signed out they're kept in this browser
// only, same shape, so the editor works either way.

export type BassPlayerMeta = {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  /** Comes with Bass Genius (read-only). */
  builtIn?: boolean;
};
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

  const own = useMemo(() => (isAuthenticated ? (remote?.players ?? []) : local.players), [isAuthenticated, remote, local.players]);
  // Built-in players, unless you already have one by that name.
  const builtIns = useMemo(() => BUILT_IN_PLAYERS.filter((b) => !own.some((p) => p.name.trim().toLowerCase() === b.name.toLowerCase())), [own]);
  const players: BassPlayerMeta[] = useMemo(
    () =>
      [...own, ...builtIns.map((b) => ({ id: b.id, name: b.name, description: b.description, createdAt: 0, updatedAt: 0, builtIn: true }))].sort((a, b) =>
        a.name.localeCompare(b.name),
      ),
    [own, builtIns],
  );
  const transcriptions: TranscriptionMeta[] = useMemo(() => {
    const list: TranscriptionMeta[] = isAuthenticated
      ? (remote?.transcriptions ?? [])
      : local.transcriptions.map((t) => ({ id: t.id, playerId: t.playerId, title: t.data.title, measureCount: t.data.measures.length, createdAt: t.createdAt, updatedAt: t.updatedAt }));
    for (const b of builtIns)
      for (const t of b.transcriptions)
        list.push({ id: t.id, playerId: b.id, title: t.data.title, measureCount: t.data.measures.length, createdAt: 0, updatedAt: 0 });
    // Your own player sharing a built-in's name gets its transcriptions too.
    for (const p of own) {
      const titles = list.filter((t) => t.playerId === p.id).map((t) => t.title);
      for (const t of builtInExtrasFor(p.name, titles))
        list.push({ id: t.id, playerId: p.id, title: t.data.title, measureCount: t.data.measures.length, createdAt: 0, updatedAt: 0 });
    }
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [isAuthenticated, remote, local.transcriptions, builtIns, own]);

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
      if (isBuiltInId(id)) return builtInTranscription(id)?.data ?? null;
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
  const builtIn = useMemo(() => (isBuiltInId(id) ? builtInTranscription(id!) : null), [id]);
  const remote = useQuery(api.bassPlayers.getTranscription, isAuthenticated && id && !builtIn ? { transcriptionId: id } : "skip");
  const saveM = useMutation(api.bassPlayers.saveTranscription);

  const data: Transcription | null | undefined = useMemo(() => {
    if (!id) return null;
    if (builtIn) return cleanTranscription(builtIn.data);
    if (isAuthenticated) {
      if (remote === undefined) return undefined;
      return remote ? cleanTranscription(remote.data) : null;
    }
    const row = local.transcriptions.find((t) => t.id === id);
    return row ? cleanTranscription(row.data) : null;
    // Recomputed as saves land; the editor only takes it once, when it loads a transcription.
  }, [id, builtIn, isAuthenticated, remote, local.transcriptions]);

  const save = useCallback(
    async (next: Transcription) => {
      if (!id || isBuiltInId(id)) return; // built-ins are read-only
      if (isAuthenticated) return void (await saveM({ transcriptionId: id as Id<"bassTranscriptions">, data: plain(next) }));
      updateLocal((s) => ({ transcriptions: s.transcriptions.map((t) => (t.id === id ? { ...t, data: plain(next), updatedAt: Date.now() } : t)) }));
    },
    [id, isAuthenticated, saveM],
  );

  const playerId = builtIn ? builtIn.playerId : isAuthenticated ? (remote?.playerId ?? null) : (local.transcriptions.find((t) => t.id === id)?.playerId ?? null);
  return { data, save, playerId, readOnly: !!builtIn };
}

/** All of one player's transcriptions with their ids, notes and all; undefined while loading,
    [] for none / no such player. */
export function usePlayerTranscriptionRows(playerId: string | null, playerName?: string): { id: string; data: Transcription }[] | undefined {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const local = useLocalStore();
  const builtIn = isBuiltInId(playerId);
  const remote = useQuery(api.bassPlayers.playerTranscriptions, isAuthenticated && playerId && !builtIn ? { playerId } : "skip");
  return useMemo(() => {
    if (!playerId) return [];
    if (builtIn) return (BUILT_IN_PLAYERS.find((b) => b.id === playerId)?.transcriptions ?? []).map((t) => ({ id: t.id, data: cleanTranscription(t.data) }));
    if (isLoading) return undefined;
    let rows: { id: string; data: Transcription }[];
    if (isAuthenticated) {
      if (remote === undefined) return undefined;
      rows = (remote ?? []).map((r) => ({ id: r.id, data: cleanTranscription(r.data) }));
    } else rows = local.transcriptions.filter((t) => t.playerId === playerId).map((t) => ({ id: t.id, data: cleanTranscription(t.data) }));
    // A player of yours named like a built-in also plays from the built-in's transcriptions.
    const extras = playerName ? builtInExtrasFor(playerName, rows.map((r) => r.data.title)) : [];
    return [...rows, ...extras.map((t) => ({ id: t.id, data: cleanTranscription(t.data) }))];
  }, [playerId, playerName, builtIn, isLoading, isAuthenticated, remote, local.transcriptions]);
}

/** All of one player's transcriptions (what Bass Genius analyses to play like them). */
export function usePlayerTranscriptions(playerId: string | null, playerName?: string): Transcription[] | undefined {
  const rows = usePlayerTranscriptionRows(playerId, playerName);
  return useMemo(() => rows?.map((r) => r.data), [rows]);
}
