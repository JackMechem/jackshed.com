import type { IRealSong } from "./iRealPro";

/** Shared between `ChordCharts.tsx` (the tool itself) and `CommunityChordCharts.tsx` (posting from
    it / importing into it), so both read and write the exact same synced library under the exact
    same key — a copy-pasted key string in two places would be a silent "why didn't my import show
    up" bug waiting to happen. */
export type StoredSong = IRealSong & { id: string };

/** A named group of charts. Charts live once in `Library.songs` ("All charts"); a playlist only
    lists their ids, so one chart can be in several playlists, and removing it from a playlist
    leaves it in the library. */
export type Playlist = { id: string; name: string; songIds: string[] };

export type Library = { songs: StoredSong[]; playlists: Playlist[] };

export const LIBRARY_KEY = "jam-practice-chord-charts-library";
export const LIBRARY_DEFAULTS: Library = { songs: [], playlists: [] };

/** A name/composer/key fingerprint used to dedupe imports against what's already in a library —
    the same tune re-imported from a different playlist shouldn't show up twice. Takes just the
    three fields it needs, so it works on metadata-only shapes too. */
export function songKey(song: { title: string; composer: string; key: string }) {
  return `${song.title.toLowerCase()}__${song.composer.toLowerCase()}__${song.key.toLowerCase()}`;
}

function playlistNameKey(name: string) {
  return name.trim().toLowerCase();
}

function freshId(fallback: string) {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : fallback;
}

/** Adds `songIds` to the playlist named `name` (existing — matched case/whitespace-insensitively —
    or new), skipping any already in it. */
function addIdsToNamedPlaylist(playlists: Playlist[], name: string, songIds: string[]): Playlist[] {
  const trimmed = name.trim() || "Imported";
  const index = playlists.findIndex((p) => playlistNameKey(p.name) === playlistNameKey(trimmed));
  if (index === -1) return [...playlists, { id: freshId(trimmed), name: trimmed, songIds: [...new Set(songIds)] }];
  return playlists.map((p, i) => {
    if (i !== index) return p;
    const have = new Set(p.songIds);
    return { ...p, songIds: [...p.songIds, ...songIds.filter((id) => !have.has(id) && (have.add(id), true))] };
  });
}

/** Merges `incoming` charts into `library`, skipping any already there by `songKey`, and puts
    every one of them — new or already there — in the playlist named `playlistName` (existing or
    new). `null`/empty `playlistName` adds them to All charts only. With `replaceExisting`, a chart
    already in the library is overwritten in place by the incoming version. Returns the updated
    library, the counts, and each incoming chart's library id in order. */
export function mergeIntoLibrary(
  library: Library,
  incoming: IRealSong[],
  playlistName: string | null,
  options: { replaceExisting?: boolean } = {},
): { library: Library; added: number; skipped: number; updated: number; ids: string[] } {
  const idByKey = new Map(library.songs.map((s) => [songKey(s), s.id]));
  const additions: StoredSong[] = [];
  const ids: string[] = [];
  const replacements = new Map<string, IRealSong>();
  for (const song of incoming) {
    const key = songKey(song);
    const existing = idByKey.get(key);
    if (existing) {
      ids.push(existing);
      if (options.replaceExisting && !replacements.has(key)) replacements.set(key, song);
      continue;
    }
    const id = freshId(key);
    idByKey.set(key, id);
    additions.push({ ...song, id });
    ids.push(id);
  }
  const addedSet = new Set(additions.map((a) => a.id));

  const playlists = playlistName?.trim() && ids.length ? addIdsToNamedPlaylist(library.playlists, playlistName, ids) : library.playlists;

  const songs = replacements.size
    ? library.songs.map((s) => {
        const next = replacements.get(songKey(s));
        return next ? { ...next, id: s.id } : s;
      })
    : library.songs;

  return {
    library: { songs: [...songs, ...additions], playlists },
    added: additions.length,
    updated: replacements.size,
    skipped: incoming.length - addedSet.size - replacements.size,
    ids,
  };
}

/** Deletes a chart from the library — and so from every playlist. Playlists stay, even empty. */
export function removeSongFromLibrary(library: Library, songId: string): Library {
  return {
    songs: library.songs.filter((s) => s.id !== songId),
    playlists: library.playlists.map((p) => ({ ...p, songIds: p.songIds.filter((id) => id !== songId) })),
  };
}

/** Adds a chart to the playlist named `playlistName` (existing or new); it stays in any others. */
export function addSongToPlaylist(library: Library, songId: string, playlistName: string): Library {
  return { ...library, playlists: addIdsToNamedPlaylist(library.playlists, playlistName, [songId]) };
}

/** Takes a chart out of one playlist; it stays in the library. */
export function removeSongFromPlaylist(library: Library, songId: string, playlistId: string): Library {
  return {
    ...library,
    playlists: library.playlists.map((p) => (p.id === playlistId ? { ...p, songIds: p.songIds.filter((id) => id !== songId) } : p)),
  };
}

/** Adds an empty, named playlist (no-op if one with that name already exists, matched the same
    way `mergeIntoLibrary` matches). */
export function createPlaylistInLibrary(library: Library, name: string): Library {
  const trimmed = name.trim() || "Imported";
  if (library.playlists.some((p) => playlistNameKey(p.name) === playlistNameKey(trimmed))) return library;
  return { ...library, playlists: [...library.playlists, { id: freshId(trimmed), name: trimmed, songIds: [] }] };
}

/** Replaces one chart's content in place, keeping its id and playlists. */
export function updateSongInLibrary(library: Library, songId: string, song: IRealSong): Library {
  return { ...library, songs: library.songs.map((s) => (s.id === songId ? { ...song, id: songId } : s)) };
}

/** Removes a playlist. Its charts stay in the library unless `deleteCharts`, which also deletes
    the ones that aren't in any other playlist. */
export function deletePlaylistFromLibrary(library: Library, playlistId: string, options: { deleteCharts?: boolean } = {}): Library {
  const playlist = library.playlists.find((p) => p.id === playlistId);
  if (!playlist) return library;
  const playlists = library.playlists.filter((p) => p.id !== playlistId);
  if (!options.deleteCharts) return { ...library, playlists };
  const elsewhere = new Set(playlists.flatMap((p) => p.songIds));
  const gone = new Set(playlist.songIds.filter((id) => !elsewhere.has(id)));
  return { songs: library.songs.filter((s) => !gone.has(s.id)), playlists };
}

export type ResolvedPlaylist = { id: string; name: string; songs: StoredSong[] };

/** Each playlist with its `songIds` resolved to the real charts (a dangling id is dropped). */
export function resolvePlaylists(library: Library): ResolvedPlaylist[] {
  const songsById = new Map(library.songs.map((s) => [s.id, s]));
  return library.playlists.map((p) => ({
    id: p.id,
    name: p.name,
    songs: p.songIds.map((id) => songsById.get(id)).filter((s): s is StoredSong => s !== undefined),
  }));
}
