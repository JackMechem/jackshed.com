import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import type { PublicTune } from "@jam-practice/core/profileTunes";

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
    tune name" in Browse/My Posts. Unlike chord charts' `songTitles`, this needs no denormalized
    schema field: `tunes` is already inline on the post row (small — capped at
    `MAX_TUNES_PER_POST`, nowhere near the `bars`-sized read-cost problem chord charts had to
    avoid), so deriving names from it costs nothing extra to read. */
function tuneNamesOf(tunes: unknown): string[] {
  if (!Array.isArray(tunes)) return [];
  return tunes
    .map((t) => (t && typeof t === "object" ? (t as Record<string, unknown>).name : undefined))
    .filter((name): name is string => typeof name === "string");
}

function summarizePost(row: {
  _id: Id<"communityTunes">;
  title: string;
  description: string;
  tunes: unknown;
  createdAt: number;
}) {
  const tuneNames = tuneNamesOf(row.tunes);
  return {
    id: row._id,
    title: row.title,
    description: row.description,
    tuneCount: Array.isArray(row.tunes) ? row.tunes.length : 0,
    tuneNames,
    createdAt: row.createdAt,
  };
}

/** Posts a tune (one) or a whole tune list (several) to Community — a snapshot of `PublicTune[]`
    already stripped of `notes` client-side (`lib/profileTunes.ts`'s `toPublicTune`), not a live
    reference to the poster's own Tunes list. Same public-profile requirement as
    `communityChordCharts.create`, for the same reason. */
export const create = mutation({
  args: {
    title: v.string(),
    description: v.string(),
    tunes: v.array(v.any()),
  },
  handler: async (ctx, { title, description, tunes }) => {
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
    await ctx.db.insert("communityTunes", {
      userId,
      title: trimmedTitle,
      description: description.trim(),
      tunes,
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
    await ctx.db.delete(id);
  },
});

/** The browse list — every post, newest first, metadata only (title, description, tune count,
    the author's *current* username/avatar), not each post's full tune data — see
    `communityChordCharts.list`'s own comment for the identical reasoning. Requires being signed
    in; browsing doesn't need a public profile of your own, only posting does. */
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
    across everyone, unlike `list`. What "My Posts" (`CommunityTunes.tsx`) shows instead of the
    shared browse list — see `communityChordCharts.mine`'s identical reasoning. */
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

/** A specific user's posts — what a public profile page's "Tunes" (posts) section shows. Same
    rules as `communityChordCharts.listByUser`: browsing needs an account, and the target's
    profile has to currently be `isPublic`, re-checked here rather than trusted from the caller. */
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
    return rows.map(summarizePost).sort((a, b) => b.createdAt - a.createdAt);
  },
});

/** One post's full tune list, fetched only once it's actually opened — `null` if the post doesn't
    exist, or its author's profile isn't currently public, same as `communityChordCharts.get`.
    Except for the post's own author, who can always open it regardless of their profile's current
    `isPublic` — see that function's own comment for why. */
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
      createdAt: row.createdAt,
      authorUsername: profile.username,
      authorAvatarUrl: avatarUrl,
      isMine: row.userId === userId,
    };
  },
});
