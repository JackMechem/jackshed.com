import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc } from "./_generated/dataModel";
import { mutation, query, type QueryCtx } from "./_generated/server";

/**
 * The Recorder tool's recordings — private to their owner. Uploading is the usual two steps
 * (`generateUploadUrl`, then POST the file there, then `create` with the returned `storageId`);
 * deleting a recording deletes its file too.
 */

const MAX_NAME = 120;
const MAX_NOTES = 20000;

async function withUrl(ctx: QueryCtx, row: Doc<"recordings">) {
  return {
    _id: row._id,
    name: row.name,
    notes: row.notes,
    durationSec: row.durationSec,
    mimeType: row.mimeType,
    tuneId: row.tuneId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    url: await ctx.storage.getUrl(row.storageId),
  };
}

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to save recordings.");
    return await ctx.storage.generateUploadUrl();
  },
});

export const create = mutation({
  args: {
    storageId: v.id("_storage"),
    name: v.string(),
    notes: v.optional(v.string()),
    durationSec: v.number(),
    mimeType: v.string(),
    tuneId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to save recordings.");
    const now = Date.now();
    return await ctx.db.insert("recordings", {
      userId,
      storageId: args.storageId,
      name: args.name.trim().slice(0, MAX_NAME) || "Recording",
      notes: (args.notes ?? "").slice(0, MAX_NOTES),
      durationSec: Math.max(0, args.durationSec),
      mimeType: args.mimeType,
      ...(args.tuneId ? { tuneId: args.tuneId } : {}),
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Every recording of the caller's, newest first. */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("recordings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    return Promise.all(rows.map((row) => withUrl(ctx, row)));
  },
});

/** The caller's recordings linked to one tune, newest first. */
export const listForTune = query({
  args: { tuneId: v.string() },
  handler: async (ctx, { tuneId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("recordings")
      .withIndex("by_user_tune", (q) => q.eq("userId", userId).eq("tuneId", tuneId))
      .order("desc")
      .collect();
    return Promise.all(rows.map((row) => withUrl(ctx, row)));
  },
});

export const get = query({
  args: { id: v.id("recordings") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    const row = await ctx.db.get(id);
    if (!userId || !row || row.userId !== userId) return null;
    return withUrl(ctx, row);
  },
});

/** Rename, edit notes, or link/unlink a tune (`tuneId: null` unlinks). */
export const update = mutation({
  args: {
    id: v.id("recordings"),
    name: v.optional(v.string()),
    notes: v.optional(v.string()),
    tuneId: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, { id, name, notes, tuneId }) => {
    const userId = await getAuthUserId(ctx);
    const row = await ctx.db.get(id);
    if (!userId || !row || row.userId !== userId) throw new Error("Recording not found.");
    await ctx.db.patch(id, {
      ...(name !== undefined ? { name: name.trim().slice(0, MAX_NAME) || "Recording" } : {}),
      ...(notes !== undefined ? { notes: notes.slice(0, MAX_NOTES) } : {}),
      ...(tuneId !== undefined ? { tuneId: tuneId ?? undefined } : {}),
      updatedAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { id: v.id("recordings") },
  handler: async (ctx, { id }) => {
    const userId = await getAuthUserId(ctx);
    const row = await ctx.db.get(id);
    if (!userId || !row || row.userId !== userId) return;
    await ctx.storage.delete(row.storageId);
    await ctx.db.delete(id);
  },
});
