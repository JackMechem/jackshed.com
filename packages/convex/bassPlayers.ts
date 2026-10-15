import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";

/**
 * Bass Genius's bass players and their transcriptions — private to their owner. `library` lists
 * players with their transcriptions' titles (never the note data); `getTranscription` fetches one
 * transcription's notes for the editor; `saveTranscription` replaces them (the editor autosaves).
 */

const MAX_NAME = 120;
const MAX_TEXT = 4000;

async function me(ctx: QueryCtx | MutationCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Sign in to save bass players.");
  return userId;
}

async function ownPlayer(ctx: QueryCtx | MutationCtx, userId: Id<"users">, playerId: Id<"bassPlayers">) {
  const player = await ctx.db.get(playerId);
  if (!player || player.userId !== userId) throw new Error("That player isn't yours.");
  return player;
}

const measureCount = (data: unknown) => {
  const m = (data as { measures?: unknown[] } | null)?.measures;
  return Array.isArray(m) ? m.length : 0;
};
const titleOf = (data: unknown) => {
  const t = (data as { title?: unknown } | null)?.title;
  return (typeof t === "string" && t.trim() ? t.trim() : "Untitled transcription").slice(0, 200);
};

export const library = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { players: [], transcriptions: [] };
    const players = await ctx.db
      .query("bassPlayers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const transcriptions = await ctx.db
      .query("bassTranscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return {
      players: players.map((p) => ({ id: p._id as string, name: p.name, description: p.description, createdAt: p.createdAt, updatedAt: p.updatedAt })),
      transcriptions: transcriptions.map((t) => ({
        id: t._id as string,
        playerId: t.playerId as string,
        title: t.title,
        measureCount: t.measureCount,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
    };
  },
});

export const createPlayer = mutation({
  args: { name: v.string(), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await me(ctx);
    const now = Date.now();
    const id = await ctx.db.insert("bassPlayers", {
      userId,
      name: args.name.trim().slice(0, MAX_NAME) || "Bass player",
      description: (args.description ?? "").slice(0, MAX_TEXT),
      createdAt: now,
      updatedAt: now,
    });
    return id as string;
  },
});

export const updatePlayer = mutation({
  args: { playerId: v.id("bassPlayers"), name: v.optional(v.string()), description: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await me(ctx);
    await ownPlayer(ctx, userId, args.playerId);
    await ctx.db.patch(args.playerId, {
      ...(args.name !== undefined ? { name: args.name.trim().slice(0, MAX_NAME) || "Bass player" } : {}),
      ...(args.description !== undefined ? { description: args.description.slice(0, MAX_TEXT) } : {}),
      updatedAt: Date.now(),
    });
  },
});

/** Deletes a player and every transcription filed under them. */
export const deletePlayer = mutation({
  args: { playerId: v.id("bassPlayers") },
  handler: async (ctx, args) => {
    const userId = await me(ctx);
    await ownPlayer(ctx, userId, args.playerId);
    const rows = await ctx.db
      .query("bassTranscriptions")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
    await ctx.db.delete(args.playerId);
  },
});

export const getTranscription = query({
  args: { transcriptionId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const id = ctx.db.normalizeId("bassTranscriptions", args.transcriptionId);
    if (!id) return null;
    const row = await ctx.db.get(id);
    if (!row || row.userId !== userId) return null;
    return { id: row._id as string, playerId: row.playerId as string, data: row.data, updatedAt: row.updatedAt };
  },
});

/** Every transcription of one player, notes and all — what Bass Genius analyses to play like them. */
export const playerTranscriptions = query({
  args: { playerId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const playerId = ctx.db.normalizeId("bassPlayers", args.playerId);
    if (!playerId) return null;
    const player = await ctx.db.get(playerId);
    if (!player || player.userId !== userId) return null;
    const rows = await ctx.db
      .query("bassTranscriptions")
      .withIndex("by_player", (q) => q.eq("playerId", playerId))
      .collect();
    return rows.map((r) => ({ id: r._id as string, data: r.data }));
  },
});

export const createTranscription = mutation({
  args: { playerId: v.id("bassPlayers"), data: v.any() },
  handler: async (ctx, args) => {
    const userId = await me(ctx);
    await ownPlayer(ctx, userId, args.playerId);
    const now = Date.now();
    const id = await ctx.db.insert("bassTranscriptions", {
      userId,
      playerId: args.playerId,
      title: titleOf(args.data),
      measureCount: measureCount(args.data),
      data: args.data,
      createdAt: now,
      updatedAt: now,
    });
    return id as string;
  },
});

export const saveTranscription = mutation({
  args: { transcriptionId: v.id("bassTranscriptions"), data: v.any() },
  handler: async (ctx, args) => {
    const userId = await me(ctx);
    const row = await ctx.db.get(args.transcriptionId);
    if (!row || row.userId !== userId) throw new Error("That transcription isn't yours.");
    await ctx.db.patch(args.transcriptionId, {
      data: args.data,
      title: titleOf(args.data),
      measureCount: measureCount(args.data),
      updatedAt: Date.now(),
    });
  },
});

export const moveTranscription = mutation({
  args: { transcriptionId: v.id("bassTranscriptions"), playerId: v.id("bassPlayers") },
  handler: async (ctx, args) => {
    const userId = await me(ctx);
    const row = await ctx.db.get(args.transcriptionId);
    if (!row || row.userId !== userId) throw new Error("That transcription isn't yours.");
    await ownPlayer(ctx, userId, args.playerId);
    await ctx.db.patch(args.transcriptionId, { playerId: args.playerId, updatedAt: Date.now() });
  },
});

export const deleteTranscription = mutation({
  args: { transcriptionId: v.id("bassTranscriptions") },
  handler: async (ctx, args) => {
    const userId = await me(ctx);
    const row = await ctx.db.get(args.transcriptionId);
    if (!row || row.userId !== userId) return;
    await ctx.db.delete(args.transcriptionId);
  },
});
