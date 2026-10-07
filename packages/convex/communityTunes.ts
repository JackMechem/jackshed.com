import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import type { PublicTune } from "@jam-practice/core/profileTunes";
import { resolveLinkedChart } from "./lib/chordCharts";

const MAX_TUNES_PER_POST = 300;
const MAX_LIST = 60;

async function authorProfile(ctx: QueryCtx, userId: Id<"users"> | null) {
  if (!userId) return null;
  return ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .unique();
}

/** `tunes` is stored as `v.any()` (a `PublicTune[]` snapshot, see the schema's own comment), so
    this extracts just the names defensively rather than trusting the shape — used for "search by
    tune name" in Browse/My Posts. Needs no denormalized schema field: `tunes` is already inline
    on the post row (small — capped at `MAX_TUNES_PER_POST`, nowhere near the `bars`-sized
    read-cost problem a chart's own data would be), so deriving names from it costs nothing extra
    to read. */
function tuneNamesOf(tunes: unknown): string[] {
  if (!Array.isArray(tunes)) return [];
  return tunes
    .map((t) => (t && typeof t === "object" ? (t as Record<string, unknown>).name : undefined))
    .filter((name): name is string => typeof name === "string");
}

/** Same idea as `tuneNamesOf`, but reading each tune's own optional `linkedChart.title` instead —
    what a "chord charts" search scope matches against, and what `chartCount` (below) counts.
    Since a chart can only ever reach Community by riding along on a tune (see `communityTunes`'s
    own schema comment — there's no standalone chart-post type anymore), this is also the only
    signal a reader has for "does this post include a chart at all." */
function chartTitlesOf(tunes: unknown): string[] {
  if (!Array.isArray(tunes)) return [];
  return tunes
    .map((t) => (t && typeof t === "object" ? (t as Record<string, unknown>).linkedChart : undefined))
    .map((c) => (c && typeof c === "object" ? (c as Record<string, unknown>).title : undefined))
    .filter((title): title is string => typeof title === "string");
}

function summarizePost(row: {
  _id: Id<"communityTunes">;
  title: string;
  description: string;
  tunes: unknown;
  likeCount?: number;
  unlisted?: boolean;
  createdAt: number;
}) {
  const tuneNames = tuneNamesOf(row.tunes);
  const chartTitles = chartTitlesOf(row.tunes);
  return {
    id: row._id,
    title: row.title,
    description: row.description,
    tuneCount: Array.isArray(row.tunes) ? row.tunes.length : 0,
    tuneNames,
    chartCount: chartTitles.length,
    chartTitles,
    likeCount: row.likeCount ?? 0,
    unlisted: row.unlisted ?? false,
    createdAt: row.createdAt,
  };
}

/** Posts a tune (one) or a whole tune list (several) to Community — this app's **one and only**
    post type (see the schema's own comment on `communityTunes`). A snapshot of `PublicTune[]`
    already stripped of `notes` client-side (`lib/profileTunes.ts`'s `toPublicTune`), not a live
    reference to the poster's own Tunes list. `unlisted` (default `false`) controls whether the
    post shows up in `list`/`listByUser` — see those queries' own comments — without affecting
    anything else: `get` (a direct link), `toggleLike`, and `mine` all treat an unlisted post
    exactly like any other, so posting unlisted only ever removes the post from places people
    *browse*, never from a link the poster chooses to share directly. */
export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    tunes: v.array(v.any()),
    unlisted: v.optional(v.boolean()),
  },
  handler: async (ctx, { title, description, tunes, unlisted }) => {
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
    if (tunes.length === 0) throw new Error("Pick at least one tune to post.");
    if (tunes.length > MAX_TUNES_PER_POST) {
      throw new Error(
        `Posts are limited to ${MAX_TUNES_PER_POST} tunes — split a bigger list into more than one post.`,
      );
    }
    // Each tune's own `chordChartId` (see `@jam-practice/core/profileTunes`'s own doc comment) is
    // resolved here, scoped to the *poster's own* `userId` — the only id that's ever meaningful
    // for it, since it's always a reference into the poster's own private chord-chart library —
    // into a full snapshot, then stripped either way, so nothing not-publicly-meaningful ever
    // lands in a stored post.
    const resolvedTunes = await Promise.all(
      (tunes as PublicTune[]).map(async ({ chordChartId, ...tune }) => {
        const linkedChart = await resolveLinkedChart(ctx, userId, chordChartId);
        return linkedChart ? { ...tune, linkedChart } : tune;
      }),
    );
    return await ctx.db.insert("communityTunes", {
      userId,
      title: trimmedTitle,
      description: description.trim(),
      tunes: resolvedTunes,
      unlisted: unlisted ?? false,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("communityTunes") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) throw new Error("Post not found.");
    // Cascade-delete this post's own likes first — they're a separate table, so they'd otherwise
    // be left behind as orphans once the post row itself is gone (same reasoning `account.ts`'s
    // own `performDelete` already applies to every other per-row child table in this app).
    const likes = await ctx.db
      .query("communityTuneLikes")
      .withIndex("by_post", (q) => q.eq("postId", id))
      .collect();
    for (const like of likes) await ctx.db.delete(like._id);
    await ctx.db.delete(id);
  },
});

/** Toggles whether the signed-in caller has liked `id` — idempotent by construction (`by_user_post`
    is checked first, so a double-tap can't double-count either direction) and keeps the post's own
    denormalized `likeCount` in sync in the same mutation, so a reader never sees the count and the
    like-row table disagree. There's no privacy re-check beyond "the post still exists" — liking
    isn't exposing anything about the post that the caller didn't already have to be able to see
    (its id) to call this in the first place, the same trust boundary `importIntoLibrary`-style
    actions already apply elsewhere in this app. Returns the new `liked` state so the client can
    update optimistically without waiting on the query to re-settle, though in practice Convex's
    own reactivity does that near-instantly anyway. */
export const toggleLike = mutation({
  args: { id: v.id("communityTunes") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to like posts.");
    const post = await ctx.db.get(id);
    if (!post) throw new Error("Post not found.");
    const existing = await ctx.db
      .query("communityTuneLikes")
      .withIndex("by_user_post", (q) => q.eq("userId", userId).eq("postId", id))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      await ctx.db.patch(id, { likeCount: Math.max(0, (post.likeCount ?? 0) - 1) });
      return { liked: false };
    }
    await ctx.db.insert("communityTuneLikes", { userId, postId: id, createdAt: Date.now() });
    await ctx.db.patch(id, { likeCount: (post.likeCount ?? 0) + 1 });
    return { liked: true };
  },
});

/** The ids of every post the signed-in caller has liked — nothing else (never who else liked
    anything, never a post's own full like list, per the schema's own comment on
    `communityTuneLikes`). Callers that render a list of posts fetch this once and cross-reference
    it locally to decide each row's own heart state, rather than each `PostListItem` subscribing to
    its own per-post "did I like this" query. */
export const myLikes = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("communityTuneLikes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.map((r) => r.postId);
  },
});

/** Every post the signed-in caller has liked, most-recently-liked first — what the heart button in
    the top-left of Community's own header opens. Same privacy rule as every other read here (a
    post is dropped once its author's profile isn't public anymore, except for the caller's own
    posts, which always stay visible to them) — a like surviving on a post you can no longer see
    just means that post silently doesn't show up here either, nothing to clean up specially. */
export const likedPosts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const likeRows = await ctx.db
      .query("communityTuneLikes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const sorted = [...likeRows].sort((a, b) => b.createdAt - a.createdAt);
    const results = [];
    for (const like of sorted) {
      const row = await ctx.db.get(like.postId);
      if (!row) continue;
      const profile = await authorProfile(ctx, row.userId);
      if (!profile || (row.userId !== userId && !profile.isPublic)) continue;
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

/** The browse list — every *listed* post (see `communityTunes`'s own schema comment on
    `unlisted`), newest first, metadata only (title, description, tune/chart counts and names, the
    author's *current* username/avatar), not each post's full tune data — capped (`MAX_LIST`)
    since this reads every recent post's row to re-check its author's current `isPublic` status,
    not something that should scale with the whole table. Requires being signed in; browsing
    doesn't need a public profile of your own, only posting does. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("communityTunes")
      .withIndex("by_createdAt")
      .order("desc")
      .take(MAX_LIST);
    const results = [];
    for (const row of rows) {
      if (row.unlisted) continue;
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

/** Every post the signed-in caller has posted, newest first — not capped at the 60 most recent
    across everyone, unlike `list`, since an older post of your own could otherwise silently fall
    out of `list`'s window once enough other people have posted more recently. What "My Posts"
    shows instead of the shared browse list. **Includes unlisted posts** — unlike `list`/
    `listByUser`, this is never a browsing surface for anyone but the poster themselves, so there's
    nothing for "unlisted" to hide here; it's the one place a poster can find/manage/re-share an
    unlisted post of their own again. */
export const mine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("communityTunes")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.map(summarizePost).sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** A specific user's posts — what a public profile page's "Posts" section shows. Browsing needs
    an account, and the target's profile has to currently be `isPublic`, re-checked here rather
    than trusted from the caller, even though the only real call site already checked it once via
    `getPublicByUsername` before ever reaching this. Drops unlisted posts, same as `list` — a
    profile page is still a *public, browsable* surface, exactly what "unlisted" means to opt out
    of; the post is still reachable by whoever actually has its direct link (`get`, untouched). */
export const listByUser = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId: targetUserId }) => {
    const callerId = await getAuthUserId(ctx);
    if (!callerId) return [];
    const profile = await authorProfile(ctx, targetUserId);
    if (!profile?.isPublic) return [];
    const rows = await ctx.db
      .query("communityTunes")
      .withIndex("by_user", (q) => q.eq("userId", targetUserId))
      .collect();
    return rows
      .filter((row) => !row.unlisted)
      .map(summarizePost)
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** One post's full tune list, fetched only once it's actually opened — `null` if the post doesn't
    exist, or its author's profile isn't currently public. Except for the post's own author, who
    can always open (and so manage/delete) their own post regardless of their profile's current
    `isPublic` — a private profile hides your posts from everyone *else*, it was never meant to
    lock you out of your own "My Posts" list too. **Doesn't check `unlisted` at all** — that's the
    whole point of an unlisted post: it's not in `list`/`listByUser` to be *found*, but a direct
    link (what "Share" on a post copies) still works for anyone signed in, same as a listed one. */
export const get = query({
  args: { id: v.id("communityTunes") },
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
    return {
      id: row._id,
      title: row.title,
      description: row.description,
      tunes: row.tunes as PublicTune[],
      likeCount: row.likeCount ?? 0,
      unlisted: row.unlisted ?? false,
      createdAt: row.createdAt,
      authorUsername: profile.username,
      authorAvatarUrl: avatarUrl,
      isMine: row.userId === userId,
    };
  },
});
