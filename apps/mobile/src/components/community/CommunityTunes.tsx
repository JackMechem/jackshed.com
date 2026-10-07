import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { toPublicTune } from '@jam-practice/core/profileTunes';
import type { Tune } from '@jam-practice/core/types';
import * as Clipboard from 'expo-clipboard';
import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CheckIcon, ChordChartIcon, CloseIcon, EyeOffIcon, HeartIcon, LinkIcon, SearchIcon, ShareIcon, TrashIcon } from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { SwitchRow } from '@/components/SwitchRow';
import { UserAvatar } from '@/components/UserAvatar';
import { useAppTheme } from '@/theme/ThemeProvider';

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString();
}

export type TunePostSummary = {
  id: Id<'communityTunes'>;
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
  /** Only present on `communityTunes.list`'s own rows (the shared Feed) — `communityTunes.mine`'s
      rows don't need it, since every row returned from there is already the caller's own by
      construction (`MyPostsTab.tsx` always allows delete, regardless of this field). */
  isMine?: boolean;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="gap-1.5">
      <Text className="text-sm font-semibold font-inter-semibold" style={{ color: colors.muted }}>
        {label}
      </Text>
      {children}
    </View>
  );
}

/** A bottom-sheet `Modal` shell for `CreatePostModal` below — the same rounded-top,
    backdrop-`Pressable`-to-close shape used throughout this app for "a form in a modal." */
function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable
          style={{ flex: 1, backgroundColor: `${colors.overlay}99` }}
          onPress={onClose}
          accessibilityLabel="Close"
        />
        <View
          className="rounded-t-3xl"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            maxHeight: '90%',
            backgroundColor: colors.surface,
            paddingBottom: insets.bottom + 12,
          }}
        >
          {children}
        </View>
      </View>
    </Modal>
  );
}

/** The big heart-over-count like button, filling the slot a "View" pill used to sit in — per a
    direct request to make it bigger and move it there, now that tapping the row itself (not a
    button) is what opens a post (see `PostListItem`'s own doc comment). Owns the `toggleLike`
    mutation call itself (rather than taking an `onToggle` callback every caller would have to wire
    up identically) since every caller does the exact same thing with it. `liked` is computed by
    the caller from a single `myLikes` query fetched once per screen (never a per-row query, see
    `myLikes`'s own doc comment in `packages/convex/communityTunes.ts`) — `liked-posts.tsx` is the
    one exception, where every row is already known to be liked by definition, so it just passes
    `liked` as a constant `true`. Only ever rendered somewhere already gated behind being signed
    in, so there's no "sign in to like" affordance here — `toggleLike` itself still throws
    defensively if that's ever not true. */
function LikeButton({
  postId,
  liked,
  count,
}: {
  postId: Id<'communityTunes'>;
  liked: boolean;
  count: number;
}) {
  const { colors } = useAppTheme();
  const toggleLike = useMutation(api.communityTunes.toggleLike);
  return (
    <Pressable
      onPress={() => void toggleLike({ id: postId })}
      accessibilityLabel={liked ? 'Unlike this post' : 'Like this post'}
      hitSlop={6}
      className="flex-row items-center gap-1.5 rounded-xl px-3 py-1.5"
    >
      <Text className="text-sm font-bold font-inter-bold" style={{ color: liked ? colors.danger : colors.muted }}>
        {count}
      </Text>
      <HeartIcon color={liked ? colors.danger : colors.muted} size={22} filled={liked} />
    </Pressable>
  );
}

/** One post's row — the whole card is tappable (navigates to `/post/[id]`, the post's own full
    page) except the author's own name/avatar, which goes to their profile instead; nested
    `Pressable`s correctly claim the touch before it reaches the outer row's own, the same
    "RN hit-tests to whichever interactive element is actually under the finger" behavior this
    app's favorite-star buttons already rely on, so no manual event handling is needed for that
    split. Replaces an earlier "View" pill per a direct request — "i should just be able to click
    on the post... clicking on the post should open the post up in a full page" — once that pill
    was gone, the slot it left became room for a bigger `LikeButton` instead (also requested
    directly), with Share and (when offered) Delete as a small icon row above it. Exported so
    `u/[username].tsx`/`liked-posts.tsx`/`MyPostsTab.tsx` render posts identically to Community's
    own Feed. */
export function PostListItem({
  post,
  liked,
  onDelete,
}: {
  post: TunePostSummary;
  liked: boolean;
  onDelete?: () => void;
}) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  async function handleShare() {
    try {
      await Clipboard.setStringAsync(`https://sheddex.com/post/${post.id}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable — nothing else to fall back to from a list row.
    }
  }

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/post/[id]', params: { id: post.id } })}
      className="flex-row items-center gap-3 rounded-xl p-4"
      style={{ backgroundColor: colors.surface }}
    >
      <View className="min-w-0 flex-1 gap-1.5">
        <Text numberOfLines={1} className="text-base font-semibold font-inter-semibold" style={{ color: colors.foreground }}>
          {post.title}
        </Text>
        {post.description ? (
          <Text numberOfLines={2} className="text-sm font-inter" style={{ color: colors.muted }}>
            {post.description}
          </Text>
        ) : null}
        <View className="flex-row flex-wrap items-center gap-1.5">
          {post.authorUsername ? (
            <Pressable
              onPress={() => router.push({ pathname: '/u/[username]', params: { username: post.authorUsername! } })}
              className="flex-row items-center gap-1.5"
              hitSlop={4}
            >
              <UserAvatar url={post.authorAvatarUrl ?? null} size="sm" />
              <Text className="text-xs font-inter" style={{ color: colors.muted }}>
                {post.authorUsername}
              </Text>
            </Pressable>
          ) : null}
          <Text className="text-xs font-inter" style={{ color: colors.muted }}>
            {post.authorUsername ? '· ' : ''}
            {post.tuneCount} tune{post.tuneCount === 1 ? '' : 's'} · {formatDate(post.createdAt)}
          </Text>
          {post.chartCount > 0 ? (
            <View className="flex-row items-center gap-1 rounded-full px-2 py-0.5" style={{ backgroundColor: `${colors.accent}1a` }}>
              <ChordChartIcon color={colors.accent} size={11} />
              <Text className="text-xs font-inter-semibold" style={{ color: colors.accent }}>
                {post.chartCount}
              </Text>
            </View>
          ) : null}
          {post.unlisted ? (
            <View className="flex-row items-center gap-1 rounded-full px-2 py-0.5" style={{ backgroundColor: colors.background }}>
              <EyeOffIcon color={colors.muted} size={10} />
              <Text className="text-xs font-inter-semibold" style={{ color: colors.muted }}>
                Unlisted
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View className="shrink-0 items-center gap-1.5">
        <View className="flex-row items-center gap-1">
          <Pressable
            onPress={() => void handleShare()}
            accessibilityLabel="Copy a link to this post"
            hitSlop={6}
            className="h-8 w-8 items-center justify-center rounded-lg"
          >
            {copied ? (
              <CheckIcon color={colors.accent} size={14} />
            ) : (
              <ShareIcon color={colors.muted} size={14} />
            )}
          </Pressable>
          {onDelete ? (
            <Pressable
              onPress={onDelete}
              accessibilityLabel="Delete post"
              hitSlop={6}
              className="h-8 w-8 items-center justify-center rounded-lg"
            >
              <TrashIcon color={colors.muted} size={14} />
            </Pressable>
          ) : null}
        </View>
        <LikeButton postId={post.id} liked={liked} count={post.likeCount} />
      </View>
    </Pressable>
  );
}

/**
 * Community's **one and only post type**, browse-everyone's-posts view — Feed (`community.tsx`).
 * Each post is a tune or tune list, optionally carrying its own linked chord chart, added
 * automatically from whichever tune it's attached to (see `TunePostSummary.chartCount`'s own
 * comment for why there's no separate "post a chart" flow). Browsing only needs to be signed in
 * (enforced by the caller). Tapping a row navigates to `/post/[id].tsx`, the post's own full page
 * (a direct request — "improve the post screen, ideally make it a full page that it goes to,"
 * replacing an earlier bottom-sheet modal), which is where the actual tune list renders, through
 * `PublicTuneList` — the exact same component a public profile's own Tunes section uses, and
 * which already shows/lets you view a tune's linked chart — so "add"/"learn" there behaves
 * identically (same dedupe-by-name check, same fresh-id copy) instead of a second copy of that
 * logic.
 *
 * **Deliberately doesn't have its own "New post" button or a Browse/My Posts toggle** — an earlier
 * version had both, and Jack called it out directly from a screenshot as genuinely confusing: a
 * second "+"-shaped button right below `community.tsx`'s own global one, and a toggle whose "My
 * Posts" half duplicated something that belongs on your own Profile instead ("my posts should be
 * in the profile section of the app"). Posting is reachable only through `community.tsx`'s own
 * header "+"; your own posts live on `MyPostsTab.tsx` (`app/profile.tsx`'s own "Posts" tab,
 * `communityTunes.mine`), the same place every other "manage your own stuff" surface in this app
 * already lives. This component is purely "what has everyone (including you) posted, newest
 * first" — a post you see here that happens to be your own can still be deleted right from its own
 * row (`isMine`), it just isn't the primary way to find an *older* one of your own that's since
 * fallen out of `list`'s 60-post cap — that's what `MyPostsTab` (`communityTunes.mine`, uncapped,
 * scoped to the caller) is for.
 *
 * The list is a plain `View`+`.map()`, not a `FlatList` — this component always mounts inside
 * `community.tsx`'s own outer `ScrollView`, and `list`'s 60-post cap keeps it genuinely bounded
 * regardless.
 */
export function CommunityTunes() {
  const { colors } = useAppTheme();
  const posts = useQuery(api.communityTunes.list);
  const likedIds = useQuery(api.communityTunes.myLikes);
  const removePost = useMutation(api.communityTunes.remove);

  const [deletingId, setDeletingId] = useState<Id<'communityTunes'> | null>(null);

  const likedSet = useMemo(() => new Set(likedIds ?? []), [likedIds]);

  return (
    <View className="gap-4">
      {posts === undefined ? (
        <View className="items-center py-8">
          <LoadingSpinner />
        </View>
      ) : posts.length === 0 ? (
        <Text
          className="rounded-2xl p-5 text-center text-sm font-inter"
          style={{ backgroundColor: colors.surface, color: colors.muted }}
        >
          Nobody&apos;s posted yet — be the first.
        </Text>
      ) : (
        <View className="gap-2">
          {posts.map((post) => (
            <PostListItem
              key={post.id}
              post={post}
              liked={likedSet.has(post.id)}
              onDelete={post.isMine ? () => setDeletingId(post.id) : undefined}
            />
          ))}
        </View>
      )}

      <ConfirmDialog
        visible={deletingId !== null}
        title="Delete this post?"
        message="This removes it from Community for everyone. It doesn't touch anyone who already added it."
        confirmLabel="Delete"
        onConfirm={() => {
          if (deletingId) void removePost({ id: deletingId });
          setDeletingId(null);
        }}
        onCancel={() => setDeletingId(null)}
      />
    </View>
  );
}

/** The "new post" form — picks one or more tunes out of the caller's own Tunes list and snapshots
    them, notes stripped (`toPublicTune`), into a new Community post via `communityTunes.create`.
    A tune that's already linked to one of the caller's own chord charts (`Tune.chordChartId`, set
    via the tune editor's own "Linked chord chart" field) shows a small chart icon in this picker
    so it's clear which ones will bring their chart along — the server resolves and attaches it
    automatically (`communityTunes.create`'s own `resolveLinkedChart` call), nothing extra to pick
    here. The tune list is a plain `FlatList` (the sole scrolling area of this modal, never nested
    inside another scroll container) rather than a `View`+`.map()` — a tune list is usually small,
    but there's no fixed cap on it the way `list`'s browse feed has, so this matches the
    virtualize-by-default convention this app's other pickers use. */
export function CreatePostModal({ library, onClose }: { library: Tune[]; onClose: () => void }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const create = useMutation(api.communityTunes.create);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [unlisted, setUnlisted] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(() => [...library].sort((a, b) => a.name.localeCompare(b.name)), [library]);
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
      setError('Give this post a title.');
      return;
    }
    if (selected.size === 0) {
      setError('Pick at least one tune to post.');
      return;
    }
    setSubmitting(true);
    try {
      const tunes = library.filter((t) => selected.has(t.id)).map(toPublicTune);
      const id = await create({ title: title.trim(), description: description.trim(), tunes, unlisted });
      onClose();
      router.push({ pathname: '/post/[id]', params: { id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't post that.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Sheet onClose={onClose}>
      <View className="flex-row items-center justify-between px-5 pb-3 pt-4">
        <Text className="text-lg font-semibold font-inter-semibold" style={{ color: colors.foreground }}>
          Post to Community
        </Text>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          className="h-9 w-9 items-center justify-center rounded-full"
          style={{ backgroundColor: colors.background }}
        >
          <CloseIcon color={colors.muted} size={16} />
        </Pressable>
      </View>

      {library.length === 0 ? (
        <View className="gap-3 px-5 pb-5">
          <Text className="text-sm font-inter" style={{ color: colors.muted }}>
            Your Tunes list is empty — add a tune in Jam Practice or the Profile → Tunes tab first,
            then come back here to post from it.
          </Text>
        </View>
      ) : (
        <>
          <View className="gap-3 px-5 pb-3">
            <Field label="Title">
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Bossa nova gig setlist"
                placeholderTextColor={colors.muted}
                className="rounded-lg px-3 py-2.5 text-base font-inter"
                style={{ backgroundColor: colors.background, color: colors.foreground }}
              />
            </Field>
            <Field label="Description (optional)">
              <TextInput
                value={description}
                onChangeText={setDescription}
                multiline
                numberOfLines={2}
                placeholderTextColor={colors.muted}
                className="rounded-lg px-3 py-2.5 text-sm font-inter"
                style={{ backgroundColor: colors.background, color: colors.foreground, minHeight: 56, textAlignVertical: 'top' }}
              />
            </Field>
            <SwitchRow
              label="Unlisted"
              checked={unlisted}
              onChange={setUnlisted}
              hint="Won't show up in Community's feed or search, or on your public profile — only people with the link can see it."
            />
            <Text className="text-sm font-semibold font-inter-semibold" style={{ color: colors.muted }}>
              Tunes to include ({selected.size} selected)
            </Text>
            <View className="flex-row items-center gap-2 rounded-lg px-3" style={{ backgroundColor: colors.background }}>
              <SearchIcon color={colors.muted} size={15} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search your tunes…"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                className="flex-1 text-sm font-inter"
                style={{ color: colors.foreground, paddingVertical: 8 }}
              />
            </View>
          </View>

          <FlatList
            data={filtered}
            keyExtractor={(tune) => tune.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
            ListEmptyComponent={
              <Text className="py-3 text-sm font-inter" style={{ color: colors.muted }}>
                No tunes match &ldquo;{query}&rdquo;.
              </Text>
            }
            renderItem={({ item: tune }) => (
              <Pressable onPress={() => toggle(tune.id)} className="flex-row items-center gap-2.5 py-1.5">
                <View
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 5,
                    borderWidth: selected.has(tune.id) ? 0 : 1.5,
                    borderColor: colors.muted,
                    backgroundColor: selected.has(tune.id) ? colors.accent : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {selected.has(tune.id) ? <CheckIcon color={colors['accent-foreground']} size={12} /> : null}
                </View>
                <Text numberOfLines={1} className="min-w-0 flex-1 text-sm font-inter" style={{ color: colors.foreground }}>
                  {tune.name}
                </Text>
                {tune.chordChartId ? <LinkIcon color={colors.accent} size={13} /> : null}
              </Pressable>
            )}
          />

          {error ? (
            <Text className="px-5 pt-2 text-sm font-inter" style={{ color: colors.danger }}>
              {error}
            </Text>
          ) : null}

          <View className="flex-row justify-end gap-2 px-5 pt-3">
            <Pressable onPress={onClose} className="rounded-lg px-4 py-2" style={{ backgroundColor: colors.background }}>
              <Text className="text-sm font-semibold font-inter-semibold" style={{ color: colors.foreground }}>
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void onSubmit()}
              disabled={submitting}
              className="rounded-lg px-4 py-2"
              style={{ backgroundColor: colors.accent, opacity: submitting ? 0.5 : 1 }}
            >
              <Text className="text-sm font-semibold font-inter-semibold" style={{ color: colors['accent-foreground'] }}>
                {submitting ? 'Posting…' : 'Post'}
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </Sheet>
  );
}
