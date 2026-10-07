import type { IRealSong } from "./iRealPro";

/** Shared between `ChordCharts.tsx` (the tool itself) and `CommunityChordCharts.tsx` (posting from
    it / importing into it), so both read and write the exact same synced library under the exact
    same key — a copy-pasted key string in two places would be a silent "why didn't my import show
    up" bug waiting to happen. */
export type StoredSong = IRealSong & { id: string };

/** A named group of songs, shown in the Chord Charts tool as a collapsible section — every import
    (an iReal playlist, or a Community chord chart post) creates or merges into one of these, named
    after whatever the import was called. Stores `songIds` rather than the songs themselves, so a
    song still only exists once in `Library.songs` even though nothing currently lets the same song
    belong to two playlists at once (see `mergeIntoLibrary`'s song-level dedupe). */
export type Playlist = { id: string; name: string; songIds: string[] };

export type Library = { songs: StoredSong[]; playlists: Playlist[] };

export const LIBRARY_KEY = "jam-practice-chord-charts-library";
export const LIBRARY_DEFAULTS: Library = { songs: [], playlists: [] };

/** The catch-all playlist `resolvePlaylists` buckets a song into if it isn't in any real playlist
    — the normal case is a library saved before playlists existed at all (an existing `songs` list
    with no matching `playlists` entries, since `mergeWithDefaults` fills a missing `playlists`
    field with `[]` rather than failing), not something a fresh import can produce (`mergeIntoLibrary`
    always assigns an imported song to a real, named playlist). Exists so "every chart is in a
    playlist" holds for what's actually *displayed*, without needing a one-time migration write the
    first time an old library loads. */
export const UNSORTED_PLAYLIST_ID = "unsorted";
const UNSORTED_PLAYLIST_NAME = "Unsorted";

/** A name/composer/key fingerprint used to dedupe imports against what's already in a library —
    the same tune re-imported from a different playlist (or, now, from a Community post) shouldn't
    show up twice. Takes just the three fields it needs rather than a whole `IRealSong`, so it
    works equally well against metadata-only shapes that never carry `bars` at all (e.g.
    `lib/useChordChartsLibrary.ts`'s `LibrarySongMeta`). */
export function songKey(song: { title: string; composer: string; key: string }) {
  return `${song.title.toLowerCase()}__${song.composer.toLowerCase()}__${song.key.toLowerCase()}`;
}

function playlistNameKey(name: string) {
  return name.trim().toLowerCase();
}

function freshId(fallback: string) {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : fallback;
}

/** Merges `incoming` songs into `library`, skipping anything already there by `songKey` (the same
    dedupe this tool's playlist import has always done), and places whatever's actually new into
    the playlist named `playlistName` — an existing playlist with that name (matched
    case/whitespace-insensitively, e.g. re-importing the same iReal playlist later) gets the new
    songs appended to it rather than a second playlist with the same name; otherwise a fresh
    playlist is created. Every code path that adds songs to the library (iReal import, Community
    chart import) goes through this, which is what keeps "every chart is in a playlist" true for
    anything added from here on. Returns the updated library plus how many songs were actually
    added (for a "N imported, M already in your library" status message). */
export function mergeIntoLibrary(
  library: Library,
  incoming: IRealSong[],
  playlistName: string,
): { library: Library; added: number; skipped: number } {
  const existingKeys = new Set(library.songs.map(songKey));
  const additions: StoredSong[] = [];
  const addedIds: string[] = [];
  for (const song of incoming) {
    const key = songKey(song);
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    const id = freshId(key);
    additions.push({ ...song, id });
    addedIds.push(id);
  }

  let playlists = library.playlists;
  if (addedIds.length > 0) {
    const name = playlistName.trim() || "Imported";
    const index = playlists.findIndex((p) => playlistNameKey(p.name) === playlistNameKey(name));
    playlists =
      index === -1
        ? [...playlists, { id: freshId(name), name, songIds: addedIds }]
        : playlists.map((p, i) =>
            i === index ? { ...p, songIds: [...p.songIds, ...addedIds] } : p,
          );
  }

  return {
    library: { songs: [...library.songs, ...additions], playlists },
    added: additions.length,
    skipped: incoming.length - additions.length,
  };
}

/** Removes a song from the library outright — from `songs`, and from whichever playlist(s)
    reference it (normally exactly one). A playlist left with no songs is dropped entirely rather
    than kept around as an empty shell. */
export function removeSongFromLibrary(library: Library, songId: string): Library {
  return {
    songs: library.songs.filter((s) => s.id !== songId),
    playlists: library.playlists
      .map((p) => ({ ...p, songIds: p.songIds.filter((id) => id !== songId) }))
      .filter((p) => p.songIds.length > 0),
  };
}

export type ResolvedPlaylist = { id: string; name: string; songs: StoredSong[] };

/** The library, grouped into playlists for display — what `ChordCharts.tsx` actually renders,
    instead of `Library.playlists` directly. Resolves each playlist's `songIds` into the real
    `StoredSong` objects (silently dropping a dangling id, which shouldn't happen via
    `removeSongFromLibrary` but costs nothing to guard against), and collects any song that isn't
    in *any* playlist into a synthetic `UNSORTED_PLAYLIST_ID` playlist at the end — see that
    constant's own comment for when this actually happens. */
export function resolvePlaylists(library: Library): ResolvedPlaylist[] {
  const songsById = new Map(library.songs.map((s) => [s.id, s]));
  const assigned = new Set<string>();
  const resolved: ResolvedPlaylist[] = [];
  for (const playlist of library.playlists) {
    const songs = playlist.songIds
      .map((id) => songsById.get(id))
      .filter((s): s is StoredSong => s !== undefined);
    for (const s of songs) assigned.add(s.id);
    if (songs.length > 0) resolved.push({ id: playlist.id, name: playlist.name, songs });
  }
  const orphans = library.songs.filter((s) => !assigned.has(s.id));
  if (orphans.length > 0) {
    resolved.push({ id: UNSORTED_PLAYLIST_ID, name: UNSORTED_PLAYLIST_NAME, songs: orphans });
  }
  return resolved;
}
