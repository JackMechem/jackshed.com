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

/** Every playlist and every chart's *metadata* (no `bars`) for the signed-in user. A chart lives
    once in the library ("All charts"); `playlistIds` lists every playlist it's in — its own
    `playlistId` plus its `chordChartPlaylistEntries` rows (see the schema's comment). `playlistId`
    (the first of those, or "") is still returned for app builds from before charts could be in
    several playlists. */
export const library = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { playlists: [], songs: [] };
    const [playlists, songs, entries] = await Promise.all([
      ctx.db
        .query("chordChartPlaylists")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("chordChartSongs")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
      ctx.db
        .query("chordChartPlaylistEntries")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect(),
    ]);
    // Playlists being deleted are already gone as far as the user is concerned.
    const live = new Set(playlists.filter((p) => !p.deleting).map((p) => p._id as string));
    const extra = new Map<string, string[]>();
    for (const e of entries) {
      if (!live.has(e.playlistId)) continue;
      const list = extra.get(e.songId) ?? [];
      list.push(e.playlistId);
      extra.set(e.songId, list);
    }
    return {
      playlists: playlists.filter((p) => !p.deleting).map((p) => ({ id: p._id, name: p.name })),
      songs: songs.map((s) => {
        const playlistIds = [...new Set([...(s.playlistId && live.has(s.playlistId) ? [s.playlistId as string] : []), ...(extra.get(s._id) ?? [])])];
        return {
          id: s._id,
          playlistId: playlistIds[0] ?? "",
          playlistIds,
          title: s.title,
          composer: s.composer,
          style: s.style,
          key: s.key,
          timeSignature: s.timeSignature,
        };
      }),
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

type SongRow = { _id: Id<"chordChartSongs">; playlistId?: Id<"chordChartPlaylists"> };

/** Whether `song` is in `playlistId` (its own field, or an entry row). */
async function inPlaylist(ctx: QueryCtx, song: SongRow, playlistId: Id<"chordChartPlaylists">) {
  if (song.playlistId === playlistId) return true;
  const entries = await ctx.db
    .query("chordChartPlaylistEntries")
    .withIndex("by_song", (q) => q.eq("songId", song._id))
    .collect();
  return entries.some((e) => e.playlistId === playlistId);
}

/** Puts `song` in `playlistId` if it isn't already — in its own `playlistId` slot when that's
    free, else as an entry row. */
async function addToPlaylistRow(ctx: MutationCtx, userId: Id<"users">, song: SongRow, playlistId: Id<"chordChartPlaylists">) {
  if (await inPlaylist(ctx, song, playlistId)) return;
  if (!song.playlistId || !(await ctx.db.get(song.playlistId))) {
    await ctx.db.patch(song._id, { playlistId });
    return;
  }
  await ctx.db.insert("chordChartPlaylistEntries", { userId, playlistId, songId: song._id, createdAt: Date.now() });
}

async function removeFromPlaylistRow(ctx: MutationCtx, song: SongRow, playlistId: Id<"chordChartPlaylists">) {
  if (song.playlistId === playlistId) await ctx.db.patch(song._id, { playlistId: undefined });
  const entries = await ctx.db
    .query("chordChartPlaylistEntries")
    .withIndex("by_song", (q) => q.eq("songId", song._id))
    .collect();
  for (const e of entries) if (e.playlistId === playlistId) await ctx.db.delete(e._id);
}

/** Imports charts into the signed-in user's library and adds them to the playlist named
    `playlistName` (an existing one matched case/whitespace-insensitively, or a new one). Leave
    `playlistName` out (or empty) to add them to All charts only. A chart already in the library
    (same title/composer/key) isn't duplicated — it's just added to the playlist too (and, with
    `replaceExisting`, overwritten with the incoming version). Dedup reads only metadata, never
    `bars`. */
export const importSongs = mutation({
  args: {
    playlistName: v.optional(v.string()),
    songs: v.array(v.object({ ...songMetaValidator, bars: v.any() })),
    /** Overwrite songs already in the library (same title/composer/key) with the incoming
        version, in place — same id and playlists. Used to re-import a playlist after the importer
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
    const existingByKey = new Map<string, SongRow>(existingSongs.map((s) => [songKey(s), s]));

    const playlistId = playlistName?.trim() ? await findOrCreatePlaylist(ctx, userId, playlistName) : null;
    // What's already in the target playlist, so re-importing doesn't re-check every chart.
    const inTarget = new Set<string>();
    if (playlistId) {
      for (const s of existingSongs) if (s.playlistId === playlistId) inTarget.add(s._id);
      const entries = await ctx.db
        .query("chordChartPlaylistEntries")
        .withIndex("by_playlist", (q) => q.eq("playlistId", playlistId))
        .collect();
      for (const e of entries) inTarget.add(e.songId);
    }

    // The library id each incoming song ended up as (new, or the one already there), in order —
    // lets a caller link what it just imported (e.g. a saved setlist's tunes to their charts).
    const ids: string[] = [];
    let added = 0;
    let updated = 0;
    const replaced = new Set<string>();
    for (const song of songs) {
      const key = songKey(song);
      const existing = existingByKey.get(key);
      if (existing) {
        ids.push(existing._id);
        if (playlistId && !inTarget.has(existing._id)) {
          inTarget.add(existing._id);
          const fresh = await ctx.db.get(existing._id);
          if (fresh) {
            if (!fresh.playlistId || !(await ctx.db.get(fresh.playlistId))) await ctx.db.patch(fresh._id, { playlistId });
            else await ctx.db.insert("chordChartPlaylistEntries", { userId, playlistId, songId: fresh._id, createdAt: Date.now() });
          }
        }
        if (replaceExisting && !replaced.has(key)) {
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

      const { bars, ...meta } = song;
      const songId = await ctx.db.insert("chordChartSongs", {
        userId,
        ...(playlistId ? { playlistId } : {}),
        ...meta,
        createdAt: Date.now(),
      });
      await ctx.db.insert("chordChartSongBars", { songId, bars });
      existingByKey.set(key, { _id: songId, playlistId: playlistId ?? undefined });
      if (playlistId) inTarget.add(songId);
      ids.push(songId);
      added++;
    }

    return { added, updated, skipped: songs.length - added - updated, ids };
  },
});

async function deleteSongAndBars(ctx: MutationCtx, songId: Id<"chordChartSongs">) {
  const barsRow = await ctx.db
    .query("chordChartSongBars")
    .withIndex("by_song", (q) => q.eq("songId", songId))
    .unique();
  if (barsRow) await ctx.db.delete(barsRow._id);
  const entries = await ctx.db
    .query("chordChartPlaylistEntries")
    .withIndex("by_song", (q) => q.eq("songId", songId))
    .collect();
  for (const e of entries) await ctx.db.delete(e._id);
  await ctx.db.delete(songId);
}

/** Deletes a chart from the library — and so from every playlist it was in. Playlists stay, even
    if that leaves one empty. */
export const deleteSong = mutation({
  args: { songId: v.id("chordChartSongs") },
  handler: async (ctx, { songId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    const song = await ctx.db.get(songId);
    if (!song || song.userId !== userId) return;
    await deleteSongAndBars(ctx, songId);
  },
});

/** Saves an edited chart in place — its metadata row and its bars row — keeping its playlists. */
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
    imports match). */
export const createPlaylist = mutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    return findOrCreatePlaylist(ctx, userId, name);
  },
});

/** Adds a chart to the playlist named `playlistName` (existing, or a new one) — it stays in any
    other playlists it's in. */
export const addToPlaylist = mutation({
  args: { songId: v.id("chordChartSongs"), playlistName: v.string() },
  handler: async (ctx, { songId, playlistName }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    const song = await ctx.db.get(songId);
    if (!song || song.userId !== userId) return;
    const target = await findOrCreatePlaylist(ctx, userId, playlistName);
    await addToPlaylistRow(ctx, userId, song, target);
  },
});

/** Takes a chart out of one playlist. The chart itself stays in the library (All charts). */
export const removeFromPlaylist = mutation({
  args: { songId: v.id("chordChartSongs"), playlistId: v.id("chordChartPlaylists") },
  handler: async (ctx, { songId, playlistId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    const song = await ctx.db.get(songId);
    if (!song || song.userId !== userId) return;
    await removeFromPlaylistRow(ctx, song, playlistId);
  },
});

/** Older app builds' "Move to playlist": now means *only* in that playlist. */
export const moveSong = mutation({
  args: { songId: v.id("chordChartSongs"), playlistName: v.string() },
  handler: async (ctx, { songId, playlistName }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    const song = await ctx.db.get(songId);
    if (!song || song.userId !== userId) return;
    const target = await findOrCreatePlaylist(ctx, userId, playlistName);
    const entries = await ctx.db
      .query("chordChartPlaylistEntries")
      .withIndex("by_song", (q) => q.eq("songId", songId))
      .collect();
    for (const e of entries) await ctx.db.delete(e._id);
    await ctx.db.patch(songId, { playlistId: target });
  },
});

const PURGE_BATCH = 200;

/** Deletes a playlist. Its charts stay in the library (All charts) unless `deleteCharts`, which
    also deletes the charts that aren't in any *other* playlist. The playlist disappears at once
    (`deleting`); the work happens in background batches (`purgePlaylist`), since one function can
    only read so much (Convex's 4,096-read limit — a 1,400-chart playlist blew straight through it
    when this did everything in one go). */
export const deletePlaylist = mutation({
  args: { playlistId: v.id("chordChartPlaylists"), deleteCharts: v.optional(v.boolean()) },
  handler: async (ctx, { playlistId, deleteCharts }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    const playlist = await ctx.db.get(playlistId);
    if (!playlist || playlist.userId !== userId) return;
    await ctx.db.patch(playlistId, { deleting: true });
    await ctx.scheduler.runAfter(0, internal.chordCharts.purgePlaylist, { playlistId, deleteCharts: !!deleteCharts });
  },
});

/** Whether a chart is in any live playlist other than `exceptId`. */
async function inOtherPlaylist(ctx: QueryCtx, song: SongRow, exceptId: Id<"chordChartPlaylists">) {
  const ids = [song.playlistId, ...(await ctx.db.query("chordChartPlaylistEntries").withIndex("by_song", (q) => q.eq("songId", song._id)).collect()).map((e) => e.playlistId)];
  for (const id of ids) {
    if (!id || id === exceptId) continue;
    const p = await ctx.db.get(id);
    if (p && !p.deleting) return true;
  }
  return false;
}

export const purgePlaylist = internalMutation({
  args: { playlistId: v.id("chordChartPlaylists"), deleteCharts: v.optional(v.boolean()) },
  handler: async (ctx, { playlistId, deleteCharts }) => {
    const songs = await ctx.db
      .query("chordChartSongs")
      .withIndex("by_playlist", (q) => q.eq("playlistId", playlistId))
      .take(PURGE_BATCH);
    for (const song of songs) {
      if (deleteCharts && !(await inOtherPlaylist(ctx, song, playlistId))) await deleteSongAndBars(ctx, song._id);
      else await ctx.db.patch(song._id, { playlistId: undefined });
    }
    const entries = await ctx.db
      .query("chordChartPlaylistEntries")
      .withIndex("by_playlist", (q) => q.eq("playlistId", playlistId))
      .take(Math.max(0, PURGE_BATCH - songs.length));
    for (const e of entries) {
      const song = await ctx.db.get(e.songId);
      if (deleteCharts && song && !(await inOtherPlaylist(ctx, song, playlistId))) await deleteSongAndBars(ctx, song._id);
      else if (await ctx.db.get(e._id)) await ctx.db.delete(e._id);
    }
    if (songs.length + entries.length >= PURGE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.chordCharts.purgePlaylist, { playlistId, deleteCharts });
    } else if (await ctx.db.get(playlistId)) {
      await ctx.db.delete(playlistId);
    }
  },
});

/** Removes every chart and playlist — in background batches, like `deletePlaylist`. */
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
      await ctx.scheduler.runAfter(0, internal.chordCharts.purgePlaylist, { playlistId: p._id, deleteCharts: true });
    }
    // Charts in no playlist go too.
    await ctx.scheduler.runAfter(0, internal.chordCharts.purgeOrphans, { userId, cursor: null });
  },
});

/** Deletes every chart of `userId` that isn't in a live playlist (part of `clearAll`). */
export const purgeOrphans = internalMutation({
  args: { userId: v.id("users"), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { userId, cursor }) => {
    const page = await ctx.db
      .query("chordChartSongs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .paginate({ numItems: 100, cursor });
    for (const song of page.page) {
      const p = song.playlistId ? await ctx.db.get(song.playlistId) : null;
      if ((!p || p.deleting) && !(await inOtherPlaylist(ctx, song, "" as Id<"chordChartPlaylists">))) await deleteSongAndBars(ctx, song._id);
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
