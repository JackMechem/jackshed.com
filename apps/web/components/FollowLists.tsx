"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@jam-practice/convex/_generated/api";
import { Id } from "@jam-practice/convex/_generated/dataModel";
import LoadingSpinner from "@/components/LoadingSpinner";
import UserAvatar from "@/components/UserAvatar";

type PersonRow = { userId: Id<"users">; username: string | null; avatarUrl: string | null };

function PersonList({ people, emptyText }: { people: PersonRow[] | undefined; emptyText: string }) {
  if (people === undefined) {
    return (
      <div className="flex justify-center py-3">
        <LoadingSpinner size="sm" />
      </div>
    );
  }
  if (people.length === 0) {
    return <p className="text-sm text-muted">{emptyText}</p>;
  }
  return (
    <div className="flex flex-col">
      {people.map((person) =>
        person.username ? (
          <Link
            key={person.userId}
            href={`/u/${person.username}`}
            className="flex items-center gap-3 border-b border-background/70 py-2.5 last:border-b-0 hover:text-accent"
          >
            <UserAvatar url={person.avatarUrl} size="sm" />
            <span className="truncate text-sm font-medium">{person.username}</span>
          </Link>
        ) : (
          <div
            key={person.userId}
            className="flex items-center gap-3 border-b border-background/70 py-2.5 text-muted last:border-b-0"
          >
            <UserAvatar url={person.avatarUrl} size="sm" />
            <span className="truncate text-sm">No profile yet</span>
          </div>
        ),
      )}
    </div>
  );
}

/** The Following tab of `/account` — who the signed-in user follows, and who follows them. This
    is where "accounts you follow should show somewhere on the site" lives; kept as its own tab
    rather than folded into Public Profile or the sidebar (already carrying the Practice Timer
    widget, favorites, and the account/theme buttons). Always allowed for your own `userId`
    regardless of whether your profile is public — `convex/follows.ts`'s `listFollowing`/
    `listFollowers` only gate on `isPublic` for *other* people's lists. */
export default function FollowLists() {
  const user = useQuery(api.users.current);
  const userId = user?._id;
  const following = useQuery(api.follows.listFollowing, userId ? { userId } : "skip");
  const followers = useQuery(api.follows.listFollowers, userId ? { userId } : "skip");

  if (user === undefined) {
    return (
      <section className="flex justify-center rounded-2xl bg-surface p-5">
        <LoadingSpinner />
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded-2xl bg-surface p-5 text-left">
        <h2 className="text-lg font-semibold">
          Following{following !== undefined ? ` (${following.length})` : ""}
        </h2>
        <PersonList people={following} emptyText="You're not following anyone yet." />
      </section>
      <section className="flex flex-col gap-3 rounded-2xl bg-surface p-5 text-left">
        <h2 className="text-lg font-semibold">
          Followers{followers !== undefined ? ` (${followers.length})` : ""}
        </h2>
        <PersonList people={followers} emptyText="No one follows you yet." />
      </section>
    </div>
  );
}
