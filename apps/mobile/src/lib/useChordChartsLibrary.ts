import { api } from '@jam-practice/convex/_generated/api';
import { Id } from '@jam-practice/convex/_generated/dataModel';
import {
  LIBRARY_DEFAULTS,
  LIBRARY_KEY,
  createPlaylistInLibrary,
  deletePlaylistFromLibrary,
  mergeIntoLibrary,
  songKey,
  moveSongToPlaylist,
  removeSongFromLibrary,
  updateSongInLibrary,
  resolvePlaylists,
  UNSORTED_PLAYLIST_ID,
  type Library,
} from '@jam-practice/core/chordChartsLibrary';
import type { IRealSong } from '@jam-practice/core/iRealPro';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useConvexAuth } from '@convex-dev/auth/react';
import { useMutation, useQuery } from 'convex/react';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

const IMPORT_CHUNK = 150;

export type LibrarySongMeta = {
  id: string;
  title: string;
  composer: string;
  style: string;
  key: string;
  timeSignature: { top: number; bottom: number };
};

export type LibraryPlaylist = { id: string; name: string; songs: LibrarySongMeta[] };

/**
 * Native port of `apps/web/lib/useChordChartsLibrary.ts` — see that file's own doc comment (and
 * `packages/convex/schema.ts`'s own comment on `chordChartPlaylists`) for why signed-in library
 * data lives in three dedicated Convex tables (metadata split from the often much larger `bars`)
 * rather than one JSON blob: a single-blob design broke for real on a massive iReal playlist
 * import, over Convex's 1 MiB per-document limit. Signed out, this reads/writes a local `Library`
 * blob via `AsyncStorage` (the same shape `lib/chordChartsLibrary.ts`'s pure functions already
 * operate on) instead of web's `localStorage`; signed in, it reads/writes the exact same Convex
 * functions `apps/web` already uses — nothing about the backend needed touching for this port.
 *
 * Both backends are always read/called regardless of sign-in state (per rules-of-hooks); only the
 * *returned* values and which mutation actually runs branch on `isAuthenticated` — same pattern
 * every other signed-in-aware hook in this app follows (`useSyncedSettings`, `useSyncedTunes`).
 */

// --- local (signed-out) library store — a small module-level cache + AsyncStorage, the same
// "one shared source of truth, load once" shape `useSyncedTunes.ts` already uses, just for one
// fixed key rather than a parameterized one, since there's only ever this one local library. ---
type LocalEntry = { value: Library; loaded: boolean; listeners: Set<() => void> };
const localEntry: LocalEntry = { value: LIBRARY_DEFAULTS, loaded: false, listeners: new Set() };

function notifyLocal() {
  for (const listener of localEntry.listeners) listener();
}

function isLibraryShape(value: unknown): value is Library {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.songs) && Array.isArray(v.playlists);
}

function subscribeLocal(listener: () => void) {
  localEntry.listeners.add(listener);
  return () => {
    localEntry.listeners.delete(listener);
  };
}

function getLocalSnapshot() {
  return localEntry.value;
}

function useLocalLibrary(): [Library, (next: Library) => void] {
  // `useSyncExternalStore`, not a `useState`+listener `forceRender` pair — this module-level
  // `localEntry` is mutable external state the React Compiler's auto-memoization has no way to
  // know is reactive unless it's read through a primitive the compiler specifically recognizes as
  // an external-store subscription. Confirmed the hard way: an earlier version of this hook used
  // the `useState(0)` + `forceRender` + listener-`Set` pattern `useSyncedTunes.ts` already
  // establishes elsewhere in this app, and it silently broke derived values computed *from* this
  // hook's return (`totalSongs`, `playlists`, both plain/`useMemo`'d expressions in
  // `useChordChartsLibrary` below) — they stayed frozen at whatever they first computed, even
  // though `localLibrary` itself (and a `console.log` placed directly inside this function)
  // visibly updated on every re-render. Root-caused directly, not guessed: traced via targeted
  // debug logging through a real import round-trip in the real dev browser (see this file's own
  // git history / the task's own verification notes) — `localEntry.value` genuinely changed
  // reference each time, proving the *re-render itself* was happening and reading fresh data, but
  // some memoized expression *downstream* of it in the calling component kept returning stale
  // output. `useSyncExternalStore` is the React-blessed way to tell both React itself and the
  // compiler "this value can change independently of props/state," and switching to it fixed the
  // bug completely (re-verified with the exact same reproduction). Worth flagging: `useSyncedTunes.ts`
  // (and any other hook in this app built on the same `useState`+`forceRender`+listener shape
  // instead of `useSyncExternalStore`) may carry the identical latent bug — not fixed here, since
  // touching a shared file outside this task's own scope wasn't asked for, but worth a second look.
  const value = useSyncExternalStore(subscribeLocal, getLocalSnapshot);

  useEffect(() => {
    if (localEntry.loaded) return;
    let cancelled = false;
    AsyncStorage.getItem(LIBRARY_KEY)
      .then((raw) => {
        if (cancelled || localEntry.loaded) return;
        localEntry.loaded = true;
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw);
          if (isLibraryShape(parsed)) {
            localEntry.value = parsed;
            notifyLocal();
          }
        } catch {
          // corrupt storage — stay on LIBRARY_DEFAULTS
        }
      })
      .catch(() => {
        // storage unavailable — stays on LIBRARY_DEFAULTS for this session
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function update(next: Library) {
    localEntry.value = next;
    notifyLocal();
    void AsyncStorage.setItem(LIBRARY_KEY, JSON.stringify(next));
  }

  return [value, update];
}

export function useChordChartsLibrary(selectedSongId: string | null) {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const [localLibrary, updateLocalLibrary] = useLocalLibrary();

  const convexLibrary = useQuery(api.chordCharts.library, isAuthenticated ? {} : 'skip');
  // selectedSongId is device-local (plain React state in the screen, not synced) and can be a
  // signed-out-library id left over from before sign-in — those are crypto.randomUUID() strings
  // (always containing a "-", which a real Convex id never does), so guard against sending one
  // through as a Convex document id, same guard web's own hook applies.
  const validSelectedSongId = selectedSongId && !selectedSongId.includes('-') ? selectedSongId : null;
  const convexBars = useQuery(
    api.chordCharts.getSongBars,
    isAuthenticated && validSelectedSongId
      ? { songId: validSelectedSongId as Id<'chordChartSongs'> }
      : 'skip',
  );
  const importMutation = useMutation(api.chordCharts.importSongs);
  const deleteMutation = useMutation(api.chordCharts.deleteSong);
  const clearMutation = useMutation(api.chordCharts.clearAll);
  const moveMutation = useMutation(api.chordCharts.moveSong);
  const createPlaylistMutation = useMutation(api.chordCharts.createPlaylist);
  const updateMutation = useMutation(api.chordCharts.updateSong);
  const deletePlaylistMutation = useMutation(api.chordCharts.deletePlaylist);
  const migrateMutation = useMutation(api.chordCharts.migrateFromSyncedSettings);

  // Runs once per sign-in, not once ever — the mutation itself is a no-op once already migrated.
  const migratedRef = useRef(false);
  useEffect(() => {
    if (isAuthenticated && !migratedRef.current) {
      migratedRef.current = true;
      void migrateMutation({});
    }
    if (!isAuthenticated) migratedRef.current = false;
  }, [isAuthenticated, migrateMutation]);

  const playlists: LibraryPlaylist[] = useMemo(() => {
    if (!isAuthenticated) return resolvePlaylists(localLibrary, { includeEmpty: true });
    if (!convexLibrary) return [];
    const playlistIds = new Set(convexLibrary.playlists.map((p) => p.id));
    const byPlaylist = new Map<string, LibrarySongMeta[]>();
    const orphans: LibrarySongMeta[] = [];
    for (const song of convexLibrary.songs) {
      if (playlistIds.has(song.playlistId)) {
        const list = byPlaylist.get(song.playlistId) ?? [];
        list.push(song);
        byPlaylist.set(song.playlistId, list);
      } else {
        orphans.push(song);
      }
    }
    const resolved: LibraryPlaylist[] = convexLibrary.playlists
      // Empty playlists are kept: the user can create one (New → Playlist) before adding charts.
      .map((p) => ({ id: p.id, name: p.name, songs: byPlaylist.get(p.id) ?? [] }));
    if (orphans.length > 0) {
      resolved.push({ id: UNSORTED_PLAYLIST_ID, name: 'Unsorted', songs: orphans });
    }
    return resolved;
  }, [isAuthenticated, localLibrary, convexLibrary]);

  const totalSongs = isAuthenticated ? (convexLibrary?.songs.length ?? 0) : localLibrary.songs.length;
  // While sign-in is still being restored at launch, `isAuthenticated` is briefly false — without
  // `authLoading` here the screen would flash the (usually empty) signed-out library first.
  const loading = authLoading || (isAuthenticated && convexLibrary === undefined);

  const selectedMeta = useMemo(() => {
    if (!isAuthenticated || !selectedSongId) return null;
    for (const p of playlists) {
      const found = p.songs.find((s) => s.id === selectedSongId);
      if (found) return found;
    }
    return null;
  }, [isAuthenticated, playlists, selectedSongId]);

  const selectedSong: IRealSong | null = useMemo(() => {
    if (!selectedSongId) return null;
    if (!isAuthenticated) {
      return localLibrary.songs.find((s) => s.id === selectedSongId) ?? null;
    }
    if (!selectedMeta || !convexBars) return null;
    return {
      title: selectedMeta.title,
      composer: selectedMeta.composer,
      style: selectedMeta.style,
      key: selectedMeta.key,
      timeSignature: selectedMeta.timeSignature,
      bars: convexBars,
    };
  }, [selectedSongId, isAuthenticated, localLibrary.songs, selectedMeta, convexBars]);

  const selectedSongLoading =
    isAuthenticated && !!selectedSongId && !!selectedMeta && convexBars === undefined;

  async function importSongs(songs: IRealSong[], playlistName: string, options: { replaceExisting?: boolean } = {}) {
    if (isAuthenticated) {
      // In chunks: one Convex function can only read/write so much (4,096 reads), and updating
      // charts you already have reads each one's existing bars — a whole 1,400-chart playlist in a
      // single call goes over.
      const totals = { added: 0, skipped: 0, updated: 0, ids: [] as string[] };
      for (let i = 0; i < songs.length; i += IMPORT_CHUNK) {
        const r = await importMutation({ playlistName, songs: songs.slice(i, i + IMPORT_CHUNK), replaceExisting: options.replaceExisting });
        totals.added += r.added;
        totals.skipped += r.skipped;
        totals.updated += r.updated;
        totals.ids.push(...r.ids);
      }
      return totals;
    }
    const result = mergeIntoLibrary(localLibrary, songs, playlistName, options);
    updateLocalLibrary(result.library);
    const byKey = new Map(result.library.songs.map((s) => [songKey(s), s.id]));
    const ids = songs.map((s) => byKey.get(songKey(s)) ?? '');
    return { added: result.added, skipped: result.skipped, updated: result.updated, ids };
  }

  async function deleteSong(songId: string) {
    if (isAuthenticated) {
      await deleteMutation({ songId: songId as Id<'chordChartSongs'> });
      return;
    }
    updateLocalLibrary(removeSongFromLibrary(localLibrary, songId));
  }

  async function moveSong(songId: string, playlistName: string) {
    if (isAuthenticated) {
      await moveMutation({ songId: songId as Id<'chordChartSongs'>, playlistName });
      return;
    }
    updateLocalLibrary(moveSongToPlaylist(localLibrary, songId, playlistName));
  }

  async function updateSong(songId: string, song: IRealSong) {
    if (isAuthenticated) {
      await updateMutation({ songId: songId as Id<'chordChartSongs'>, song });
      return;
    }
    updateLocalLibrary(updateSongInLibrary(localLibrary, songId, song));
  }

  async function createPlaylist(name: string) {
    if (isAuthenticated) {
      await createPlaylistMutation({ name });
      return;
    }
    updateLocalLibrary(createPlaylistInLibrary(localLibrary, name));
  }

  async function deletePlaylist(playlistId: string) {
    if (isAuthenticated) {
      await deletePlaylistMutation({ playlistId: playlistId as Id<'chordChartPlaylists'> });
      return;
    }
    updateLocalLibrary(deletePlaylistFromLibrary(localLibrary, playlistId));
  }

  async function clearAll() {
    if (isAuthenticated) {
      await clearMutation({});
      return;
    }
    updateLocalLibrary(LIBRARY_DEFAULTS);
  }

  return {
    playlists,
    totalSongs,
    loading,
    selectedSong,
    selectedSongLoading,
    importSongs,
    deleteSong,
    moveSong,
    createPlaylist,
    updateSong,
    deletePlaylist,
    clearAll,
  };
}
