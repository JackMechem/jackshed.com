import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import { normalizeUsername, usernameError } from "@jam-practice/core/username";
import { resolvePublicTunes } from "@jam-practice/core/profileTunes";
import { TUNES_TO_LEARN_KEY } from "@jam-practice/core/tunesToLearn";

const TUNES_SYNCED_SETTINGS_KEY = "tunes";

/** The signed-in user's own profile row, or `null` if they've never saved one yet. Unlike
    `getPublicByUsername` below, this doesn't check `isPublic` — it's always your own data. */
export const getMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const row = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!row) return null;
    const avatarUrl = row.avatarStorageId ? await ctx.storage.getUrl(row.avatarStorageId) : null;
    return { ...row, avatarUrl };
  },
});

/** Whether `username` is free to take — case-insensitive by construction (normalized before
    comparing), excluding the caller's own current username (so re-saving your own unchanged
    username never reports itself as taken). `false` while signed out (nothing to exclude, and
    nothing to save anyway) rather than throwing, so the editor can call this for live feedback
    without first checking sign-in state itself. */
export const usernameAvailable = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const userId = await getAuthUserId(ctx);
    const normalized = normalizeUsername(username);
    if (usernameError(normalized) !== null) return false;
    const existing = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", normalized))
      .unique();
    if (!existing) return true;
    return userId !== null && existing.userId === userId;
  },
});

/** Creates or updates the caller's profile — the one write path for username, avatar-adjacent
    metadata isn't here (see `setAvatar`/`removeAvatar`), instruments, and the public/private
    toggle. There's no tune selection to save here — a public profile always shows *every* tune in
    the owner's own tune lists (see `getPublicByUsername`), not a curated subset, per an explicit
    request to stop asking which tunes to show. Re-validates the username server-side (the
    editor's own live check is a convenience, never trusted alone) and re-checks uniqueness at the
    moment of saving, since another user could have taken it in between. */
export const upsertProfile = mutation({
  args: {
    username: v.string(),
    instruments: v.array(v.string()),
    isPublic: v.boolean(),
  },
  handler: async (ctx, { username, instruments, isPublic }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    const normalized = normalizeUsername(username);
    const error = usernameError(normalized);
    if (error) throw new Error(error);

    const existingByUsername = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", normalized))
      .unique();
    if (existingByUsername && existingByUsername.userId !== userId) {
      throw new Error("That username is already taken.");
    }

    const mine = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    const fields = {
      username: normalized,
      instruments: instruments.map((i) => i.trim()).filter((i) => i.length > 0),
      isPublic,
      updatedAt: Date.now(),
    };
    if (mine) {
      await ctx.db.patch(mine._id, fields);
    } else {
      await ctx.db.insert("profiles", { userId, ...fields });
    }
  },
});

/** Sets just the caller's username — the minimal-field counterpart to `upsertProfile`, used by the
    mandatory "pick a username" prompt (`components/UsernamePrompt.tsx`) shown to any signed-in
    user who doesn't have one yet (usernames are required, but Convex Auth's own sign-up/Google
    flow has no field for one, so this is enforced as a follow-up step rather than part of sign-up
    itself). Creates the profile row (private, no instruments) if none exists yet, or patches just
    the username onto an existing one — never touches `instruments`/`isPublic` on a row that
    already exists (e.g. from `setAvatar` running first), so claiming a username here can't
    accidentally undo profile settings already saved elsewhere. Re-validates/re-checks uniqueness
    the same way `upsertProfile` does — this is a second entry point to the same `username` field,
    not a second set of rules for it. */
export const claimUsername = mutation({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    const normalized = normalizeUsername(username);
    const error = usernameError(normalized);
    if (error) throw new Error(error);

    const existingByUsername = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", normalized))
      .unique();
    if (existingByUsername && existingByUsername.userId !== userId) {
      throw new Error("That username is already taken.");
    }

    const mine = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (mine) {
      await ctx.db.patch(mine._id, { username: normalized, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("profiles", {
        userId,
        username: normalized,
        instruments: [],
        isPublic: false,
        updatedAt: Date.now(),
      });
    }
  },
});

/** Step 1 of the avatar upload flow: a one-time URL the browser uploads the resized image file
    to directly (standard Convex file-upload pattern), returning a `storageId` once that succeeds
    — see `setAvatar` for step 2, which actually attaches that id to the profile. */
export const generateAvatarUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    return await ctx.storage.generateUploadUrl();
  },
});

/** Step 2: attaches an already-uploaded file's `storageId` to the caller's profile (creating the
    profile row if this is somehow called before `upsertProfile` ever ran — shouldn't normally
    happen since the editor always saves the rest of the profile too, but this stays correct
    either way). Deletes the previous avatar's stored file first, if there was one, so old uploads
    don't just pile up unreferenced every time someone changes their picture. */
export const setAvatar = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    const mine = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (mine?.avatarStorageId) await ctx.storage.delete(mine.avatarStorageId);
    if (mine) {
      await ctx.db.patch(mine._id, { avatarStorageId: storageId, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("profiles", {
        userId,
        username: "",
        instruments: [],
        isPublic: false,
        avatarStorageId: storageId,
        updatedAt: Date.now(),
      });
    }
  },
});

export const removeAvatar = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in");
    const mine = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .unique();
    if (!mine?.avatarStorageId) return;
    await ctx.storage.delete(mine.avatarStorageId);
    await ctx.db.patch(mine._id, { avatarStorageId: undefined, updatedAt: Date.now() });
  },
});

/** The one query in this app that reads across users' data by design: a public profile page
    (`app/u/[username]/page.tsx`), reachable by anyone, signed in or not. Returns `null` for a
    username that doesn't exist *or* isn't public — deliberately the same response either way, so
    a visitor can't distinguish "no such user" from "that profile is private" by probing usernames.
    `tunes` and `tunesToLearn` are resolved via `resolvePublicTunes` (`lib/profileTunes.ts`)
    against the profile owner's own `syncedSettings` "tunes"/"tunesToLearn" rows — *every* tune in
    each list, not a curated subset (there's nothing to opt into anymore — see `upsertProfile`),
    and never `notes` (which could hold private practice notes). */
export const getPublicByUsername = query({
  args: { username: v.string() },
  handler: async (ctx, { username }) => {
    const normalized = normalizeUsername(username);
    const row = await ctx.db
      .query("profiles")
      .withIndex("by_username", (q) => q.eq("username", normalized))
      .unique();
    if (!row || !row.isPublic) return null;

    const avatarUrl = row.avatarStorageId ? await ctx.storage.getUrl(row.avatarStorageId) : null;
    const [tunesRow, tunesToLearnRow] = await Promise.all([
      ctx.db
        .query("syncedSettings")
        .withIndex("by_user_key", (q) =>
          q.eq("userId", row.userId).eq("key", TUNES_SYNCED_SETTINGS_KEY),
        )
        .unique(),
      ctx.db
        .query("syncedSettings")
        .withIndex("by_user_key", (q) => q.eq("userId", row.userId).eq("key", TUNES_TO_LEARN_KEY))
        .unique(),
    ]);

    return {
      userId: row.userId,
      username: row.username,
      instruments: row.instruments,
      avatarUrl,
      tunes: resolvePublicTunes(tunesRow?.value),
      tunesToLearn: resolvePublicTunes(tunesToLearnRow?.value),
    };
  },
});

/** Public profiles whose username starts with `query` (normalized the same way as everywhere
    else) — username-only search, not instrument/tune, per an explicit scoping call. A plain scan
    over public profiles rather than a dedicated search index: this is a small personal-project
    directory, not a large-scale service, so this stays simple until it's ever actually a
    performance problem. Capped at 30 results. */
export const search = query({
  args: { query: v.string() },
  handler: async (ctx, { query: rawQuery }) => {
    const normalized = normalizeUsername(rawQuery);
    if (normalized.length === 0) return [];
    const all = await ctx.db
      .query("profiles")
      .filter((q) => q.eq(q.field("isPublic"), true))
      .collect();
    const matches = all.filter((row) => row.username.startsWith(normalized)).slice(0, 30);
    return Promise.all(
      matches.map(async (row) => ({
        userId: row.userId,
        username: row.username,
        instruments: row.instruments,
        avatarUrl: row.avatarStorageId ? await ctx.storage.getUrl(row.avatarStorageId) : null,
      })),
    );
  },
});
