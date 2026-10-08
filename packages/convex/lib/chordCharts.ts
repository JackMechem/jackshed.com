import { MutationCtx, QueryCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";
import type { PublicLinkedChart } from "@jam-practice/core/profileTunes";

/** A title/composer/key fingerprint used to dedupe a song against what's already in a library —
    `convex/chordCharts.ts`'s `importSongs` (importing a pasted iReal link). Mirrors
    `lib/chordChartsLibrary.ts`'s own `songKey`, which the signed-out/local path still uses
    directly — this is the server-side twin, not a shared import, since Convex functions and
    client code live in genuinely separate bundles here. */
export function songKey(song: { title: string; composer: string; key: string }) {
  return `${song.title.toLowerCase()}__${song.composer.toLowerCase()}__${song.key.toLowerCase()}`;
}

function playlistNameKey(name: string) {
  return name.trim().toLowerCase();
}

/** Resolves a tune's *raw, unresolved* `chordChartId` (see `PublicTune.chordChartId`'s own doc
    comment in `@jam-practice/core/profileTunes`) into a full, embeddable `PublicLinkedChart`
    snapshot — or `null` if it doesn't resolve to anything real. Scoped to `ownerUserId`
    specifically (never the caller — a tune's linked chart always belongs to *that tune's own
    owner*'s private library, not whoever happens to be reading it), so this is the one place that
    enforces "a chart link only ever resolves to something the tune's owner actually has," the
    same "don't trust a client-supplied id blind" rule this app applies everywhere a raw id
    crosses a trust boundary. Tolerant of a garbage/dangling id (a chart that's since been deleted,
    or — defensively — a malformed string from old or corrupted data) — returns `null` rather than
    throwing, same as every other "resolve this optional reference" helper in this app. */
export async function resolveLinkedChart(
  ctx: QueryCtx,
  ownerUserId: Id<"users">,
  chordChartId: string | undefined,
): Promise<PublicLinkedChart | null> {
  if (!chordChartId) return null;
  let song;
  try {
    song = await ctx.db.get(chordChartId as Id<"chordChartSongs">);
  } catch {
    return null;
  }
  if (!song || song.userId !== ownerUserId) return null;
  const barsRow = await ctx.db
    .query("chordChartSongBars")
    .withIndex("by_song", (q) => q.eq("songId", song._id))
    .unique();
  if (!barsRow) return null;
  return {
    title: song.title,
    composer: song.composer,
    style: song.style,
    key: song.key,
    timeSignature: song.timeSignature,
    bars: barsRow.bars,
  };
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
  const match = existing.find((p) => !p.deleting && playlistNameKey(p.name) === playlistNameKey(trimmed));
  if (match) return match._id;
  return ctx.db.insert("chordChartPlaylists", { userId, name: trimmed, createdAt: Date.now() });
}
