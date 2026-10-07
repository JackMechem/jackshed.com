import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { findOrCreatePlaylist, songKey } from "./lib/chordCharts";

const LEGACY_SYNCED_SETTINGS_KEY = "jam-practice-chord-charts-library";

const timeSignatureValidator = v.object({ top: v.number(), bottom: v.number() });
const songMetaValidator = {
  title: v.string(),
  composer: v.string(),
  style: v.string(),
  key: v.string(),
  timeSignature: timeSignatureValidator,
};

/** Every playlist and every song's *metadata* (no `bars`) for the signed-in user — cheap no
    matter how large the library is, since it never touches the one thing that can actually be
    large. `lib/useChordChartsLibrary.ts` is the only caller; everything except the one song
    currently displayed goes through this, not `getSongBars`. */
export const library = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { playlists: [], songs: [] };
    const [playlists, songs] = await Promise.all([
      ctx.db
        .query("chordChartPlaylists")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("chordChartSongs")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    ]);
    return {
      playlists: playlists.map((p) => ({ id: p._id, name: p.name })),
      songs: songs.map((s) => ({
        id: s._id,
        playlistId: s.playlistId,
        title: s.title,
        composer: s.composer,
        style: s.style,
        key: s.key,
        timeSignature: s.timeSignature,
      })),
    };
  },
});

async function barsForSong(ctx: QueryCtx, songId: Id<"chordChartSongs">) {
  const row = await ctx.db
    .query("chordChartSongBars")
    .withIndex("by_song", (q) => q.eq("songId", songId))
    .unique();
  return row?.bars ?? null;
}

/** One song's full chart data — the only query that ever reads `bars` for a single song,
    fetched lazily once that song is actually selected/displayed in the Chord Charts tool. */
export const getSongBars = query({
  args: { songId: v.id("chordChartSongs") },
  handler: async (ctx, { songId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const song = await ctx.db.get(songId);
    if (!song || song.userId !== userId) return null;
    return barsForSong(ctx, songId);
  },
});

/** Imports one or more songs into the signed-in user's library, creating or merging into a
    playlist named `playlistName` (matched case/whitespace-insensitively — re-importing the same
    iReal playlist later adds to that same playlist rather than duplicating it — the same rule
    `lib/chordChartsLibrary.ts`'s `mergeIntoLibrary` applies for the signed-out/local path), and
    skipping any song already in the library by title/composer/key. Dedup only ever reads song
    *metadata* (`chordChartSongs`), never `chordChartSongBars`, so this stays cheap regardless of
    how large the existing library already is — the read that matters for the original bug
    (importing a *massive* playlist) is the per-song `bars` write below, and each of those is its
    own small document now, not one growing blob. */
export const importSongs = mutation({
  args: {
    playlistName: v.string(),
    songs: v.array(v.object({ ...songMetaValidator, bars: v.any() })),
  },
  handler: async (ctx, { playlistName, songs }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");

    const existingSongs = await ctx.db
      .query("chordChartSongs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const existingKeys = new Set(existingSongs.map(songKey));

    let playlistId: Id<"chordChartPlaylists"> | null = null;
    let added = 0;
    for (const song of songs) {
      const key = songKey(song);
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);

      if (playlistId === null) {
        playlistId = await findOrCreatePlaylist(ctx, userId, playlistName);
      }

      const { bars, ...meta } = song;
      const songId = await ctx.db.insert("chordChartSongs", {
        userId,
        playlistId,
        ...meta,
        createdAt: Date.now(),
      });
      await ctx.db.insert("chordChartSongBars", { songId, bars });
      added++;
    }

    return { added, skipped: songs.length - added };
  },
});

export const deleteSong = mutation({
  args: { songId: v.id("chordChartSongs") },
  handler: async (ctx, { songId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    const song = await ctx.db.get(songId);
    if (!song || song.userId !== userId) return;

    const barsRow = await ctx.db
      .query("chordChartSongBars")
      .withIndex("by_song", (q) => q.eq("songId", songId))
      .unique();
    if (barsRow) await ctx.db.delete(barsRow._id);
    await ctx.db.delete(songId);

    // Drop the playlist too once it has nothing left in it, rather than leaving an empty shell —
    // same rule `lib/chordChartsLibrary.ts`'s `removeSongFromLibrary` applies locally.
    const remaining = await ctx.db
      .query("chordChartSongs")
      .withIndex("by_playlist", (q) => q.eq("playlistId", song.playlistId))
      .first();
    if (!remaining) await ctx.db.delete(song.playlistId);
  },
});

export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    const [playlists, songs] = await Promise.all([
      ctx.db
        .query("chordChartPlaylists")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("chordChartSongs")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    ]);
    for (const song of songs) {
      const barsRow = await ctx.db
        .query("chordChartSongBars")
        .withIndex("by_song", (q) => q.eq("songId", song._id))
        .unique();
      if (barsRow) await ctx.db.delete(barsRow._id);
      await ctx.db.delete(song._id);
    }
    for (const playlist of playlists) await ctx.db.delete(playlist._id);
  },
});

type LegacySong = {
  id: string;
  title: string;
  composer: string;
  style: string;
  key: string;
  timeSignature: { top: number; bottom: number };
  bars: unknown;
};
type LegacyPlaylist = { id: string; name: string; songIds: string[] };

function isLegacySong(value: unknown): value is LegacySong {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.title === "string" && typeof v.composer === "string";
}

function isLegacyPlaylist(value: unknown): value is LegacyPlaylist {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.name === "string" && Array.isArray(v.songIds);
}

/** A one-time migration off the earlier single-blob `syncedSettings` storage this feature used
    before it had its own tables — see the schema's own comment on `chordChartPlaylists` for why
    that had to change. Entirely server-side (the old blob is read from the database here, never
    passed through as a mutation argument), and a no-op whenever there's nothing to migrate:
    already migrated (any row already exists in the new tables for this user) or there was never
    anything synced under the old key. Safe by construction, including for the exact bug this
    exists because of: the old blob could only ever have been successfully *written* if it was
    already under Convex's 1 MiB limit, so reading it back here can't hit that limit either — the
    "massive playlist" failure this fixes only ever happened on a *write* that got rejected before
    anything was saved, never left a too-large value sitting in storage to migrate from. Called
    once per sign-in by `lib/useChordChartsLibrary.ts`. */
export const migrateFromSyncedSettings = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;

    const alreadyMigrated = await ctx.db
      .query("chordChartSongs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (alreadyMigrated) return;

    const old = await ctx.db
      .query("syncedSettings")
      .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("key", LEGACY_SYNCED_SETTINGS_KEY))
      .unique();
    if (!old?.value) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(old.value);
    } catch {
      return;
    }
    if (!parsed || typeof parsed !== "object") return;
    const raw = parsed as Record<string, unknown>;
    const legacySongs = Array.isArray(raw.songs) ? raw.songs.filter(isLegacySong) : [];
    const legacyPlaylists = Array.isArray(raw.playlists) ? raw.playlists.filter(isLegacyPlaylist) : [];
    if (legacySongs.length === 0) return;

    const songsById = new Map(legacySongs.map((s) => [s.id, s]));
    const assigned = new Set<string>();

    async function insertSong(
      forUserId: Id<"users">,
      playlistId: Id<"chordChartPlaylists">,
      song: LegacySong,
    ) {
      const songId = await ctx.db.insert("chordChartSongs", {
        userId: forUserId,
        playlistId,
        title: song.title,
        composer: song.composer,
        style: song.style,
        key: song.key,
        timeSignature: song.timeSignature ?? { top: 4, bottom: 4 },
        createdAt: Date.now(),
      });
      await ctx.db.insert("chordChartSongBars", { songId, bars: song.bars ?? [] });
    }

    for (const playlist of legacyPlaylists) {
      const songs = playlist.songIds.map((id) => songsById.get(id)).filter((s): s is LegacySong => !!s);
      if (songs.length === 0) continue;
      const playlistId = await ctx.db.insert("chordChartPlaylists", {
        userId,
        name: playlist.name || "Imported",
        createdAt: Date.now(),
      });
      for (const song of songs) {
        assigned.add(song.id);
        await insertSong(userId, playlistId, song);
      }
    }

    const orphans = legacySongs.filter((s) => !assigned.has(s.id));
    if (orphans.length > 0) {
      const unsortedId = await ctx.db.insert("chordChartPlaylists", {
        userId,
        name: "Unsorted",
        createdAt: Date.now(),
      });
      for (const song of orphans) await insertSong(userId, unsortedId, song);
    }
  },
});
