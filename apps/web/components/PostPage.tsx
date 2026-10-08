"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Component, type ReactNode, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@jam-practice/convex/_generated/api";
import { Id } from "@jam-practice/convex/_generated/dataModel";
import ConfirmDialog from "@/components/ConfirmDialog";
import LoadingSpinner from "@/components/LoadingSpinner";
import PublicSetlist from "@/components/PublicSetlist";
import PublicTuneList from "@/components/PublicTuneList";
import UserAvatar from "@/components/UserAvatar";
import { EyeOffIcon, HeartIcon, SetlistIcon, ShareIcon, TrashIcon } from "@/components/tools";
import { shareLink } from "@/lib/shareLink";

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function NotAvailable() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-2 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] text-center sm:px-6 lg:pt-16">
      <h1 className="text-xl font-semibold">This post isn&apos;t available</h1>
      <p className="text-sm text-muted">
        It may have been removed, or its author&apos;s profile is no longer public.
      </p>
    </main>
  );
}

/** Convex's own id validator (`v.id("communityTunes")`) runs server-side, with no equivalent
    client-exposed check to mirror it exactly — a cheap, plainly-wrong id (containing a dash, a
    slash, anything non-alphanumeric) is rejected here before ever subscribing, but an
    alphanumeric string that merely *looks* plausible and isn't a real document still reaches the
    server and throws `ArgumentValidationError`, which `useQuery` surfaces as an uncaught render
    error, not a `null` result — confirmed directly against the real dev deployment, not assumed.
    `PostErrorBoundary` below is the actual safety net for that case; this regex is just a fast,
    cheap first filter for the common case (a typo, a stale non-Convex link) that doesn't need a
    round trip to find out it's wrong. */
const VALID_ID_RE = /^[a-z0-9]+$/i;

/** Catches the render error a malformed-but-plausible id throws (see `VALID_ID_RE`'s own comment)
    and falls back to the same "not available" page any other bad id already shows — Convex's own
    documented pattern for a query that can throw, since `useQuery` has no built-in way to turn a
    thrown server error into an ordinary return value. */
class PostErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) return <NotAvailable />;
    return this.props.children;
  }
}

export default function PostPage({ id }: { id: string }) {
  return (
    <PostErrorBoundary>
      <PostPageContent id={id} />
    </PostErrorBoundary>
  );
}

function PostPageContent({ id }: { id: string }) {
  const router = useRouter();
  const idLooksValid = VALID_ID_RE.test(id);
  const post = useQuery(
    api.communityTunes.get,
    idLooksValid ? { id: id as Id<"communityTunes"> } : "skip",
  );
  const likedIds = useQuery(api.communityTunes.myLikes);
  const toggleLike = useMutation(api.communityTunes.toggleLike);
  const removePost = useMutation(api.communityTunes.remove);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  const liked = post ? (likedIds ?? []).includes(post.id) : false;

  async function handleShare() {
    if (!post) return;
    if ((await shareLink(post.title, `https://sheddex.com/post/${post.id}`)) === "copied") {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  async function handleDelete() {
    if (!post) return;
    await removePost({ id: post.id });
    setConfirmDelete(false);
    router.push("/community");
  }

  if (!idLooksValid) {
    return <NotAvailable />;
  }

  if (post === undefined) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-4 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-16">
        <LoadingSpinner />
      </main>
    );
  }

  if (post === null) {
    return <NotAvailable />;
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-16">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 gap-1.5">
          <h1 className="text-xl font-bold">{post.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted">
            {post.authorUsername && (
              <>
                <Link href={`/u/${post.authorUsername}`} className="flex items-center gap-1.5 hover:text-foreground">
                  <UserAvatar url={post.authorAvatarUrl} size="sm" />
                  {post.authorUsername}
                </Link>
                <span aria-hidden>·</span>
              </>
            )}
            <span>{formatDate(post.createdAt)}</span>
            {post.kind === "setlist" && (
              <span className="flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 font-bold text-accent">
                <SetlistIcon className="h-3 w-3" />
                Setlist
              </span>
            )}
            {post.unlisted && (
              <span className="flex items-center gap-1 rounded-full bg-surface px-2 py-0.5">
                <EyeOffIcon className="h-3 w-3" />
                Unlisted
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={() => void toggleLike({ id: post.id })}
          aria-label={liked ? "Unlike this post" : "Like this post"}
          className={`flex flex-col items-center gap-0.5 rounded-2xl px-3 py-2 ${
            liked ? "bg-danger/10 text-danger" : "bg-surface text-muted hover:text-foreground"
          }`}
        >
          <HeartIcon className="h-7 w-7" filled={liked} />
          <span className="text-sm font-bold">{post.likeCount}</span>
        </button>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void handleShare()}
          className="flex items-center gap-1.5 rounded-xl bg-surface px-3 py-2 text-sm font-semibold hover:bg-surface-hover"
        >
          <ShareIcon className="h-4 w-4" />
          {copied ? "Link copied!" : "Share"}
        </button>
        {post.isMine && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 rounded-xl bg-surface px-3 py-2 text-sm font-semibold text-danger hover:bg-surface-hover"
          >
            <TrashIcon className="h-4 w-4" />
            Delete
          </button>
        )}
      </div>

      {post.description && <p className="text-sm text-muted">{post.description}</p>}

      {post.kind === "setlist" ? (
        <PublicSetlist title={post.title} tunes={post.tunes} isMine={post.isMine} ownSetlistId={post.setlistId} chartsParam={`post=${post.id}`} />
      ) : (
        <PublicTuneList tunes={post.tunes} canAdd />
      )}

      {confirmDelete && (
        <ConfirmDialog
          title={`Delete "${post.title}"?`}
          message="This removes it from Community for everyone. It doesn't touch anyone who already added it."
          confirmLabel="Delete"
          onConfirm={() => void handleDelete()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </main>
  );
}
