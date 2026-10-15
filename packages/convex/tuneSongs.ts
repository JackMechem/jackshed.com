import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";

/**
 * A tune's song: an audio file of the actual recording, uploaded to play behind your takes of
 * that tune (see `recordings.mix`). One per tune, private to its owner. Upload the file with
 * `recordings.generateUploadUrl`, then `set` it; replacing or removing one deletes the old file.
 */

const MAX_NAME = 200;

/** The song for one of the caller's tunes, with a playable URL, or null. */
export const getForTune = query({
  args: { tuneId: v.string() },
  handler: async (ctx, { tuneId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const row = await ctx.db
      .query("tuneSongs")
      .withIndex("by_user_tune", (q) => q.eq("userId", userId).eq("tuneId", tuneId))
      .first();
    if (!row) return null;
    return {
      _id: row._id,
      tuneId: row.tuneId,
      name: row.name,
      mimeType: row.mimeType,
      durationSec: row.durationSec,
      createdAt: row.createdAt,
      url: await ctx.storage.getUrl(row.storageId),
    };
  },
});

export const set = mutation({
  args: {
    tuneId: v.string(),
    storageId: v.id("_storage"),
    name: v.string(),
    mimeType: v.string(),
    durationSec: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to add a song.");
    const existing = await ctx.db
      .query("tuneSongs")
      .withIndex("by_user_tune", (q) => q.eq("userId", userId).eq("tuneId", args.tuneId))
      .collect();
    for (const row of existing) {
      await ctx.storage.delete(row.storageId);
      await ctx.db.delete(row._id);
    }
    return await ctx.db.insert("tuneSongs", {
      userId,
      tuneId: args.tuneId,
      storageId: args.storageId,
      name: args.name.trim().slice(0, MAX_NAME) || "Song",
      mimeType: args.mimeType,
      durationSec: Math.max(0, args.durationSec),
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { tuneId: v.string() },
  handler: async (ctx, { tuneId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return;
    const rows = await ctx.db
      .query("tuneSongs")
      .withIndex("by_user_tune", (q) => q.eq("userId", userId).eq("tuneId", tuneId))
      .collect();
    for (const row of rows) {
      await ctx.storage.delete(row.storageId);
      await ctx.db.delete(row._id);
    }
  },
});
