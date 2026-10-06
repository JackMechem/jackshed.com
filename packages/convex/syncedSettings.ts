import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";

/** The signed-in user's stored value for one settings `key`, or `null` if nothing's been synced
    under that key yet (a brand-new account, or a tool that's never been opened while signed in).
    Also `null` while signed out — callers gate on `useConvexAuth()` themselves, same convention
    as `practiceSessions.list`. */
export const get = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const row = await ctx.db
      .query("syncedSettings")
      .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("key", key))
      .unique();
    return row ? { value: row.value } : null;
  },
});

/** Upserts the signed-in user's value for `key` — the one write path every synced tool's
    `useSyncedSettings`/`useSyncedTunes` call goes through, whatever tool or shape `key` actually
    represents (this function has no idea, and doesn't need to — `value` is opaque JSON from its
    point of view). */
export const set = mutation({
  args: { key: v.string(), value: v.string() },
  handler: async (ctx, { key, value }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    const existing = await ctx.db
      .query("syncedSettings")
      .withIndex("by_user_key", (q) => q.eq("userId", userId).eq("key", key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { value, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("syncedSettings", { userId, key, value, updatedAt: Date.now() });
    }
  },
});
