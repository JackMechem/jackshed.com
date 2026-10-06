import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { findOrCreatePlaylist, songKey } from "./lib/chordCharts";

// A generous sanity bound, not a measured one — high enough to comfortably cover "the whole real
// book" scale (the case this was raised for: a single post of ~1,400 jazz standards), while still
// bounding the worst case for how many documents one `create`/`importIntoLibrary` call ever reads
// or writes in a single transaction.
const MAX_SONGS_PER_POST = 3000;
const MAX_LIST = 60;

async function authorProfile(ctx: QueryCtx, userId: Id<"users"> | null) {
  if (!userId) return null;
  return ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

function summarizePost(row: {
  _id: Id<"communityChordCharts">;
  title: string;
  description: string;
  songCount: number;
  songTitles?: string[];
  createdAt: number;
}) {
  return {
    id: row._id,
    title: row.title,
    description: row.description,
    songCount: row.songCount,
    songTitles: row.songTitles ?? [],
    createdAt: row.createdAt,
  };
}

/** Posts a chord chart (one song) or a whole playlist (several, up to `MAX_SONGS_PER_POST`) to
    Community. Takes only `songIds` — ids the caller's own Chord Charts library already assigned
    (`chordChartSongs`) — never the songs' own data; the actual copy into
    `communityChordChartSongs` happens entirely server-side, one small row per song, so posting a
    huge playlist never has to move its (often many-MB) bar data through the client at all, and
    never has to hold it all in one document either — the two failure modes a single-blob version
    of this table hit for real at exactly this scale (see the schema's own comment). Requires the
    caller's own profile to be `isPublic` — posting under a private/nonexistent profile would put
    content out in the world with no author page anyone could actually find. Silently skips a
    songId that doesn't exist or isn't the caller's own, rather than failing the whole post over
    one bad id — mirrors `chordCharts.importSongs`' own tolerance. */
export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    songIds: v.array(v.id("chordChartSongs")),
  },
  handler: async (ctx, { title, description, songIds }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    const profile = await authorProfile(ctx, userId);
    if (!profile?.isPublic) {
      throw new Error(
        "Make your profile public (Account → Public Profile) before posting to Community.",
      );
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) throw new Error("Give this post a title.");
    if (songIds.length === 0) throw new Error("Pick at least one chart to post.");
    if (songIds.length > MAX_SONGS_PER_POST) {
      throw new Error(
        `Posts are limited to ${MAX_SONGS_PER_POST} charts — split a bigger playlist into more than one post.`,
      );
    }

    const postId = await ctx.db.insert("communityChordCharts", {
      userId,
      title: trimmedTitle,
      description: description.trim(),
      songCount: 0,
      songTitles: [],
      createdAt: Date.now(),
    });

    let songCount = 0;
    const songTitles: string[] = [];
    for (const songId of songIds) {
      const song = await ctx.db.get(songId);
      if (!song || song.userId !== userId) continue;
      const barsRow = await ctx.db
        .query("chordChartSongBars")
        .withIndex("by_song", (q) => q.eq("songId", songId))
        .unique();
      await ctx.db.insert("communityChordChartSongs", {
        postId,
        title: song.title,
        composer: song.composer,
        style: song.style,
        key: song.key,
        timeSignature: song.timeSignature,
        bars: barsRow?.bars ?? [],
      });
      songTitles.push(song.title);
      songCount++;
    }

    if (songCount === 0) {
      await ctx.db.delete(postId);
      throw new Error("Couldn't find those charts in your library.");
    }
    await ctx.db.patch(postId, { songCount, songTitles });
  },
});

async function deletePostSongs(ctx: MutationCtx, postId: Id<"communityChordCharts">) {
  const songs = await ctx.db
    .query("communityChordChartSongs")
    .withIndex("by_post", (q) => q.eq("postId", postId))
    .collect();
  for (const song of songs) await ctx.db.delete(song._id);
}

export const remove = mutation({
  args: { id: v.id("communityChordCharts") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) throw new Error("Post not found.");
    await deletePostSongs(ctx, id);
    await ctx.db.delete(id);
  },
});

/** The browse list — every post, newest first, with just enough to render a row (title,
    description, `songCount`, the author's *current* username/avatar) — never any song data
    itself, so this stays cheap regardless of how large any individual post is. Requires being
    signed in — any account, not necessarily a public profile of your own (that's only required to
    post, not to browse — see `create`). A post whose author's profile isn't (or is no longer)
    public is left out, same privacy rule as every other cross-user read in this app. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("communityChordCharts")
      .withIndex("by_createdAt")
      .order("desc")
      .take(MAX_LIST);
    const results = [];
    for (const row of rows) {
      const profile = await authorProfile(ctx, row.userId);
      if (!profile?.isPublic) continue;
      const avatarUrl = profile.avatarStorageId
        ? await ctx.storage.getUrl(profile.avatarStorageId)
        : null;
      results.push({
        ...summarizePost(row),
        authorUsername: profile.username,
        authorAvatarUrl: avatarUrl,
        isMine: row.userId === userId,
      });
    }
    return results;
  },
});

/** Every post the signed-in caller has posted, newest first — unlike `list`, not capped at the
    60 most recent across *everyone*, so a post can't silently fall off this view just because
    other people have posted more recently. What "My Posts" (`CommunityChordCharts.tsx`) shows
    instead of the shared browse list. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("communityChordCharts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.map(summarizePost).sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** A specific user's posts — what a public profile page's "Chord Charts" section shows. Same
    signed-in-required rule as `list`/`mine` (browsing needs an account, even someone else's
    posts), plus the target's profile has to currently be `isPublic` — the profile page itself
    already only reaches this once `getPublicByUsername` has confirmed that, but this re-checks
    independently rather than trusting the caller, same as every other cross-user read here. */
export const listByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId: targetUserId }) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) return [];
    const profile = await authorProfile(ctx, targetUserId);
    if (!profile?.isPublic) return [];
    const rows = await ctx.db
      .query("communityChordCharts")
      .withIndex("by_user", (q) => q.eq("userId", targetUserId))
      .collect();
    return rows.map(summarizePost).sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** A post's own song list, once opened — *metadata only* (title/composer/style/key/time
    signature, no `bars`), the same "list cheaply, fetch one thing's bars lazily" split
    `chordCharts.ts`'s `library`/`getSongBars` already use for the personal library. A post of
    ~1,400 songs returning all of their metadata here is still small (comparable to the personal
    library's own listing at the same scale); it's specifically `bars` that has to stay out of
    any "list N songs" response — see `getSongBars` below for previewing one song's actual chart,
    and `importIntoLibrary` for copying some or all of them into the viewer's own library, neither
    of which ever needs this query to carry bar data too. Same signed-in-required/
    author-still-public rules as `list`; `null` for a post that doesn't exist, or whose author
    isn't currently public, so a viewer can't distinguish those two by probing ids. **Except for
    the post's own author**, who can always open it regardless of their profile's current
    `isPublic` — otherwise going private would make "My Posts" (`mine` above) list posts its own
    owner couldn't actually open, a real gap this closes; `remove` already worked this way
    (scoped purely by ownership, no `isPublic` check at all). */
export const get = query({
  args: { id: v.id("communityChordCharts") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const row = await ctx.db.get(id);
    if (!row) return null;
    const profile = await authorProfile(ctx, row.userId);
    if (!profile || (row.userId !== userId && !profile.isPublic)) return null;
    const avatarUrl = profile.avatarStorageId
      ? await ctx.storage.getUrl(profile.avatarStorageId)
      : null;
    const songs = await ctx.db
      .query("communityChordChartSongs")
      .withIndex("by_post", (q) => q.eq("postId", id))
      .collect();
    return {
      id: row._id,
      title: row.title,
      description: row.description,
      songs: songs.map((s) => ({
        id: s._id,
        title: s.title,
        composer: s.composer,
        style: s.style,
        key: s.key,
        timeSignature: s.timeSignature,
      })),
      createdAt: row.createdAt,
      authorUsername: profile.username,
      authorAvatarUrl: avatarUrl,
      isMine: row.userId === userId,
    };
  },
});

/** One song's full chart data (with `bars`) within a post — fetched lazily, only for whichever
    one song is currently expanded for preview in `PostDetailModal`, mirroring
    `chordCharts.getSongBars`. Re-derives the post's author and re-checks `isPublic` from the
    song's own `postId` rather than trusting the caller already passed a legitimate id, same
    privacy rule every other read here applies. */
export const getSongBars = query({
  args: { songId: v.id("communityChordChartSongs") },
  handler: async (ctx, { songId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const song = await ctx.db.get(songId);
    if (!song) return null;
    const post = await ctx.db.get(song.postId);
    if (!post) return null;
    const profile = await authorProfile(ctx, post.userId);
    if (!profile || (post.userId !== userId && !profile.isPublic)) return null;
    return song.bars;
  },
});

/** Imports some or all of a post's songs into the *caller's own* Chord Charts library — either
    every song in the post (`songIds` omitted, the "Import all" action) or a specific subset (a
    single song's own "Import" button). Like `create` above, this never moves bar data through the
    client: it reads straight from `communityChordChartSongs` and writes straight into the
    caller's `chordChartSongs`/`chordChartSongBars`, entirely server-side. Lands in a playlist
    named after the post (`findOrCreatePlaylist`) and skips anything the caller's library already
    has by title/composer/key (`songKey`) — the same playlist-naming and dedupe rules
    `chordCharts.importSongs` applies for every other way of adding to a library, reused here via
    the shared `convex/lib/chordCharts.ts` helpers rather than a second copy of that logic. */
export const importIntoLibrary = mutation({
  args: {
    postId: v.id("communityChordCharts"),
    songIds: v.optional(v.array(v.id("communityChordChartSongs"))),
  },
  handler: async (ctx, { postId, songIds }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    const post = await ctx.db.get(postId);
    if (!post) throw new Error("Post not found.");
    const profile = await authorProfile(ctx, post.userId);
    if (!profile || (post.userId !== userId && !profile.isPublic)) {
      throw new Error("Post not found.");
    }

    const sourceSongs = songIds
      ? (await Promise.all(songIds.map((id) => ctx.db.get(id)))).filter(
          (s): s is NonNullable<typeof s> => s !== null && s.postId === postId,
        )
      : await ctx.db
          .query("communityChordChartSongs")
          .withIndex("by_post", (q) => q.eq("postId", postId))
          .collect();
    if (sourceSongs.length === 0) return { added: 0, skipped: 0 };

    const existingSongs = await ctx.db
      .query("chordChartSongs")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const existingKeys = new Set(existingSongs.map(songKey));

    let playlistId: Id<"chordChartPlaylists"> | null = null;
    let added = 0;
    for (const song of sourceSongs) {
      const key = songKey(song);
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);

      if (playlistId === null) {
        playlistId = await findOrCreatePlaylist(ctx, userId, post.title);
      }

      const newSongId = await ctx.db.insert("chordChartSongs", {
        userId,
        playlistId,
        title: song.title,
        composer: song.composer,
        style: song.style,
        key: song.key,
        timeSignature: song.timeSignature,
        createdAt: Date.now(),
      });
      await ctx.db.insert("chordChartSongBars", { songId: newSongId, bars: song.bars });
      added++;
    }

    return { added, skipped: sourceSongs.length - added };
  },
});
