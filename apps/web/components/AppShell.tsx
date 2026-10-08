"use client";

import TilingLayout from "@/components/TilingLayout";
import { useIsDesktop } from "@/lib/useIsDesktop";
import { useRecordToolVisits } from "@/lib/toolRecents";
import { useTilingState } from "@/lib/useTilingLayout";

/** Wraps `children` (the page Next.js actually resolved for the current URL) in the one div every
    route already rendered inside before "Advanced layouts" existed — unless that's turned on
    *and* the screen is desktop-sized, in which case `children` is dropped entirely in favor of
    `TilingLayout`'s own tree of panes (see that component's own doc comment for why there's no
    way to reconcile "the real Next.js page" with "several independently-chosen tools on screen at
    once"). The `useIsDesktop()` check lives here, not inside `TilingLayout` — per an explicit
    request to disable the feature *completely* on mobile, this is what makes sure `TilingLayout`
    (and its own effects — the tree-seeding one in particular) never even mounts on a phone, not
    just that its UI looks different there. If `enabled` is somehow `true` in storage from an
    earlier desktop session on the same browser profile, a phone-width visit here is still just
    the plain page, same as if the toggle were off — not a degraded tiling view. Reads the same
    `useTilingState()` the tiling layout itself does, so flipping "Advanced layouts" off/on from
    the sidebar swaps between the two instantly, no reload needed. */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const { enabled } = useTilingState();
  const isDesktop = useIsDesktop();
  useRecordToolVisits();

  if (!enabled || !isDesktop) {
    return (
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-background lg:my-2 lg:ml-2 lg:mr-2 lg:rounded-3xl">
        {children}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-background lg:my-2 lg:ml-2 lg:mr-2 lg:rounded-3xl">
      <TilingLayout />
    </div>
  );
}
