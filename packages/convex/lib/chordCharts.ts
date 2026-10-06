import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/** A title/composer/key fingerprint used to dedupe a song against what's already in a library —
    shared by `convex/chordCharts.ts`'s `importSongs` (importing from a pasted iReal link or a
    Community post) and `convex/communityChordCharts.ts`'s `importIntoLibrary` (importing *into*
    the library from a post), so both dedupe exactly the same way. Mirrors
    `lib/chordChartsLibrary.ts`'s own `songKey`, which the signed-out/local path still uses
    directly — this is the server-side twin, not a shared import, since Convex functions and
    client code live in genuinely separate bundles here. */
export function songKey(song: { title: string; composer: string; key: string }) {
  return `${song.title.toLowerCase()}__${song.composer.toLowerCase()}__${song.key.toLowerCase()}`;
}

function playlistNameKey(name: string) {
  return name.trim().toLowerCase();
}

/** Finds the caller's existing playlist matching `name` (case/whitespace-insensitively), or
    creates one — the one place this match happens, shared by every path that adds songs to a
    user's library, so "re-importing the same playlist merges into it instead of duplicating it"
    means the same thing everywhere. */
export async function findOrCreatePlaylist(
  ctx: MutationCtx,
  userId: Id<"users">,
  name: string,
): Promise<Id<"chordChartPlaylists">> {
  const trimmed = name.trim() || "Imported";
  const existing = await ctx.db
    .query("chordChartPlaylists")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const match = existing.find((p) => playlistNameKey(p.name) === playlistNameKey(trimmed));
  if (match) return match._id;
  return ctx.db.insert("chordChartPlaylists", { userId, name: trimmed, createdAt: Date.now() });
}
