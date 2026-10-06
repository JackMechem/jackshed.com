import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

/** Whether a target user's profile is allowed to be looked at by whoever's asking — always true
    for your own account, otherwise only if that profile is public. Mirrors the same rule
    `convex/profiles.ts`'s `getPublicByUsername` already applies to the rest of a profile: a
    private profile's social graph stays private too, not just its tune list. */
async function canViewFollowGraph(
  ctx: QueryCtx,
  callerId: Id<"users"> | null,
  targetUserId: Id<"users">,
): Promise<boolean> {
  if (callerId === targetUserId) return true;
  const profile = await ctx.db
    .query("profiles")
    .withIndex("by_user", (q) => q.eq("userId", targetUserId))
    .unique();
  return profile?.isPublic === true;
}

/** Whether the signed-in caller follows `targetUserId`. `false` while signed out — a visitor
    looking at a public profile just sees a "Follow" button they'd need to sign in to use, same as
    every other signed-in-only action elsewhere in this app (no route protection, the page itself
    stays fully viewable). */
export const followStatus = query({
  args: { targetUserId: v.id("users") },
  handler: async (ctx, { targetUserId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return false;
    const row = await ctx.db
      .query("follows")
      .withIndex("by_pair", (q) => q.eq("followerId", userId).eq("followingId", targetUserId))
      .unique();
    return row !== null;
  },
});

/** Idempotent — following someone you already follow is a no-op, not a duplicate row (checked via
    `by_pair` first). Rejects following yourself. */
export const follow = mutation({
  args: { targetUserId: v.id("users") },
  handler: async (ctx, { targetUserId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    if (userId === targetUserId) throw new Error("Can't follow yourself.");
    const existing = await ctx.db
      .query("follows")
      .withIndex("by_pair", (q) => q.eq("followerId", userId).eq("followingId", targetUserId))
      .unique();
    if (existing) return;
    await ctx.db.insert("follows", {
      followerId: userId,
      followingId: targetUserId,
      createdAt: Date.now(),
    });
  },
});

export const unfollow = mutation({
  args: { targetUserId: v.id("users") },
  handler: async (ctx, { targetUserId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    const existing = await ctx.db
      .query("follows")
      .withIndex("by_pair", (q) => q.eq("followerId", userId).eq("followingId", targetUserId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

/** Resolves a list of user ids down to the `{userId, username, avatarUrl}` of each — what every
    list/count in the UI actually wants to show, rather than bare user ids with no profile info to
    render. Someone with no profile row at all yet still shows up with `username: null` rather
    than being silently filtered out, which would shrink a follow count without explaining why. */
async function resolveProfiles(ctx: QueryCtx, userIds: Id<"users">[]) {
  return Promise.all(
    userIds.map(async (userId) => {
      const profile = await ctx.db
        .query("profiles")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();
      const avatarUrl = profile?.avatarStorageId
        ? await ctx.storage.getUrl(profile.avatarStorageId)
        : null;
      return {
        userId,
        username: profile?.username ?? null,
        avatarUrl,
      };
    }),
  );
}

export const listFollowing = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId: targetUserId }) => {
    const callerId = await getAuthUserId(ctx);
    if (!(await canViewFollowGraph(ctx, callerId, targetUserId))) return [];
    const rows = await ctx.db
      .query("follows")
      .withIndex("by_follower", (q) => q.eq("followerId", targetUserId))
      .collect();
    return resolveProfiles(
      ctx,
      rows.map((r) => r.followingId),
    );
  },
});

export const listFollowers = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId: targetUserId }) => {
    const callerId = await getAuthUserId(ctx);
    if (!(await canViewFollowGraph(ctx, callerId, targetUserId))) return [];
    const rows = await ctx.db
      .query("follows")
      .withIndex("by_following", (q) => q.eq("followingId", targetUserId))
      .collect();
    return resolveProfiles(
      ctx,
      rows.map((r) => r.followerId),
    );
  },
});
