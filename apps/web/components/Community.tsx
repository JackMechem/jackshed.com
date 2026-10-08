"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import ConfirmDialog from "@/components/ConfirmDialog";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import { PostListItem } from "@/components/CommunityTunes";
import { EmptyCard, PageHeader, PageShell, SearchBox, SectionHeader, StatCard, menuPosition } from "@/components/library/shared";
import LoadingSpinner from "@/components/LoadingSpinner";
import UserAvatar from "@/components/UserAvatar";
import { HeartIcon, NoteIcon, PlusIcon, UsersIcon } from "@/components/tools";
import { useSetlists } from "@/lib/useSetlists";

/**
 * The Community page, laid out like the Tunes and Chord Charts dashboards (and the mobile app's
 * Community tab): a big title with a + (post tunes, or post one of your setlists), one search
 * across people and posts, stat cards that open Liked / Following / My posts, then the latest
 * posts. Every post opens its own page (`/post/[id]`); posting is the full-page composer
 * (`/community/new`), which checks for a public profile. Searching people works signed out; posts
 * need an account (browsing them always has).
 */
export default function Community() {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const authed = isAuthenticated ? {} : "skip";
  const posts = useQuery(api.communityTunes.list, authed);
  const likedIds = useQuery(api.communityTunes.myLikes, authed);
  const mine = useQuery(api.communityTunes.mine, authed);
  const me = useQuery(api.users.current, authed);
  const following = useQuery(api.follows.listFollowing, me?._id ? { userId: me._id } : "skip");
  const removePost = useMutation(api.communityTunes.remove);
  const { setlists } = useSetlists();

  const [query, setQuery] = useState("");
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [deletingId, setDeletingId] = useState<Id<"communityTunes"> | null>(null);

  const likedSet = useMemo(() => new Set(likedIds ?? []), [likedIds]);
  const trimmed = query.trim();
  const q = trimmed.toLowerCase();
  const people = useQuery(api.profiles.search, trimmed ? { query: trimmed } : "skip");
  const matchingPosts = useMemo(() => {
    if (!posts || !q) return [];
    const words = q.split(/\s+/);
    return posts.filter((p) => {
      const hay = [p.title, p.authorUsername ?? "", ...p.tuneNames, ...p.chartTitles].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [posts, q]);

  function openNewMenu(e: React.MouseEvent) {
    if (!isAuthenticated) {
      router.push("/");
      return;
    }
    const pos = menuPosition(e);
    setMenu({
      ...pos,
      items: [
        { label: "Post tunes", onSelect: () => router.push("/community/new") },
        setlists.length
          ? {
              label: "Post a setlist…",
              // A second menu, in the same spot, listing your setlists.
              onSelect: () =>
                setTimeout(
                  () =>
                    setMenu({
                      ...pos,
                      items: [...setlists]
                        .sort((a, b) => b.updatedAt - a.updatedAt)
                        .map((s) => ({ label: `${s.name} (${s.tuneIds.length})`, onSelect: () => router.push(`/community/new?setlist=${encodeURIComponent(s.id)}`) })),
                    }),
                  0,
                ),
            }
          : { label: "Post a setlist (make one in Tunes first)", onSelect: () => router.push("/tunes") },
      ],
    });
  }

  const postList = (list: NonNullable<typeof posts>) => (
    <ul className="flex flex-col gap-2">
      {list.map((post) => (
        <PostListItem key={post.id} post={post} liked={likedSet.has(post.id)} onDelete={post.isMine ? () => setDeletingId(post.id) : undefined} />
      ))}
    </ul>
  );

  return (
    <PageShell>
      <PageHeader
        title="Community"
        actions={
          <button
            type="button"
            onClick={openNewMenu}
            aria-label="New post"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-foreground hover:bg-accent-hover"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
        }
      />
      <SearchBox value={query} onChange={setQuery} placeholder="Search people and posts…" />

      {isLoading ? (
        <div className="flex justify-center py-10">
          <LoadingSpinner />
        </div>
      ) : trimmed ? (
        <>
          <Section title="People">
            {people === undefined ? (
              <Spinner />
            ) : people.length === 0 ? (
              <EmptyCard>No one named “{trimmed}”.</EmptyCard>
            ) : (
              <div className="overflow-hidden rounded-2xl bg-surface">
                {people.map((p, i) => (
                  <Link key={p.userId} href={`/u/${p.username}`} className={`flex items-center gap-3 px-3 py-2.5 hover:bg-surface-hover ${i ? "border-t border-background" : ""}`}>
                    <UserAvatar url={p.avatarUrl} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">@{p.username}</span>
                      {p.instruments.length > 0 && <span className="block truncate text-xs text-muted">{p.instruments.join(", ")}</span>}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Section>
          <Section title="Posts">
            {!isAuthenticated ? (
              <EmptyCard>Sign in to search posts.</EmptyCard>
            ) : posts === undefined ? (
              <Spinner />
            ) : matchingPosts.length === 0 ? (
              <EmptyCard>No posts match “{trimmed}”.</EmptyCard>
            ) : (
              postList(matchingPosts)
            )}
          </Section>
        </>
      ) : (
        <>
          <div className="flex gap-3">
            <StatCard icon={HeartIcon} count={likedIds?.length ?? 0} label="Liked" href={isAuthenticated ? "/community/liked" : "/"} />
            <StatCard icon={UsersIcon} count={following?.length ?? 0} label="Following" href={isAuthenticated ? "/community/following" : "/"} />
            <StatCard icon={NoteIcon} count={mine?.length ?? 0} label="My posts" href={isAuthenticated ? "/community/posts" : "/"} />
          </div>

          <Section title="Latest posts">
            {!isAuthenticated ? (
              <div className="flex flex-col items-start gap-3 rounded-2xl bg-surface p-4">
                <p className="text-sm text-muted">Sign in to see what sheddex users have posted — tunes, setlists, and the chord charts that come with them.</p>
                <Link href="/" className="rounded-xl bg-accent px-4 py-2 text-sm font-bold text-accent-foreground hover:bg-accent-hover">
                  Sign in
                </Link>
              </div>
            ) : posts === undefined ? (
              <Spinner />
            ) : posts.length === 0 ? (
              <EmptyCard>Nobody&apos;s posted yet — be the first with +.</EmptyCard>
            ) : (
              postList(posts)
            )}
          </Section>
        </>
      )}

      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {deletingId && (
        <ConfirmDialog
          title="Delete this post?"
          message="This removes it from Community for everyone. It doesn't touch anyone who already added it."
          confirmLabel="Delete"
          onConfirm={() => {
            void removePost({ id: deletingId });
            setDeletingId(null);
          }}
          onCancel={() => setDeletingId(null)}
        />
      )}
    </PageShell>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title={title} />
      {children}
    </section>
  );
}

function Spinner() {
  return (
    <div className="flex justify-center py-4">
      <LoadingSpinner size="sm" />
    </div>
  );
}

/** A Community sub-page (Liked, Following, My posts): back to Community, a title, and — signed
    out — a sign-in prompt instead of the content (every one of them needs an account). */
export function CommunitySubPage({ title, children }: { title: string; children: ReactNode }) {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useConvexAuth();
  return (
    <PageShell>
      <PageHeader title={title} back={() => router.push("/community")} />
      {isLoading ? (
        <Spinner />
      ) : isAuthenticated ? (
        children
      ) : (
        <EmptyCard>
          <Link href="/" className="text-accent hover:underline">
            Sign in
          </Link>{" "}
          to see this.
        </EmptyCard>
      )}
    </PageShell>
  );
}
