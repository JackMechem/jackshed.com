"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@jam-practice/convex/_generated/api";
import { Id } from "@jam-practice/convex/_generated/dataModel";
import ConfirmDialog from "@/components/ConfirmDialog";
import LoadingSpinner from "@/components/LoadingSpinner";
import SwitchRow from "@/components/SwitchRow";
import UserAvatar from "@/components/UserAvatar";
import {
  ChordChartIcon,
  CheckIcon,
  EyeOffIcon,
  HeartIcon,
  LinkIcon,
  PlusIcon,
  SearchIcon,
  ShareIcon,
  TrashIcon,
} from "@/components/tools";
import { toPublicTune } from "@/lib/profileTunes";
import { Tune } from "@/lib/types";
import { useSyncedTunes } from "@/lib/useSyncedTunes";

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export type TunePostSummary = {
  id: Id<"communityTunes">;
  title: string;
  description: string;
  tuneCount: number;
  tuneNames: string[];
  /** How many of this post's tunes carry a linked chord chart — see `PublicTune.linkedChart`'s
      own doc comment (`@jam-practice/core/profileTunes`). A chart only ever reaches Community by
      riding along on a tune this way; there's no separate "post a chart" flow anymore (there used
      to be a whole second post type for that — removed per an explicit request to stop the two
      concepts being confusing). `PostListItem` shows this as a small badge, and it's what a
      "chord charts" search scope filters on. */
  chartCount: number;
  chartTitles: string[];
  likeCount: number;
  unlisted: boolean;
  createdAt: number;
  authorUsername?: string | null;
  authorAvatarUrl?: string | null;
  /** Only present on `communityTunes.list`'s own rows (the shared Browse list) —
      `communityTunes.mine`'s rows don't need it, since every row returned from there is already
      the caller's own by construction (`MyPostsTab.tsx` always allows delete, regardless of this
      field). */
  isMine?: boolean;
};

/** The big heart-over-count like button, filling the slot a "View" button used to sit in — per a
    direct request to make it bigger and move it there, now that clicking the row itself (not a
    button) is what opens a post (see `PostListItem`'s own doc comment). Owns the `toggleLike`
    mutation call itself (every caller does the exact same thing with it) rather than taking an
    `onToggle` callback every caller would have to wire up identically. `liked` is computed by the
    caller from a single `myLikes` query fetched once per page (`CommunityTunes`, `MyPostsTab`,
    `PublicProfilePage` — never a per-row query, see `myLikes`'s own doc comment in
    `packages/convex/communityTunes.ts`) — `LikedPosts` is the one exception, where every row is
    already known to be liked by definition, so it just passes `liked` as a constant `true`. Only
    ever rendered somewhere already gated behind being signed in, so there's no "sign in to like"
    affordance here — `toggleLike` itself still throws defensively if that's ever not true. */
function LikeButton({ postId, liked, count }: { postId: Id<"communityTunes">; liked: boolean; count: number }) {
  const toggleLike = useMutation(api.communityTunes.toggleLike);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void toggleLike({ id: postId });
      }}
      aria-label={liked ? "Unlike this post" : "Like this post"}
      className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 ${
        liked ? "text-danger" : "text-muted hover:text-foreground"
      }`}
    >
      <span className="text-sm font-bold">{count}</span>
      <HeartIcon className="h-5 w-5" filled={liked} />
    </button>
  );
}

/** One post's row, exported so `PublicProfilePage.tsx` renders posts identically to Community
    itself. **The whole row is clickable** (navigates to `/post/[id]`, the post's own full page),
    except the author's own name/avatar, which goes to their profile instead — per a direct
    request ("i should just be able to click on the post... except clicking on the user goes to
    their profile"). Deliberately *not* a real `<Link>` wrapping the row: nesting the author
    `<Link>`/the Like/Share/Delete `<button>`s inside an outer `<a>` is invalid HTML that breaks
    click handling (the same reasoning `PracticeTimerWidget.tsx` already documents for its own
    sibling-not-nested button layout) — so this is a plain `<li onClick>` with `role="link"`/
    keyboard support instead, and every nested interactive element calls `stopPropagation()` so a
    click there doesn't *also* open the post. Replaces an earlier "View" button, which freed up
    that slot for a bigger `LikeButton` instead (also requested directly), with Share and (when
    offered) Delete as a small icon row above it. */
export function PostListItem({
  post,
  liked,
  onDelete,
}: {
  post: TunePostSummary;
  liked: boolean;
  onDelete?: () => void;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  function open() {
    router.push(`/post/${post.id}`);
  }

  async function handleShare(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(`https://sheddex.com/post/${post.id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — nothing else to fall back to from a list row.
    }
  }

  return (
    <li
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      className="flex cursor-pointer items-center gap-3 rounded-xl bg-surface p-4 text-left hover:bg-surface-hover"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{post.title}</p>
        {post.description && (
          <p className="mt-0.5 line-clamp-2 text-sm text-muted">{post.description}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted">
          {post.authorUsername && (
            <>
              <Link
                href={`/u/${post.authorUsername}`}
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 hover:text-foreground"
              >
                <UserAvatar url={post.authorAvatarUrl ?? null} size="sm" />
                {post.authorUsername}
              </Link>
              <span aria-hidden>·</span>
            </>
          )}
          <span>
            {post.tuneCount} tune{post.tuneCount === 1 ? "" : "s"}
          </span>
          <span aria-hidden>·</span>
          <span>{formatDate(post.createdAt)}</span>
          {post.chartCount > 0 && (
            <span className="flex items-center gap-1 rounded-full bg-accent/10 px-2 py-0.5 text-accent">
              <ChordChartIcon className="h-3 w-3" />
              {post.chartCount}
            </span>
          )}
          {post.unlisted && (
            <span className="flex items-center gap-1 rounded-full bg-background px-2 py-0.5">
              <EyeOffIcon className="h-3 w-3" />
              Unlisted
            </span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-col items-center gap-1.5">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => void handleShare(e)}
            aria-label="Copy a link to this post"
            title="Copy a link to this post"
            className="rounded-lg p-1.5 text-muted hover:bg-background hover:text-foreground"
          >
            {copied ? <CheckIcon className="h-4 w-4 text-accent" /> : <ShareIcon className="h-4 w-4" />}
          </button>
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              aria-label="Delete post"
              title="Delete post"
              className="rounded-lg p-1.5 text-muted hover:bg-background hover:text-danger"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          )}
        </div>
        <LikeButton postId={post.id} liked={liked} count={post.likeCount} />
      </div>
    </li>
  );
}

/** Community's **one and only post type** (`Community.tsx`'s own "Posts" section) — browse tunes/
    tune lists other people have posted (each one optionally carrying its own linked chord chart,
    added automatically from whichever tune it's attached to — see `TunePostSummary.chartCount`'s
    own comment for why there's no separate "post a chart" flow), post your own, and add anything
    you find into your own Tunes or Tunes to Learn list. Browsing only needs to be signed in;
    posting also needs the caller's own profile to be public. A post's tune list renders with
    `PublicTuneList` — the exact same component a public profile's own Tunes section uses, and
    which already shows/lets you view a tune's linked chart — so "add"/"learn" here behaves
    identically (same dedupe-by-name check, same fresh-id copy, same two buttons) instead of a
    second copy of that logic.

    **Deliberately doesn't have a Browse/My Posts toggle** — an earlier version did, mirroring
    mobile's own now-removed one, and Jack called the mobile version out directly from a screenshot
    as confusing (a "my posts" view mixed into the same browse surface that belongs on the account
    page instead — "my posts should be in the profile section of the app"). This is purely "what
    has everyone (including you) posted, newest first"; your own posts live on `/account`'s own
    "Posts" tab (`MyPostsTab.tsx`, `communityTunes.mine`, uncapped, unlike this component's own
    `list` which is capped at the 60 most recent across everyone). A post you see here that happens
    to be your own can still be deleted right from its own row (`isMine`). */
export default function CommunityTunes() {
  const profile = useQuery(api.profiles.getMine);
  const posts = useQuery(api.communityTunes.list);
  const likedIds = useQuery(api.communityTunes.myLikes);
  const removePost = useMutation(api.communityTunes.remove);
  const [myTunes] = useSyncedTunes();

  const [showCreate, setShowCreate] = useState(false);
  const [deletingId, setDeletingId] = useState<Id<"communityTunes"> | null>(null);
  const [query, setQuery] = useState("");

  const likedSet = useMemo(() => new Set(likedIds ?? []), [likedIds]);

  const canPost = profile?.isPublic === true;
  const q = query.trim().toLowerCase();
  const filteredPosts = useMemo(() => {
    if (!posts || !q) return posts;
    return posts.filter(
      (post) =>
        post.title.toLowerCase().includes(q) ||
        post.tuneNames.some((name) => name.toLowerCase().includes(q)) ||
        post.chartTitles.some((title) => title.toLowerCase().includes(q)),
    );
  }, [posts, q]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-sm text-muted">
          Tunes other sheddex users have posted — some with a chord chart attached. Add one into
          your own Tunes, or your Tunes to Learn list.
        </p>
        {profile !== undefined &&
          (canPost ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
            >
              <PlusIcon className="h-4 w-4" />
              New post
            </button>
          ) : (
            <p className="shrink-0 text-xs text-muted">
              <Link href="/account" className="text-accent hover:underline">
                Make your profile public
              </Link>{" "}
              to post here.
            </p>
          ))}
      </div>

      {posts && posts.length > 0 && (
        <label className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-accent">
          <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by post title or tune name…"
            aria-label="Search tune posts"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
          />
        </label>
      )}

      {filteredPosts === undefined ? (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      ) : filteredPosts.length === 0 ? (
        <p className="rounded-2xl bg-surface p-5 text-center text-sm text-muted">
          {q ? `No posts match "${query}".` : "Nobody's posted yet — be the first."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filteredPosts.map((post) => (
            <PostListItem
              key={post.id}
              post={post}
              liked={likedSet.has(post.id)}
              onDelete={post.isMine ? () => setDeletingId(post.id) : undefined}
            />
          ))}
        </ul>
      )}

      {showCreate && (
        <CreatePostModal library={myTunes} onClose={() => setShowCreate(false)} />
      )}

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
    </div>
  );
}

/** The "new post" form — picks one or more tunes out of the caller's own Tunes list (nothing typed
    by hand here; you post what's already in your list) and snapshots them, notes stripped
    (`toPublicTune`), into a new Community post via `communityTunes.create`. A tune that's already
    linked to one of the caller's own chord charts (`Tune.chordChartId`, set via the account page's
    tune editor) shows a small link icon in this picker so it's clear which ones will bring their
    chart along — the server resolves and attaches it automatically (`communityTunes.create`'s own
    `resolveLinkedChart` call), nothing extra to pick here. */
function CreatePostModal({
  library,
  onClose,
}: {
  library: Tune[];
  onClose: () => void;
}) {
  const router = useRouter();
  const create = useMutation(api.communityTunes.create);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [unlisted, setUnlisted] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...library].sort((a, b) => a.name.localeCompare(b.name)),
    [library],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((t) => t.name.toLowerCase().includes(q));
  }, [sorted, query]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSubmit() {
    setError(null);
    if (!title.trim()) {
      setError("Give this post a title.");
      return;
    }
    if (selected.size === 0) {
      setError("Pick at least one tune to post.");
      return;
    }
    setSubmitting(true);
    try {
      const tunes = library.filter((t) => selected.has(t.id)).map(toPublicTune);
      const id = await create({ title: title.trim(), description: description.trim(), tunes, unlisted });
      onClose();
      router.push(`/post/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post that.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-overlay p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Post to Community"
        className="flex w-full max-w-lg flex-col gap-4 rounded-2xl bg-surface p-5 text-left text-foreground shadow-2xl shadow-black/20"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Post to Community</h2>

        {library.length === 0 ? (
          <p className="text-sm text-muted">
            Your Tunes list is empty — add a tune in Jam Practice or the account Tunes tab first,
            then come back here to post from it.
          </p>
        ) : (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Title</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Bossa nova gig setlist"
                className="rounded-lg bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-accent"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium text-muted">Description (optional)</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                className="resize-y rounded-lg bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
              />
            </label>

            <div className="flex flex-col gap-1">
              <SwitchRow label="Unlisted" checked={unlisted} onChange={setUnlisted} />
              <p className="text-xs text-muted">
                Won&apos;t show up in Community&apos;s feed or search, or on your public profile —
                only people with the link can see it.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted">
                Tunes to include ({selected.size} selected)
              </span>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your tunes…"
                className="rounded-lg bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
              />
              <ul className="max-h-56 overflow-y-auto rounded-lg bg-background">
                {filtered.map((tune) => (
                  <li key={tune.id}>
                    <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-surface-hover">
                      <input
                        type="checkbox"
                        checked={selected.has(tune.id)}
                        onChange={() => toggle(tune.id)}
                        className="h-4 w-4 accent-accent"
                      />
                      <span className="min-w-0 flex-1 truncate">{tune.name}</span>
                      {tune.chordChartId && <LinkIcon className="h-3.5 w-3.5 shrink-0 text-accent" />}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-background px-4 py-2 text-sm font-medium hover:bg-surface-hover"
          >
            Cancel
          </button>
          {library.length > 0 && (
            <button
              type="button"
              onClick={() => void onSubmit()}
              disabled={submitting}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting ? "Posting…" : "Post"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

