import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import { Id } from "@jam-practice/convex/_generated/dataModel";
import type { IRealSong } from "./iRealPro";
import {
  LIBRARY_DEFAULTS,
  LIBRARY_KEY,
  createPlaylistInLibrary,
  deletePlaylistFromLibrary,
  mergeIntoLibrary,
  moveSongToPlaylist,
  removeSongFromLibrary,
  updateSongInLibrary,
  resolvePlaylists,
  UNSORTED_PLAYLIST_ID,
  songKey,
} from "./chordChartsLibrary";
import { usePersistedSettings } from "./usePersistedSettings";

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
 * The Chord Charts tool's library — signed out, this is a thin wrapper over
 * `lib/chordChartsLibrary.ts`'s pure functions and a `usePersistedSettings` blob, unchanged from
 * before this hook existed. Signed in, it's backed by three dedicated Convex tables instead of
 * the generic `syncedSettings` blob mechanism every other tool's settings use — see
 * `convex/schema.ts`'s own comment on `chordChartPlaylists` for why: that blob approach broke for
 * real on a "massive" iReal playlist import (a single JSON document over Convex's 1 MiB
 * per-document limit). The tables split a song's metadata from its (often much larger) parsed
 * bar list, so listing/searching/deduping a library never touches `bars` at all, and `bars` is
 * only ever fetched for whichever *one* song is currently selected (`selectedSongId`) — lazily,
 * the same on-demand pattern Community posts already use for their own "don't pull a big payload
 * down just to show a list" problem.
 *
 * Both backends are always read/called regardless of sign-in state, per rules-of-hooks — only the
 * *returned* values and which mutation actually runs branch on `isAuthenticated`, same pattern as
 * every other signed-in-aware hook in this app (`useSyncedSettings`, `usePracticeSessions`, ...).
 */
export function useChordChartsLibrary(selectedSongId: string | null) {
  const { isAuthenticated } = useConvexAuth();

  const [localLibrary, updateLocalLibrary] = usePersistedSettings(LIBRARY_KEY, LIBRARY_DEFAULTS);

  const convexLibrary = useQuery(api.chordCharts.library, isAuthenticated ? {} : "skip");
  // `selectedSongId` is device-local (persisted in localStorage regardless of sign-in state — see
  // ChordCharts.tsx's own VIEW_KEY), so it can be a signed-out-library id left over from before
  // the user signed in. Those are `crypto.randomUUID()` strings (lib/chordChartsLibrary.ts's
  // `freshId`) — always containing a "-", which a real Convex id never does — so sending one
  // through as a Convex document id fails argument validation and crashes the query outright.
  // Guard against that shape mismatch here rather than letting it reach the server.
  const validSelectedSongId =
    selectedSongId && !selectedSongId.includes("-") ? selectedSongId : null;
  const convexBars = useQuery(
    api.chordCharts.getSongBars,
    isAuthenticated && validSelectedSongId
      ? { songId: validSelectedSongId as Id<"chordChartSongs"> }
      : "skip",
  );
  const importMutation = useMutation(api.chordCharts.importSongs);
  const deleteMutation = useMutation(api.chordCharts.deleteSong);
  const clearMutation = useMutation(api.chordCharts.clearAll);
  const moveMutation = useMutation(api.chordCharts.moveSong);
  const createPlaylistMutation = useMutation(api.chordCharts.createPlaylist);
  const updateMutation = useMutation(api.chordCharts.updateSong);
  const deletePlaylistMutation = useMutation(api.chordCharts.deletePlaylist);
  const migrateMutation = useMutation(api.chordCharts.migrateFromSyncedSettings);

  // Runs once per sign-in (not once ever, and not on every render) — the mutation itself is a
  // no-op once already migrated, so calling it again on a later sign-in costs one cheap read.
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
      // Empty playlists are kept: one can be created ("New playlist") before any chart is in it.
      .map((p) => ({ id: p.id, name: p.name, songs: byPlaylist.get(p.id) ?? [] }));
    if (orphans.length > 0) {
      resolved.push({ id: UNSORTED_PLAYLIST_ID, name: "Unsorted", songs: orphans });
    }
    return resolved;
  }, [isAuthenticated, localLibrary, convexLibrary]);

  const totalSongs = isAuthenticated ? (convexLibrary?.songs.length ?? 0) : localLibrary.songs.length;
  const loading = isAuthenticated && convexLibrary === undefined;

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

  /** `replaceExisting` overwrites charts already in the library (same title/composer/key) in
      place — for re-importing after the importer improved. Signed in, big imports go in chunks:
      one Convex function can only read 4,096 documents, and replacing reads each chart's bars. */
  async function importSongs(songs: IRealSong[], playlistName: string, options: { replaceExisting?: boolean } = {}) {
    if (isAuthenticated) {
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
    // Each imported song's id in the library (the existing chart's, for one that was skipped).
    const byKey = new Map(result.library.songs.map((s) => [songKey(s), s.id]));
    const ids = songs.map((s) => byKey.get(songKey(s)) ?? "");
    return { added: result.added, skipped: result.skipped, updated: result.updated, ids };
  }

  async function moveSong(songId: string, playlistName: string) {
    if (isAuthenticated) {
      await moveMutation({ songId: songId as Id<"chordChartSongs">, playlistName });
      return;
    }
    updateLocalLibrary(moveSongToPlaylist(localLibrary, songId, playlistName));
  }

  async function createPlaylist(name: string) {
    if (isAuthenticated) {
      await createPlaylistMutation({ name });
      return;
    }
    updateLocalLibrary(createPlaylistInLibrary(localLibrary, name));
  }

  async function updateSong(songId: string, song: IRealSong) {
    if (isAuthenticated) {
      await updateMutation({ songId: songId as Id<"chordChartSongs">, song });
      return;
    }
    updateLocalLibrary(updateSongInLibrary(localLibrary, songId, song));
  }

  /** Signed in, the playlist disappears at once and its charts are removed in background batches. */
  async function deletePlaylist(playlistId: string) {
    if (isAuthenticated) {
      await deletePlaylistMutation({ playlistId: playlistId as Id<"chordChartPlaylists"> });
      return;
    }
    updateLocalLibrary(deletePlaylistFromLibrary(localLibrary, playlistId));
  }

  async function deleteSong(songId: string) {
    if (isAuthenticated) {
      await deleteMutation({ songId: songId as Id<"chordChartSongs"> });
      return;
    }
    updateLocalLibrary(removeSongFromLibrary(localLibrary, songId));
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
