import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
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
    // Playlists being deleted (and their charts) are already gone as far as the user is concerned.
    const live = playlists.filter((p) => !p.deleting);
    const deleting = new Set(playlists.filter((p) => p.deleting).map((p) => p._id));
    return {
      playlists: live.map((p) => ({ id: p._id, name: p.name })),
      songs: songs.filter((s) => !deleting.has(s.playlistId)).map((s) => ({
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
    /** Overwrite songs already in the library (same title/composer/key) with the incoming
        version, in place — same id and playlist. Used to re-import a playlist after the importer
        itself improved, so already-imported charts pick up what it used to miss. */
    replaceExisting: v.optional(v.boolean()),
  },
  handler: async (ctx, { playlistName, songs, replaceExisting }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");

    const existingSongs = await ctx.db
      .query("chordChartSongs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const existingKeys = new Set(existingSongs.map(songKey));
    const existingByKey = new Map(existingSongs.map((s) => [songKey(s), s]));

    let playlistId: Id<"chordChartPlaylists"> | null = null;
    // The library id each incoming song ended up as (new, or the one already there), in order —
    // lets a caller link what it just imported (e.g. a saved setlist's tunes to their charts).
    const ids: string[] = [];
    let added = 0;
    let updated = 0;
    const replaced = new Set<string>();
    for (const song of songs) {
      const key = songKey(song);
      if (existingKeys.has(key)) {
        const existing = existingByKey.get(key);
        ids.push(existing ? existing._id : "");
        if (replaceExisting && existing && !replaced.has(key)) {
          replaced.add(key);
          const { bars, ...meta } = song;
          await ctx.db.patch(existing._id, meta);
          const barsRow = await ctx.db
            .query("chordChartSongBars")
            .withIndex("by_song", (q) => q.eq("songId", existing._id))
            .unique();
          if (barsRow) await ctx.db.patch(barsRow._id, { bars });
          else await ctx.db.insert("chordChartSongBars", { songId: existing._id, bars });
          updated++;
        }
        continue;
      }
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
      existingByKey.set(key, { _id: songId } as (typeof existingSongs)[number]);
      ids.push(songId);
      added++;
    }

    return { added, updated, skipped: songs.length - added - updated, ids };
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

/** Saves an edited chart in place — its metadata row and its bars row — keeping it in whatever
    playlist it's already in. The mobile chart builder's "Edit chart" (reached from a chart's ⋮
    menu) is the caller. */
export const updateSong = mutation({
  args: { songId: v.id("chordChartSongs"), song: v.object({ ...songMetaValidator, bars: v.any() }) },
  handler: async (ctx, { songId, song }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    const existing = await ctx.db.get(songId);
    if (!existing || existing.userId !== userId) throw new Error("That chart isn't in your library.");
    const { bars, ...meta } = song;
    await ctx.db.patch(songId, meta);
    const barsRow = await ctx.db
      .query("chordChartSongBars")
      .withIndex("by_song", (q) => q.eq("songId", songId))
      .unique();
    if (barsRow) await ctx.db.patch(barsRow._id, { bars });
    else await ctx.db.insert("chordChartSongBars", { songId, bars });
  },
});

/** Creates an empty playlist (or returns the existing one with that name, matched the same way
    imports match) — the mobile app's "New → Playlist". Songs are added to it afterwards by
    creating a chart in it or moving charts into it. */
export const createPlaylist = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    return findOrCreatePlaylist(ctx, userId, name);
  },
});

/** Moves one song into the playlist named `playlistName` — an existing one (matched the same
    case/whitespace-insensitive way an import merges into one, via `findOrCreatePlaylist`) or a
    brand-new one if nothing matches. The playlist it left is dropped once empty, same "no empty
    shells" rule `deleteSong` follows. A song whose `playlistId` already dangles (the "Unsorted"
    bucket the client synthesizes) just gets a real one now. */
export const moveSong = mutation({
  args: { songId: v.id("chordChartSongs"), playlistName: v.string() },
  handler: async (ctx, { songId, playlistName }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    const song = await ctx.db.get(songId);
    if (!song || song.userId !== userId) return;
    const target = await findOrCreatePlaylist(ctx, userId, playlistName);
    if (target === song.playlistId) return;
    await ctx.db.patch(songId, { playlistId: target });
    const remaining = await ctx.db
      .query("chordChartSongs")
      .withIndex("by_playlist", (q) => q.eq("playlistId", song.playlistId))
      .first();
    if (!remaining && (await ctx.db.get(song.playlistId))) await ctx.db.delete(song.playlistId);
  },
});

const PURGE_BATCH = 200;

async function deleteSongAndBars(ctx: MutationCtx, songId: Id<"chordChartSongs">) {
  const barsRow = await ctx.db
    .query("chordChartSongBars")
    .withIndex("by_song", (q) => q.eq("songId", songId))
    .unique();
  if (barsRow) await ctx.db.delete(barsRow._id);
  await ctx.db.delete(songId);
}

/** Deletes a playlist and every chart in it (their bars too). The playlist disappears from the
    library immediately (`deleting`); the charts are removed in batches in the background by
    `purgePlaylist`, since one function can only read so much (Convex's 4,096-read limit — a
    1,400-chart playlist blew straight through it when this did everything in one go). Tunes linked
    to one of those charts simply show it as missing afterwards. */
export const deletePlaylist = mutation({
  args: { playlistId: v.id("chordChartPlaylists") },
  handler: async (ctx, { playlistId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    const playlist = await ctx.db.get(playlistId);
    if (!playlist || playlist.userId !== userId) return;
    await ctx.db.patch(playlistId, { deleting: true });
    await ctx.scheduler.runAfter(0, internal.chordCharts.purgePlaylist, { playlistId });
  },
});

export const purgePlaylist = internalMutation({
  args: { playlistId: v.id("chordChartPlaylists") },
  handler: async (ctx, { playlistId }) => {
    const songs = await ctx.db
      .query("chordChartSongs")
      .withIndex("by_playlist", (q) => q.eq("playlistId", playlistId))
      .take(PURGE_BATCH);
    for (const song of songs) await deleteSongAndBars(ctx, song._id);
    if (songs.length === PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.chordCharts.purgePlaylist, { playlistId });
    } else if (await ctx.db.get(playlistId)) {
      await ctx.db.delete(playlistId);
    }
  },
});

/** Removes every chart and playlist — same background batching as `deletePlaylist`. */
export const clearAll = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    const playlists = await ctx.db
      .query("chordChartPlaylists")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    for (const p of playlists) {
      if (!p.deleting) await ctx.db.patch(p._id, { deleting: true });
      await ctx.scheduler.runAfter(0, internal.chordCharts.purgePlaylist, { playlistId: p._id });
    }
    // Charts not in any playlist (the "Unsorted" bucket) go too.
    await ctx.scheduler.runAfter(0, internal.chordCharts.purgeOrphans, { userId, cursor: null });
  },
});

export const purgeOrphans = internalMutation({
  args: { userId: v.id("users"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { userId, cursor }) => {
    const page = await ctx.db
      .query("chordChartSongs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .paginate({ numItems: PURGE_BATCH, cursor });
    for (const song of page.page) {
      if (!(await ctx.db.get(song.playlistId))) await deleteSongAndBars(ctx, song._id);
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.chordCharts.purgeOrphans, { userId, cursor: page.continueCursor });
    }
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
