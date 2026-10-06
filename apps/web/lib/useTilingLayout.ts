"use client";

import { useSyncExternalStore } from "react";
import { type PaneEdge, type PaneTree, splitLeaf } from "@/lib/tilingLayout";

/** "Advanced layouts" (tiling panes) state — a device-local preference and arrangement, same
    category as the sidebar's own width/collapsed state (`components/Sidebar.tsx`'s own
    `STORAGE_KEY`/`getLayout`/`updateLayout`/`subscribeLayout`, the exact pattern mirrored here):
    not synced to the account, just this browser remembering what you last had open. `enabled`
    defaults to `false` so the feature stays invisible until someone deliberately turns it on;
    `tree`/`activePaneId` start `null` and get seeded with a single pane showing wherever you
    currently are the first time `TilingLayout` actually mounts (see that component), rather than
    defaulting to some fixed tool that might not be where you were. */
const STORAGE_KEY = "jam-practice-tiling";

export type PendingSplit = { paneId: string; edge: PaneEdge } | null;

export type TilingState = {
  enabled: boolean;
  tree: PaneTree | null;
  activePaneId: string | null;
  /** Set the instant an edge button is clicked (`requestSplit`, below) and cleared the instant a
      choice is made or the picker closes without one — tracks "which pane, which direction" while
      the *real* `/` command palette (`components/CommandPalette.tsx`) is open on its behalf, per a
      direct follow-up request to reuse that exact search UI instead of a bespoke mini-popover.
      Deliberately never persisted to `localStorage` (see `write` below) — a half-finished split
      request has no business surviving a reload. */
  pendingSplit: PendingSplit;
};

const DEFAULT_STATE: TilingState = {
  enabled: false,
  tree: null,
  activePaneId: null,
  pendingSplit: null,
};
let cached: TilingState | null = null;
const listeners = new Set<() => void>();

function read(): TilingState {
  if (cached) return cached;
  cached = DEFAULT_STATE;
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null");
    if (stored && typeof stored === "object") {
      cached = {
        enabled: stored.enabled === true,
        // Not deeply validated against the real PaneTree shape — a malformed tree just fails to
        // find its leaves sensibly, and `TilingLayout`'s own reset button recovers from that.
        tree: stored.tree ?? null,
        activePaneId: typeof stored.activePaneId === "string" ? stored.activePaneId : null,
        pendingSplit: null,
      };
    }
  } catch {
    // ignore unreadable storage
  }
  return cached;
}

function getServerState(): TilingState {
  return DEFAULT_STATE;
}

function write(patch: Partial<TilingState>) {
  cached = { ...read(), ...patch };
  try {
    // `pendingSplit` is deliberately left out of what's actually saved — see its own doc comment.
    const persisted: Omit<TilingState, "pendingSplit"> = {
      enabled: cached.enabled,
      tree: cached.tree,
      activePaneId: cached.activePaneId,
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  } catch {
    // storage unavailable
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTilingState() {
  return useSyncExternalStore(subscribe, read, getServerState);
}

export function updateTilingState(patch: Partial<TilingState>) {
  write(patch);
}

/** An edge button was clicked — records which pane and which direction, then the caller
    (`components/TilingLayout.tsx`) opens the real command palette on its behalf
    (`window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))`). */
export function requestSplit(paneId: string, edge: PaneEdge) {
  write({ pendingSplit: { paneId, edge } });
}

export function clearPendingSplit() {
  write({ pendingSplit: null });
}

/** Updates the browser's address bar to `href` via the raw History API, deliberately bypassing
    Next's own router (`router.replace`/`push`). TilingLayout always renders every pane itself from
    `TOOL_COMPONENTS` — Next never needs to actually fetch or render anything for a pane-focus,
    close, or split, so the address-bar update is purely cosmetic (so a copied link opens the right
    tool). Routing it through `router.replace()` was traced to a real bug, reported directly ("the
    metronome will keep going but if i go back to the metronome it will refresh the window and the
    metronome will stop"): navigating to a URL matching a `TOOL_COMPONENTS` entry causes *that
    specific tool's* dynamically-imported component to remount — confirmed with instance-id tracing
    showing `Pane`/`AppShell` stay perfectly stable while the tool component underneath gets a fresh
    instance, exactly when (and only when) `router.replace`/`push` targets that tool's own href.
    Calling the raw History API instead never touches Next's navigation machinery, so it can't
    trigger whatever internal mechanism causes that remount. */
export function syncAddressBar(href: string) {
  if (typeof window === "undefined") return;
  if (window.location.pathname === href) return;
  window.history.replaceState(window.history.state, "", href);
}

/** Called by `CommandPalette.tsx` when a result is picked. If there's a pending split request,
    performs it (splitting the requesting pane with the chosen tool, making the new pane active)
    and returns `true` — the caller's job to actually navigate the URL there, same as it would for
    a normal pick. Returns `false` (and touches nothing) when there's no pending split, so the
    caller falls back to its own ordinary "navigate to this page" behavior. */
export function applyPendingSplit(href: string): boolean {
  const current = read();
  if (!current.pendingSplit || !current.tree) return false;
  const { paneId, edge } = current.pendingSplit;
  const { tree, newPaneId } = splitLeaf(current.tree, paneId, edge, href);
  write({ tree, activePaneId: newPaneId, pendingSplit: null });
  return true;
}
