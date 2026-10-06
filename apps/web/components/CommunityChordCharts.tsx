"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@jam-practice/convex/_generated/api";
import { Id } from "@jam-practice/convex/_generated/dataModel";
import ChordChart from "@/components/ChordChart";
import ConfirmDialog from "@/components/ConfirmDialog";
import LoadingSpinner from "@/components/LoadingSpinner";
import UserAvatar from "@/components/UserAvatar";
import { CheckIcon, DownloadIcon, PlusIcon, SearchIcon, TrashIcon } from "@/components/tools";
import { formatComposer, type Bar } from "@/lib/iRealPro";
import { songKey, UNSORTED_PLAYLIST_ID } from "@/lib/chordChartsLibrary";
import {
  useChordChartsLibrary,
  type LibraryPlaylist,
  type LibrarySongMeta,
} from "@/lib/useChordChartsLibrary";

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export type ChordChartPostSummary = {
  id: Id<"communityChordCharts">;
  title: string;
  description: string;
  songCount: number;
  songTitles: string[];
  createdAt: number;
  authorUsername?: string | null;
  authorAvatarUrl?: string | null;
};

/** One post's row, shared by the Browse list, "My Posts", and a public profile's own Chord Charts
    section — the same card either way, just with an author line when there's one to show
    (`mine`/`listByUser` rows don't carry author info at all, since it's always either you or
    already-known from the page it's shown on) and a delete button only when `onDelete` is passed
    (the caller decides whether this post is actually the signed-in user's own). Exported
    alongside `PostDetailModal` so `PublicProfilePage.tsx` renders posts identically to Community
    itself. A horizontal row — title/description/meta on the left, delete icon (if any) and a
    solid accent "View" pill on the right, both vertically centered against the whole row — per a
    direct follow-up request to move "View & import" off its own line and make it a proper pill
    button instead of a flat rectangle. */
export function PostListItem({
  post,
  onOpen,
  onDelete,
}: {
  post: ChordChartPostSummary;
  onOpen: () => void;
  onDelete?: () => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl bg-surface p-4 text-left">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{post.title}</p>
        {post.description && (
          <p className="mt-0.5 line-clamp-2 text-sm text-muted">{post.description}</p>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
          {post.authorUsername && (
            <>
              <Link
                href={`/u/${post.authorUsername}`}
                className="flex items-center gap-1.5 hover:text-foreground"
              >
                <UserAvatar url={post.authorAvatarUrl ?? null} size="sm" />
                {post.authorUsername}
              </Link>
              <span aria-hidden>·</span>
            </>
          )}
          <span>
            {post.songCount} chart{post.songCount === 1 ? "" : "s"}
          </span>
          <span aria-hidden>·</span>
          <span>{formatDate(post.createdAt)}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete post"
            title="Delete post"
            className="rounded-lg p-1.5 text-muted hover:bg-background hover:text-danger"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onOpen}
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
        >
          View
        </button>
      </div>
    </li>
  );
}

/** The Community page's "Chord Charts" section (`Community.tsx`'s third view) — browse chord
    charts and playlists other people have posted, post your own, and import anything you find
    straight into your own Chord Charts library. Browsing only needs to be signed in; posting also
    needs the caller's own profile to be public (enforced server-side in
    `convex/communityChordCharts.ts`'s `create`, mirrored here so the "Post" button explains why
    it's unavailable instead of just failing). **Neither posting nor importing ever moves a song's
    `bars` through this component, or any component in this file** — both are single Convex
    mutation calls (`create`, `importIntoLibrary`) that copy directly between the relevant rows
    entirely server-side; the client only ever sends/receives song *ids* and small metadata. That
    replaced an earlier version that fetched bars client-side before posting, which broke on a
    real post of ~1,400 songs (Convex's 1024-field object limit, hit by a bulk bars lookup keyed
    by song id) — see `convex/communityChordCharts.ts`'s own comment for the full story. A
    Browse/My Posts toggle switches between the shared recent-posts feed (`list`, capped at the 60
    most recent across everyone) and every post the signed-in caller has posted (`mine`, uncapped)
    — added per a direct follow-up request, since a post could otherwise fall out of the shared
    feed with no way to find it again once enough other people had posted more recently. */
export default function CommunityChordCharts() {
  const profile = useQuery(api.profiles.getMine);
  const [view, setView] = useState<"browse" | "mine">("browse");
  const posts = useQuery(api.communityChordCharts.list);
  const minePosts = useQuery(api.communityChordCharts.mine);
  const removePost = useMutation(api.communityChordCharts.remove);
  const { playlists: myPlaylists, totalSongs } = useChordChartsLibrary(null);

  const [showCreate, setShowCreate] = useState(false);
  const [openPostId, setOpenPostId] = useState<Id<"communityChordCharts"> | null>(null);
  const [deletingId, setDeletingId] = useState<Id<"communityChordCharts"> | null>(null);
  const [query, setQuery] = useState("");

  const canPost = profile?.isPublic === true;
  const visiblePosts = view === "browse" ? posts : minePosts;
  // Matches either the post's own title or any chart's title inside it — a post named "Gig
  // setlist" full of standards is still findable by searching for one of those standards by name.
  const q = query.trim().toLowerCase();
  const filteredPosts = useMemo(() => {
    if (!visiblePosts || !q) return visiblePosts;
    return visiblePosts.filter(
      (post) =>
        post.title.toLowerCase().includes(q) ||
        post.songTitles.some((title) => title.toLowerCase().includes(q)),
    );
  }, [visiblePosts, q]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-sm text-muted">
          Chord charts and playlists other sheddex users have posted. Import one straight into
          your own Chord Charts library.
        </p>
        {profile !== undefined &&
          (canPost ? (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
            >
              <PlusIcon className="h-4 w-4" />
              Post a chart
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

      <div className="flex gap-1 self-start rounded-lg bg-surface p-1">
        <button
          type="button"
          onClick={() => setView("browse")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            view === "browse" ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
          }`}
        >
          Browse
        </button>
        <button
          type="button"
          onClick={() => setView("mine")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            view === "mine" ? "bg-accent text-accent-foreground" : "text-muted hover:text-foreground"
          }`}
        >
          My Posts{minePosts && minePosts.length > 0 ? ` (${minePosts.length})` : ""}
        </button>
      </div>

      {visiblePosts && visiblePosts.length > 0 && (
        <label className="flex items-center gap-2 rounded-lg bg-surface px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-accent">
          <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by post title or song name…"
            aria-label="Search chord chart posts"
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
          {q
            ? `No posts match "${query}".`
            : view === "browse"
              ? "Nobody's posted a chord chart yet — be the first."
              : "You haven't posted a chord chart yet."}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {filteredPosts.map((post) => (
            <PostListItem
              key={post.id}
              post={post}
              onOpen={() => setOpenPostId(post.id)}
              onDelete={
                view === "mine" || ("isMine" in post && post.isMine)
                  ? () => setDeletingId(post.id)
                  : undefined
              }
            />
          ))}
        </ul>
      )}

      {showCreate && (
        <CreatePostModal
          playlists={myPlaylists}
          totalSongs={totalSongs}
          onClose={() => setShowCreate(false)}
        />
      )}

      {openPostId && (
        <PostDetailModal
          id={openPostId}
          myPlaylists={myPlaylists}
          onClose={() => setOpenPostId(null)}
        />
      )}

      {deletingId && (
        <ConfirmDialog
          title="Delete this post?"
          message="This removes it from Community for everyone. It doesn't touch anyone who already imported it."
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

/** The "post a chart" form — picks one or more songs out of the caller's own Chord Charts
    library (nothing to paste here; you post what you've already imported there), grouped by
    playlist with its own select-the-whole-playlist checkbox, rather than one long flat list.
    Submitting sends only the selected songs' *ids* — `communityChordCharts.create` copies each
    song's data (including `bars`) straight from the caller's own storage into the post's, entirely
    server-side, so posting even a very large playlist never has to move its bar data through this
    component at all. */
function CreatePostModal({
  playlists: sourcePlaylists,
  totalSongs,
  onClose,
}: {
  playlists: LibraryPlaylist[];
  totalSongs: number;
  onClose: () => void;
}) {
  const create = useMutation(api.communityChordCharts.create);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "Unsorted" (songs with no playlist of their own) always sorts last, same order the tool's own
  // "Tunes" panel uses, so a chart's grouping looks the same wherever it's shown.
  const playlists = useMemo(() => {
    const real = sourcePlaylists
      .filter((p) => p.id !== UNSORTED_PLAYLIST_ID)
      .sort((a, b) => a.name.localeCompare(b.name));
    const unsorted = sourcePlaylists.filter((p) => p.id === UNSORTED_PLAYLIST_ID);
    return [...real, ...unsorted].map((p) => ({
      ...p,
      songs: [...p.songs].sort((a, b) => a.title.localeCompare(b.title)),
    }));
  }, [sourcePlaylists]);

  const q = query.trim().toLowerCase();
  const isSearching = q.length > 0;
  const visiblePlaylists = useMemo(() => {
    if (!isSearching) return playlists;
    return playlists
      .map((p) => ({
        ...p,
        songs: p.songs.filter(
          (s) => s.title.toLowerCase().includes(q) || s.composer.toLowerCase().includes(q),
        ),
      }))
      .filter((p) => p.songs.length > 0);
  }, [playlists, isSearching, q]);

  function toggleSong(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePlaylist(name: string, songs: LibrarySongMeta[]) {
    const ids = songs.map((s) => s.id);
    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
    const wasEmpty = selected.size === 0;
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
    // Picking a whole playlist as the very first selection defaults the post title to its name —
    // still just a starting point, freely editable, and never overwrites anything already typed.
    if (!allSelected && wasEmpty && !title.trim()) setTitle(name);
  }

  async function onSubmit() {
    setError(null);
    if (!title.trim()) {
      setError("Give this post a title.");
      return;
    }
    if (selected.size === 0) {
      setError("Pick at least one chart to post.");
      return;
    }
    setSubmitting(true);
    try {
      const songIds = [...selected] as Id<"chordChartSongs">[];
      await create({ title: title.trim(), description: description.trim(), songIds });
      onClose();
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
        aria-label="Post a chart to Community"
        className="flex w-full max-w-lg flex-col gap-4 rounded-2xl bg-surface p-5 text-left text-foreground shadow-2xl shadow-black/20"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Post to Community</h2>

        {totalSongs === 0 ? (
          <p className="text-sm text-muted">
            Your Chord Charts library is empty — import a playlist in the Chord Charts tool first,
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
                placeholder="e.g. Real Book vol. 1 standards"
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

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted">
                  Charts to include ({selected.size} selected)
                </span>
                {selected.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelected(new Set())}
                    className="text-xs font-medium text-muted hover:text-foreground"
                  >
                    Clear
                  </button>
                )}
              </div>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search your library…"
                className="rounded-lg bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent"
              />
              <div className="flex max-h-72 flex-col overflow-y-auto rounded-lg bg-background">
                {visiblePlaylists.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-muted">No charts match &quot;{query}&quot;.</p>
                ) : (
                  visiblePlaylists.map((playlist) => {
                    const selectedCount = playlist.songs.filter((s) => selected.has(s.id)).length;
                    const allSelected = selectedCount === playlist.songs.length;
                    const open = isSearching || !collapsed.has(playlist.id);
                    return (
                      <div
                        key={playlist.id}
                        className="border-b border-surface-hover last:border-0"
                      >
                        <div className="flex items-center gap-2 px-2 py-2">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            ref={(el) => {
                              if (el) el.indeterminate = selectedCount > 0 && !allSelected;
                            }}
                            onChange={() => togglePlaylist(playlist.name, playlist.songs)}
                            aria-label={`Select all of ${playlist.name}`}
                            className="h-4 w-4 shrink-0 accent-accent"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setCollapsed((prev) => {
                                const next = new Set(prev);
                                if (next.has(playlist.id)) next.delete(playlist.id);
                                else next.add(playlist.id);
                                return next;
                              })
                            }
                            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg py-0.5 text-left text-sm font-semibold hover:text-accent"
                          >
                            <svg
                              viewBox="0 0 20 20"
                              className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M5 8l5 5 5-5" />
                            </svg>
                            <span className="min-w-0 flex-1 truncate">{playlist.name}</span>
                            <span className="shrink-0 tabular-nums text-xs font-normal text-muted">
                              {selectedCount}/{playlist.songs.length}
                            </span>
                          </button>
                        </div>
                        {open && (
                          <ul className="pb-1 pl-8">
                            {playlist.songs.map((song) => (
                              <li key={song.id}>
                                <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-hover">
                                  <input
                                    type="checkbox"
                                    checked={selected.has(song.id)}
                                    onChange={() => toggleSong(song.id)}
                                    className="h-4 w-4 accent-accent"
                                  />
                                  <span className="min-w-0 flex-1 truncate">
                                    {song.title}
                                    {song.composer && (
                                      <span className="text-muted"> — {formatComposer(song.composer)}</span>
                                    )}
                                  </span>
                                </label>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
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
          {totalSongs > 0 && (
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

/** A single post's song list (metadata only — `communityChordCharts.get` never carries `bars`,
    same "list cheaply" split the personal library uses), each previewable inline on demand (one
    song's `bars`, lazily fetched only for whichever one is currently expanded — never the whole
    post at once) and importable individually, plus an "Import all" shortcut for the whole
    playlist. Both import actions call `communityChordCharts.importIntoLibrary` directly — a
    single mutation that copies server-side from the post's storage into the caller's own, never
    routing any song's `bars` through this component. Exported so `PublicProfilePage.tsx` can open
    the exact same detail view for a post reached from a profile's own "Chord Charts" section,
    rather than a second copy of this modal. */
export function PostDetailModal({
  id,
  myPlaylists,
  onClose,
}: {
  id: Id<"communityChordCharts">;
  myPlaylists: LibraryPlaylist[];
  onClose: () => void;
}) {
  const post = useQuery(api.communityChordCharts.get, { id });
  const importIntoLibrary = useMutation(api.communityChordCharts.importIntoLibrary);
  const [expandedId, setExpandedId] = useState<Id<"communityChordChartSongs"> | null>(null);
  const expandedBars = useQuery(
    api.communityChordCharts.getSongBars,
    expandedId ? { songId: expandedId } : "skip",
  );
  const [status, setStatus] = useState<string | null>(null);

  const haveKeys = useMemo(
    () => new Set(myPlaylists.flatMap((p) => p.songs).map(songKey)),
    [myPlaylists],
  );

  async function handleImport(songIds: Id<"communityChordChartSongs">[] | undefined, label: string) {
    const { added, skipped } = await importIntoLibrary({ postId: id, songIds });
    setStatus(
      added === 0
        ? `Already in your library.`
        : `Imported ${label} (${added} chart${added === 1 ? "" : "s"}${skipped > 0 ? `, ${skipped} already had` : ""}).`,
    );
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-overlay p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label={post?.title ?? "Community chart"}
        className="flex max-h-[85dvh] w-full max-w-2xl flex-col gap-3 overflow-hidden rounded-2xl bg-surface p-5 text-left text-foreground shadow-2xl shadow-black/20"
        onClick={(e) => e.stopPropagation()}
      >
        {post === undefined ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : post === null ? (
          <>
            <p className="text-sm text-muted">
              This post isn&apos;t available anymore — it may have been removed, or its author&apos;s
              profile is no longer public.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="self-end rounded-lg bg-background px-4 py-2 text-sm font-medium hover:bg-surface-hover"
            >
              Close
            </button>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold">{post.title}</h2>
                {post.authorUsername && (
                  <Link
                    href={`/u/${post.authorUsername}`}
                    className="flex items-center gap-1.5 text-xs text-muted hover:text-foreground"
                  >
                    <UserAvatar url={post.authorAvatarUrl} size="sm" />
                    {post.authorUsername}
                  </Link>
                )}
              </div>
              <button
                type="button"
                onClick={() => void handleImport(undefined, "all")}
                className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
              >
                <DownloadIcon className="h-4 w-4" />
                Import all
              </button>
            </div>
            {post.description && <p className="text-sm text-muted">{post.description}</p>}
            {status && <p className="text-xs text-accent">{status}</p>}

            <ul className="flex-1 overflow-y-auto">
              {post.songs.map((song) => {
                const have = haveKeys.has(songKey(song));
                const isExpanded = expandedId === song.id;
                return (
                  <li key={song.id} className="border-t border-background first:border-t-0">
                    <div className="flex items-center gap-2 py-2">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : song.id)}
                        className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-accent"
                      >
                        {song.title}
                        {song.composer && (
                          <span className="font-normal text-muted"> — {formatComposer(song.composer)}</span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleImport([song.id], song.title)}
                        disabled={have}
                        title={have ? "Already in your library" : "Import this chart"}
                        className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-background hover:text-foreground disabled:opacity-50"
                      >
                        {have ? <CheckIcon className="h-3.5 w-3.5" /> : <DownloadIcon className="h-3.5 w-3.5" />}
                        {have ? "Added" : "Import"}
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="mb-3 w-full max-w-full">
                        {expandedBars === undefined ? (
                          <div className="flex justify-center py-4">
                            <LoadingSpinner />
                          </div>
                        ) : (
                          <ChordChart
                            song={{
                              title: song.title,
                              composer: song.composer,
                              style: song.style,
                              key: song.key,
                              timeSignature: song.timeSignature,
                              bars: (expandedBars as Bar[] | null) ?? [],
                            }}
                            barsPerRow={4}
                          />
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            <button
              type="button"
              onClick={onClose}
              className="self-end rounded-lg bg-background px-4 py-2 text-sm font-medium hover:bg-surface-hover"
            >
              Close
            </button>
          </>
        )}
      </div>
    </div>
  );
}
