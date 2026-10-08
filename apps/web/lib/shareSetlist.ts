import { useMutation } from "convex/react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import { toPublicTune } from "@/lib/profileTunes";
import { shareLink } from "@/lib/shareLink";
import type { Tune } from "@/lib/types";
import type { Setlist } from "@/lib/useSetlists";

/** Where a shared setlist's link points — this site's `/setlist/[id]` page. */
export const SETLIST_SHARE_BASE = "https://sheddex.com/setlist/";

/**
 * Share a setlist by link, then hand the link to the share sheet (or copy it). The link always
 * shows the setlist as it is now (the server reads it live — `setlists.getShared`), so editing it
 * never needs a re-share. Returns the share id (for the caller to remember on the setlist) and
 * whether the link was shared or copied.
 */
export function useShareSetlist() {
  const shareMutation = useMutation(api.setlists.share);
  const unshareMutation = useMutation(api.setlists.unshare);

  async function share(setlist: Setlist, tunes: Tune[]) {
    const id = await shareMutation({
      shareId: setlist.shareId as Id<"sharedSetlists"> | undefined,
      setlistId: setlist.id,
      title: setlist.name,
      description: setlist.description,
      tunes: tunes.map(toPublicTune),
    });
    const result = await shareLink(setlist.name, SETLIST_SHARE_BASE + id);
    return { id, result };
  }

  async function unshare(shareId: string) {
    await unshareMutation({ shareId: shareId as Id<"sharedSetlists"> });
  }

  return { share, unshare };
}
