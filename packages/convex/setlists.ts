import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation, query } from "./_generated/server";
import type { PublicTune } from "@jam-practice/core/profileTunes";
import { resolveLinkedChart } from "./lib/chordCharts";
import { liveSetlist } from "./lib/setlists";

const MAX_TUNES = 300;

/** Shares a setlist by link. With `setlistId`, the link always shows that setlist as it is now
    (read live in `getShared`), so editing it never needs a re-share. Also stores a snapshot — each tune's linked chord chart
    resolved against the caller's own library, `chordChartId` and `notes` never stored — and returns
    its id, the link's last segment. Passing the `shareId` from an earlier share updates that same
    row, so the link already sent out keeps working. */
export const share = mutation({
  args: {
    shareId: v.optional(v.id("sharedSetlists")),
    setlistId: v.optional(v.string()),
    title: v.string(),
    description: v.string(),
    tunes: v.array(v.any()),
  },
  handler: async (ctx, { shareId, setlistId, title, description, tunes }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Sign in to share a setlist by link.");
    if (tunes.length > MAX_TUNES) throw new Error(`Shared setlists are limited to ${MAX_TUNES} tunes.`);
    const resolved = await Promise.all(
      (tunes as PublicTune[]).map(async ({ chordChartId, ...tune }) => {
        const { notes: _notes, ...rest } = tune as PublicTune & { notes?: string };
        const linkedChart = await resolveLinkedChart(ctx, userId, chordChartId);
        return linkedChart ? { ...rest, linkedChart } : rest;
      }),
    );
    const data = {
      title: title.trim() || "Setlist",
      description: description.trim(),
      tunes: resolved,
      ...(setlistId ? { setlistId } : {}),
      updatedAt: Date.now(),
    };
    if (shareId) {
      const existing = await ctx.db.get(shareId);
      if (existing && existing.userId === userId) {
        await ctx.db.patch(shareId, data);
        return shareId;
      }
    }
    return ctx.db.insert("sharedSetlists", { userId, ...data, createdAt: Date.now() });
  },
});

/** Stops sharing: the link stops working. */
export const unshare = mutation({
  args: { shareId: v.id("sharedSetlists") },
  handler: async (ctx, { shareId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not signed in.");
    const row = await ctx.db.get(shareId);
    if (row && row.userId === userId) await ctx.db.delete(shareId);
  },
});

/** A shared setlist, for anyone with the link — no sign-in needed. `null` if the id is malformed
    or the setlist was unshared. */
export const getShared = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const shareId = ctx.db.normalizeId("sharedSetlists", id);
    if (!shareId) return null;
    const row = await ctx.db.get(shareId);
    if (!row) return null;
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_user", (q) => q.eq("userId", row.userId))
      .unique();
    const viewer = await getAuthUserId(ctx);
    // Always the setlist as it is now; the stored snapshot only if it's been deleted.
    const live = row.setlistId ? await liveSetlist(ctx, row.userId, row.setlistId, "full") : null;
    return {
      id: row._id,
      title: live?.title ?? row.title,
      description: live?.description ?? row.description,
      tunes: (live?.tunes ?? row.tunes) as PublicTune[],
      updatedAt: row.updatedAt,
      // Only a public profile's username is shown; a private one stays anonymous.
      ownerUsername: profile?.isPublic ? profile.username : null,
      isMine: viewer === row.userId,
      setlistId: viewer === row.userId ? (row.setlistId ?? null) : null,
    };
  },
});
