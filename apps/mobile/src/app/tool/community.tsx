import { api } from '@jam-practice/convex/_generated/api';
import type { Tune } from '@jam-practice/core/types';
import { useConvexAuth } from '@convex-dev/auth/react';
import { useQuery } from 'convex/react';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CreatePostModal,
  PostListItem,
  CommunityTunes,
} from '@/components/community/CommunityTunes';
import { FollowLists } from '@/components/community/FollowLists';
import { TAB_BAR_CONTENT_HEIGHT } from '@/components/FloatingTabBar';
import { HeaderBackButton } from '@/components/HeaderBackButton';
import { CloseIcon, FeedIcon, FollowersIcon, HeartIcon, PlusIcon, SearchIcon } from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { UserAvatar } from '@/components/UserAvatar';
import { useSyncedTunes } from '@/lib/useSyncedTunes';
import { useAppTheme } from '@/theme/ThemeProvider';

type CommunityView = 'feed' | 'search';
type SearchScope = 'all' | 'users' | 'charts';

const VIEW_TABS: { key: CommunityView; label: string; icon: typeof FeedIcon }[] = [
  { key: 'feed', label: 'Feed', icon: FeedIcon },
  { key: 'search', label: 'Search', icon: SearchIcon },
];

const SEARCH_SCOPES: { key: SearchScope; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'users', label: 'Users' },
  { key: 'charts', label: 'Chord Charts' },
];

/**
 * Community — a heart button top-left opens Liked Posts, a top-right "+" opens the post composer,
 * and a followers icon next to it opens who-you-follow/who-follows-you. The main surface is either
 * **Feed** (`CommunityTunes`, everyone's posts, newest first) or **Search** (a scope selector —
 * All/Users/Chord Charts — on top of a username search, so searching "across all of Community"
 * and searching one specific kind are both possible from the same place). Tapping any post row,
 * here or in Search, opens its own full page (`/post/[id].tsx`).
 *
 * **There is only one thing to post here, period.** This used to have a separate chord-chart-only
 * post type (`CommunityChordCharts.tsx`, its own tab, its own composer) alongside the tune-post
 * type — removed per an explicit request: "this whole tune and chord chart separation is quite
 * confusing and i want to just have one thing you post." A chord chart can now only ever reach
 * Community by being attached to a tune first (the tune editor's own "Linked chord chart" field,
 * built earlier the same session) — posting that tune brings the chart along automatically
 * (`communityTunes.create`'s own `resolveLinkedChart` call), and `TunePostSummary.chartCount`
 * (and the "Chord Charts" search scope here, which filters to posts where it's `> 0`) is what
 * still makes a chart specifically findable, satisfying "but i still want to be able to search
 * for chord charts" without needing a second post type to do it. The "+" button no longer shows a
 * chart-vs-tune chooser — it opens `CommunityTunes`'s own composer directly, since there's nothing
 * left to choose between.
 */
export default function CommunityScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { isLoading, isAuthenticated } = useConvexAuth();
  const [view, setView] = useState<CommunityView>('feed');
  const [showFollowers, setShowFollowers] = useState(false);
  const [showComposer, setShowComposer] = useState(false);
  const [myTunes] = useSyncedTunes();

  const posts = useQuery(api.communityTunes.list);
  const likedIds = useQuery(api.communityTunes.myLikes);
  const likedSet = useMemo(() => new Set(likedIds ?? []), [likedIds]);

  const [searchScope, setSearchScope] = useState<SearchScope>('all');
  const [query, setQuery] = useState('');
  const trimmedQuery = query.trim();
  const q = trimmedQuery.toLowerCase();
  const userResults = useQuery(
    api.profiles.search,
    trimmedQuery && (searchScope === 'all' || searchScope === 'users') ? { query: trimmedQuery } : 'skip',
  );
  const matchingPosts = useMemo(() => {
    if (!posts || !q || searchScope === 'users') return [];
    return posts.filter((p) => {
      if (searchScope === 'charts' && p.chartCount === 0) return false;
      return (
        p.title.toLowerCase().includes(q) ||
        p.tuneNames.some((t) => t.toLowerCase().includes(q)) ||
        p.chartTitles.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [posts, q, searchScope]);
  const noSearchResults =
    trimmedQuery.length > 0 &&
    (searchScope === 'all' || searchScope === 'users' ? (userResults?.length ?? 0) === 0 : true) &&
    (searchScope === 'all' || searchScope === 'charts' ? matchingPosts.length === 0 : true) &&
    userResults !== undefined &&
    posts !== undefined;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: 'Community',
          headerLeft: () => <HeaderBackButton />,
          headerRight: () => (
            <View className="flex-row items-center gap-1">
              <Pressable
                onPress={() => (isAuthenticated ? router.push('/liked-posts') : router.push('/profile'))}
                accessibilityLabel="Liked posts"
                className="h-9 w-9 items-center justify-center rounded-full"
              >
                <HeartIcon color={colors.foreground} size={20} />
              </Pressable>
              <Pressable
                onPress={() => (isAuthenticated ? setShowFollowers(true) : router.push('/profile'))}
                accessibilityLabel="Followers and following"
                className="h-9 w-9 items-center justify-center rounded-full"
              >
                <FollowersIcon color={colors.foreground} size={20} />
              </Pressable>
              <Pressable
                onPress={() => (isAuthenticated ? setShowComposer(true) : router.push('/profile'))}
                accessibilityLabel="New post"
                className="h-9 w-9 items-center justify-center rounded-full"
                style={{ backgroundColor: colors.accent }}
              >
                <PlusIcon color={colors['accent-foreground']} size={18} />
              </Pressable>
            </View>
          ),
        }}
      />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, flexShrink: 0 }}
          contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' }}
        >
          {VIEW_TABS.map((tab) => {
            const selected = view === tab.key;
            const Icon = tab.icon;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setView(tab.key)}
                className="flex-row items-center gap-1.5 rounded-full px-4 py-2.5"
                style={{ backgroundColor: selected ? colors.accent : colors.surface }}
              >
                <Icon color={selected ? colors['accent-foreground'] : colors.foreground} size={15} />
                <Text
                  numberOfLines={1}
                  className="text-sm font-bold font-inter-bold"
                  style={{ color: selected ? colors['accent-foreground'] : colors.foreground }}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {view === 'feed' ? (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 16 + TAB_BAR_CONTENT_HEIGHT, gap: 12 }}
            keyboardShouldPersistTaps="handled"
          >
            {isLoading ? (
              <View className="items-center py-4">
                <LoadingSpinner />
              </View>
            ) : !isAuthenticated ? (
              <View className="items-center gap-2 rounded-2xl p-5" style={{ backgroundColor: colors.surface }}>
                <Text className="text-center text-sm font-inter" style={{ color: colors.muted }}>
                  Sign in to see what sheddex users have posted.
                </Text>
              </View>
            ) : (
              <CommunityTunes />
            )}
          </ScrollView>
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 16 + TAB_BAR_CONTENT_HEIGHT, gap: 12 }}
            keyboardShouldPersistTaps="handled"
          >
            <View className="flex-row items-center gap-2 rounded-xl px-3" style={{ backgroundColor: colors.surface }}>
              <SearchIcon color={colors.muted} size={16} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={
                  searchScope === 'users'
                    ? 'Search by username'
                    : searchScope === 'charts'
                      ? 'Search posted chord charts'
                      : 'Search all of Community'
                }
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                className="font-inter flex-1"
                style={{ color: colors.foreground, paddingVertical: 10 }}
              />
            </View>

            <View className="flex-row flex-wrap gap-2">
              {SEARCH_SCOPES.map((s) => {
                const selected = searchScope === s.key;
                return (
                  <Pressable
                    key={s.key}
                    onPress={() => setSearchScope(s.key)}
                    className="rounded-full px-3 py-1.5"
                    style={{ backgroundColor: selected ? colors.accent : colors.surface }}
                  >
                    <Text
                      className="text-xs font-bold font-inter-bold"
                      style={{ color: selected ? colors['accent-foreground'] : colors.foreground }}
                    >
                      {s.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {isLoading ? (
              <View className="items-center py-4">
                <LoadingSpinner />
              </View>
            ) : trimmedQuery.length === 0 ? (
              <Text className="text-center text-sm font-inter" style={{ color: colors.muted }}>
                {searchScope === 'users'
                  ? 'Start typing a username to search.'
                  : searchScope === 'charts'
                    ? 'Start typing to search posts with a chord chart attached.'
                    : 'Start typing to search users and posts.'}
              </Text>
            ) : !isAuthenticated && searchScope !== 'users' ? (
              <View className="items-center gap-2 rounded-2xl p-5" style={{ backgroundColor: colors.surface }}>
                <Text className="text-center text-sm font-inter" style={{ color: colors.muted }}>
                  Sign in to search community posts.
                </Text>
              </View>
            ) : noSearchResults ? (
              <Text className="text-center text-sm font-inter" style={{ color: colors.muted }}>
                No results for &ldquo;{trimmedQuery}&rdquo;.
              </Text>
            ) : (
              <View className="gap-5">
                {(searchScope === 'all' || searchScope === 'users') && (userResults === undefined || userResults.length > 0) ? (
                  <View className="gap-2">
                    {searchScope === 'all' ? (
                      <Text className="text-xs font-bold font-inter-bold" style={{ color: colors.muted }}>
                        Users
                      </Text>
                    ) : null}
                    {userResults === undefined ? (
                      <View className="items-center py-2">
                        <LoadingSpinner size="sm" />
                      </View>
                    ) : (
                      userResults.map((profile) => (
                        <Pressable
                          key={profile.userId}
                          onPress={() => router.push({ pathname: '/u/[username]', params: { username: profile.username } })}
                          className="flex-row items-center gap-3 rounded-xl p-3"
                          style={{ backgroundColor: colors.surface }}
                        >
                          <UserAvatar url={profile.avatarUrl} />
                          <View className="min-w-0 flex-1">
                            <Text numberOfLines={1} className="font-inter-semibold text-sm" style={{ color: colors.foreground }}>
                              {profile.username}
                            </Text>
                            {profile.instruments.length > 0 ? (
                              <Text numberOfLines={1} className="text-xs font-inter" style={{ color: colors.muted }}>
                                {profile.instruments.join(', ')}
                              </Text>
                            ) : null}
                          </View>
                        </Pressable>
                      ))
                    )}
                  </View>
                ) : null}

                {(searchScope === 'all' || searchScope === 'charts') && isAuthenticated && matchingPosts.length > 0 ? (
                  <View className="gap-2">
                    {searchScope === 'all' ? (
                      <Text className="text-xs font-bold font-inter-bold" style={{ color: colors.muted }}>
                        Posts
                      </Text>
                    ) : null}
                    {matchingPosts.map((post) => (
                      <PostListItem key={post.id} post={post} liked={likedSet.has(post.id)} />
                    ))}
                  </View>
                ) : null}
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>

      {showFollowers ? (
        <Modal visible animationType="slide" onRequestClose={() => setShowFollowers(false)}>
          <View className="flex-1" style={{ backgroundColor: colors.background }}>
            <SafeAreaView className="flex-1" edges={['top', 'bottom']}>
              <View className="flex-row items-center justify-between px-4 pt-2">
                <Text className="text-lg font-semibold font-inter-semibold" style={{ color: colors.foreground }}>
                  Following & followers
                </Text>
                <Pressable
                  onPress={() => setShowFollowers(false)}
                  accessibilityLabel="Close"
                  className="h-9 w-9 items-center justify-center rounded-full"
                  style={{ backgroundColor: colors.surface }}
                >
                  <CloseIcon color={colors.muted} size={16} />
                </Pressable>
              </View>
              <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
                <FollowLists />
              </ScrollView>
            </SafeAreaView>
          </View>
        </Modal>
      ) : null}

      {showComposer ? <NewPostGate onClose={() => setShowComposer(false)} library={myTunes as Tune[]} /> : null}
    </View>
  );
}

/** The "+" button's own gate — posting needs the caller's own profile to be public (per
    `communityTunes.create`'s own requirement), checked once here so the composer itself
    (`CreatePostModal`) never has to. Opens that composer directly once allowed — there's no
    chart-vs-tune choice to make anymore, since a chart only ever reaches Community by riding
    along on a tune (see this screen's own doc comment). */
function NewPostGate({ onClose, library }: { onClose: () => void; library: Tune[] }) {
  const { colors } = useAppTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const profile = useQuery(api.profiles.getMine);
  const canPost = profile?.isPublic === true;

  if (profile === undefined) {
    return (
      <Modal visible transparent animationType="slide" onRequestClose={onClose}>
        <View style={{ flex: 1 }}>
          <Pressable style={{ flex: 1, backgroundColor: `${colors.overlay}99` }} onPress={onClose} accessibilityLabel="Close" />
          <View className="items-center rounded-t-3xl p-8" style={{ backgroundColor: colors.surface, paddingBottom: insets.bottom + 20 }}>
            <LoadingSpinner />
          </View>
        </View>
      </Modal>
    );
  }

  if (!canPost) {
    return (
      <Modal visible transparent animationType="slide" onRequestClose={onClose}>
        <View style={{ flex: 1 }}>
          <Pressable style={{ flex: 1, backgroundColor: `${colors.overlay}99` }} onPress={onClose} accessibilityLabel="Close" />
          <View className="gap-3 rounded-t-3xl p-5" style={{ backgroundColor: colors.surface, paddingBottom: insets.bottom + 20 }}>
            <Text className="text-lg font-semibold font-inter-semibold" style={{ color: colors.foreground }}>
              New post
            </Text>
            <Pressable
              onPress={() => {
                onClose();
                router.push('/profile');
              }}
              className="rounded-xl p-4"
              style={{ backgroundColor: colors.background }}
            >
              <Text className="text-sm font-inter" style={{ color: colors.muted }}>
                <Text className="font-inter-semibold" style={{ color: colors.accent }}>
                  Make your profile public
                </Text>{' '}
                (Profile → Public Profile) before posting to Community.
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  return <CreatePostModal library={library} onClose={onClose} />;
}
