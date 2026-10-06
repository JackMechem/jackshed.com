"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@jam-practice/convex/_generated/api";
import { Id } from "@jam-practice/convex/_generated/dataModel";
import {
  PostDetailModal as ChordChartPostDetailModal,
  PostListItem as ChordChartPostListItem,
} from "@/components/CommunityChordCharts";
import {
  PostDetailModal as TunePostDetailModal,
  PostListItem as TunePostListItem,
} from "@/components/CommunityTunes";
import FollowButton from "@/components/FollowButton";
import LoadingSpinner from "@/components/LoadingSpinner";
import PublicTuneList from "@/components/PublicTuneList";
import UserAvatar from "@/components/UserAvatar";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";

/** A public profile page (`app/u/[username]/page.tsx`) — reachable by anyone, signed in or not;
    this is the shareable link. `getPublicByUsername` returns `null` for both "no such username"
    and "that profile exists but isn't public", deliberately indistinguishable from here — a
    visitor can't tell the difference by probing usernames. "Tunes" and "Tunes to Learn" are two
    separate sections, both rendered with `PublicTuneList` (the same Jam-Practice-styled row layout
    for both — see that component for why one component covers both), which also lets a signed-in
    viewer copy a tune they see into their own lists.

    "Chord Chart Posts" and "Tune Posts" are this profile's Community posts (`listByUser` on each,
    `convex/communityChordCharts.ts`/`convex/communityTunes.ts`) — added per a direct follow-up
    request ("when looking at another user's profile it should show their posts"), reusing the
    exact `PostListItem`/`PostDetailModal` components Community's own Browse/My Posts views render
    with, imported and aliased per source so both fit here side by side. Gated on the *viewer*
    being signed in, same as Community's own Chord Charts/Tunes sections — browsing posts needs an
    account there, so it needs one here too, rather than this page quietly having a looser rule
    for the same underlying data depending on which page you reached it from. */
export default function PublicProfilePage({ username }: { username: string }) {
  const profile = useQuery(api.profiles.getPublicByUsername, { username });
  const viewer = useQuery(api.users.current);
  const chartPosts = useQuery(
    api.communityChordCharts.listByUser,
    profile ? { userId: profile.userId as Id<"users"> } : "skip",
  );
  const tunePosts = useQuery(
    api.communityTunes.listByUser,
    profile ? { userId: profile.userId as Id<"users"> } : "skip",
  );
  const { playlists: myPlaylists } = useChordChartsLibrary(null);

  const [openChartPostId, setOpenChartPostId] = useState<Id<"communityChordCharts"> | null>(null);
  const [openTunePostId, setOpenTunePostId] = useState<Id<"communityTunes"> | null>(null);

  if (profile === undefined || viewer === undefined) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-4 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-16">
        <LoadingSpinner />
      </main>
    );
  }

  if (profile === null) {
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col items-center justify-center gap-2 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] text-center sm:px-6 lg:pt-16">
        <h1 className="text-xl font-semibold">This profile isn&apos;t available</h1>
        <p className="text-sm text-muted">
          It might not exist, or its owner hasn&apos;t made it public.
        </p>
      </main>
    );
  }

  const isOwnProfile = viewer?._id === profile.userId;
  const canAdd = !isOwnProfile && !!viewer;
  // Posts only ever load once we know whether the viewer is signed in (the queries are `"skip"`ped
  // otherwise) — treat "still loading" as "don't know yet" rather than momentarily flashing the
  // "hasn't added anything" message before a post that's actually there shows up.
  const postsSettled = !viewer || (chartPosts !== undefined && tunePosts !== undefined);
  const hasPosts = (chartPosts?.length ?? 0) > 0 || (tunePosts?.length ?? 0) > 0;
  const hasNothing =
    postsSettled &&
    !hasPosts &&
    profile.instruments.length === 0 &&
    profile.tunes.length === 0 &&
    profile.tunesToLearn.length === 0;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-16">
      <div className="flex flex-col items-center gap-3 text-center">
        <UserAvatar url={profile.avatarUrl} size="xl" />
        <h1 className="text-2xl font-bold text-accent">{profile.username}</h1>
        {!isOwnProfile && viewer && (
          <FollowButton targetUserId={profile.userId as Id<"users">} />
        )}
        {!isOwnProfile && !viewer && (
          <p className="text-xs text-muted">
            <Link href="/" className="text-accent hover:underline">
              Sign in
            </Link>{" "}
            to follow {profile.username}.
          </p>
        )}
      </div>

      {profile.instruments.length > 0 && (
        <section className="flex flex-col gap-2 rounded-2xl bg-surface p-5 text-left">
          <h2 className="text-sm font-semibold text-muted">Instruments</h2>
          <div className="flex flex-wrap gap-2">
            {profile.instruments.map((name) => (
              <span
                key={name}
                className="rounded-full bg-background px-3 py-1 text-xs font-medium"
              >
                {name}
              </span>
            ))}
          </div>
        </section>
      )}

      {profile.tunes.length > 0 && (
        <section className="flex flex-col gap-2 rounded-2xl bg-surface p-5 text-left">
          <h2 className="text-sm font-semibold text-muted">Tunes</h2>
          <div className="max-h-96 overflow-y-auto pr-1">
            <PublicTuneList tunes={profile.tunes} canAdd={canAdd} />
          </div>
        </section>
      )}

      {profile.tunesToLearn.length > 0 && (
        <section className="flex flex-col gap-2 rounded-2xl bg-surface p-5 text-left">
          <h2 className="text-sm font-semibold text-muted">Tunes to Learn</h2>
          <div className="max-h-96 overflow-y-auto pr-1">
            <PublicTuneList tunes={profile.tunesToLearn} canAdd={canAdd} />
          </div>
        </section>
      )}

      {viewer ? (
        <>
          {chartPosts && chartPosts.length > 0 && (
            <section className="flex flex-col gap-2 rounded-2xl bg-surface p-5 text-left">
              <h2 className="text-sm font-semibold text-muted">Chord Chart Posts</h2>
              <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
                {chartPosts.map((post) => (
                  <ChordChartPostListItem
                    key={post.id}
                    post={post}
                    onOpen={() => setOpenChartPostId(post.id)}
                  />
                ))}
              </ul>
            </section>
          )}

          {tunePosts && tunePosts.length > 0 && (
            <section className="flex flex-col gap-2 rounded-2xl bg-surface p-5 text-left">
              <h2 className="text-sm font-semibold text-muted">Tune Posts</h2>
              <ul className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
                {tunePosts.map((post) => (
                  <TunePostListItem
                    key={post.id}
                    post={post}
                    onOpen={() => setOpenTunePostId(post.id)}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      ) : (
        <p className="text-center text-xs text-muted">
          <Link href="/" className="text-accent hover:underline">
            Sign in
          </Link>{" "}
          to see {profile.username}&apos;s Community posts.
        </p>
      )}

      {hasNothing && (
        <p className="text-center text-sm text-muted">
          {profile.username} hasn&apos;t added any instruments, tunes, or posts yet.
        </p>
      )}

      {openChartPostId && (
        <ChordChartPostDetailModal
          id={openChartPostId}
          myPlaylists={myPlaylists}
          onClose={() => setOpenChartPostId(null)}
        />
      )}
      {openTunePostId && (
        <TunePostDetailModal id={openTunePostId} onClose={() => setOpenTunePostId(null)} />
      )}
    </main>
  );
}
