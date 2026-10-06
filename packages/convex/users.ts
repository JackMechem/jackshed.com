import { getAuthUserId } from "@convex-dev/auth/server";
import { query } from "./_generated/server";

/** The signed-in user's own account doc (email, name, ...), or null if signed out. Not a "data
    domain" like tunes/chordCharts/stats — just enough to show who's signed in. */
export const current = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db.get(userId);
  },
});
