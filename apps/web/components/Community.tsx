"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { useConvexAuth } from "@convex-dev/auth/react";
import { api } from "@jam-practice/convex/_generated/api";
import CommunityChordCharts from "@/components/CommunityChordCharts";
import CommunityTunes from "@/components/CommunityTunes";
import FollowLists from "@/components/FollowLists";
import LoadingSpinner from "@/components/LoadingSpinner";
import SidebarNavButton from "@/components/SidebarNavButton";
import UserAvatar from "@/components/UserAvatar";
import { ChordChartIcon, NoteIcon, SearchIcon, UsersIcon } from "@/components/tools";

type CommunityView = "search" | "following" | "charts" | "tunes";

/** The public search/browse page (`app/community/page.tsx`) — reachable by anyone, signed in or
    not, same as an individual profile. Has its own left sidebar, the same `SidebarNavButton`
    layout `/account` uses (per a direct request for "the same sidebar thing"), switching between
    the username search (unchanged from before — searches `isPublic` profiles only, username-only
    per an earlier scoping call), a **Following** section reusing `FollowLists` wholesale (both who
    you follow and who follows you, the same component `/account`'s own Following tab already
    shows), **Chord Charts** (`CommunityChordCharts.tsx`), and **Tunes** (`CommunityTunes.tsx`) —
    browse/post chord charts (or tunes) and playlists (or tune lists); the two are siblings, same
    shape, same rules, just different content. All three of Following/Chord Charts/Tunes require
    being signed in (`FollowLists` itself assumes a signed-in user — its
    `useQuery(api.users.current)` gates on `user === undefined`, i.e. still loading, not
    `user === null`, i.e. definitely signed out, so mounting it while signed out would spin
    forever; the other two gate on it explicitly for the same "browsing needs an account" rule Jack
    asked for) — so all three show a sign-in prompt instead when `isAuthenticated` is false (a
    loading spinner while `useConvexAuth()` itself hasn't resolved yet, so a signed-in visitor
    doesn't see a flash of "sign in" first), rather than mounting unconditionally the way
    `/account` can (that whole page is already gated behind being signed in). Search alone stays
    open to a signed-out visitor, same as before. */
export default function Community() {
  const [view, setView] = useState<CommunityView>("search");
  const { isLoading, isAuthenticated } = useConvexAuth();
  const [query, setQuery] = useState("");
  const trimmedQuery = query.trim();
  const results = useQuery(api.profiles.search, trimmedQuery ? { query: trimmedQuery } : "skip");

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-16">
      <div className="flex flex-col gap-1 text-left">
        <h1 className="text-2xl font-bold text-accent">Community</h1>
        <p className="text-sm text-muted">
          Search public profiles by username, see who you follow, or browse chord charts and
          tunes other people have posted — no account needed to search.
        </p>
      </div>

      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
        <nav className="flex w-full flex-col gap-1 rounded-2xl bg-surface p-2 sm:w-48 sm:shrink-0">
          <SidebarNavButton
            active={view === "search"}
            icon={SearchIcon}
            label="Search"
            onClick={() => setView("search")}
          />
          <SidebarNavButton
            active={view === "following"}
            icon={UsersIcon}
            label="Following"
            onClick={() => setView("following")}
          />
          <SidebarNavButton
            active={view === "charts"}
            icon={ChordChartIcon}
            label="Chord Charts"
            onClick={() => setView("charts")}
          />
          <SidebarNavButton
            active={view === "tunes"}
            icon={NoteIcon}
            label="Tunes"
            onClick={() => setView("tunes")}
          />
        </nav>

        <div className="flex min-w-0 flex-1 flex-col gap-6">
          {view === "search" && (
            <div className="flex flex-col gap-4">
              <label className="flex items-center gap-2 rounded-xl bg-surface px-4 py-3 text-foreground focus-within:ring-2 focus-within:ring-accent">
                <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by username"
                  aria-label="Search public profiles by username"
                  className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
                />
              </label>

              {trimmedQuery.length === 0 ? (
                <p className="text-center text-sm text-muted">Start typing a username to search.</p>
              ) : results === undefined ? (
                <div className="flex justify-center py-4">
                  <LoadingSpinner />
                </div>
              ) : results.length === 0 ? (
                <p className="text-center text-sm text-muted">
                  No public profiles match &quot;{query}&quot;.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {results.map((profile) => (
                    <Link
                      key={profile.userId}
                      href={`/u/${profile.username}`}
                      className="flex items-center gap-3 rounded-xl bg-surface p-3 transition-colors hover:bg-surface-hover"
                    >
                      <UserAvatar url={profile.avatarUrl} />
                      <div className="min-w-0 flex-1 text-left">
                        <p className="truncate font-medium">{profile.username}</p>
                        {profile.instruments.length > 0 && (
                          <p className="truncate text-xs text-muted">
                            {profile.instruments.join(", ")}
                          </p>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {view === "following" &&
            (isLoading ? (
              <div className="flex justify-center py-4">
                <LoadingSpinner />
              </div>
            ) : isAuthenticated ? (
              <FollowLists />
            ) : (
              <section className="flex flex-col items-center gap-2 rounded-2xl bg-surface p-5 text-center">
                <p className="text-sm text-muted">
                  <Link href="/" className="text-accent hover:underline">
                    Sign in
                  </Link>{" "}
                  to see who you follow.
                </p>
              </section>
            ))}

          {view === "charts" &&
            (isLoading ? (
              <div className="flex justify-center py-4">
                <LoadingSpinner />
              </div>
            ) : isAuthenticated ? (
              <CommunityChordCharts />
            ) : (
              <section className="flex flex-col items-center gap-2 rounded-2xl bg-surface p-5 text-center">
                <p className="text-sm text-muted">
                  <Link href="/" className="text-accent hover:underline">
                    Sign in
                  </Link>{" "}
                  to browse community chord charts.
                </p>
              </section>
            ))}

          {view === "tunes" &&
            (isLoading ? (
              <div className="flex justify-center py-4">
                <LoadingSpinner />
              </div>
            ) : isAuthenticated ? (
              <CommunityTunes />
            ) : (
              <section className="flex flex-col items-center gap-2 rounded-2xl bg-surface p-5 text-center">
                <p className="text-sm text-muted">
                  <Link href="/" className="text-accent hover:underline">
                    Sign in
                  </Link>{" "}
                  to browse community tunes.
                </p>
              </section>
            ))}
        </div>
      </div>
    </main>
  );
}
