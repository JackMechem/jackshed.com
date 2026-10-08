import { NAV_LINKS_DATA, filterNavLinks, groupByCategory, hrefToSlug, type NavLinkInfo } from '@jam-practice/core/navLinks';
import type { Tune } from '@jam-practice/core/types';
import { Stack, useRouter } from 'expo-router';
import { useMemo, useState, type ComponentType, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { TAB_BAR_CONTENT_HEIGHT } from '@/components/FloatingTabBar';
import {
  ChevronRightIcon,
  ChordChartIcon,
  ClearIcon,
  MusicNoteIcon,
  NAV_LINK_ICONS,
  SearchIcon,
  SetlistIcon,
  ThemeIcon,
  type IconProps,
} from '@/components/icons';
import { TAB_HREFS, ToolRow, ToolTile, chunk } from '@/components/ToolGrid';
import { ScreenSpinner, withScreenLoader } from '@/components/ScreenLoader';
import { Logo } from '@/components/Logo';
import { useRecentItems } from '@/lib/chordChartRecents';
import { useRecentTools } from '@/lib/toolRecents';
import { useChordChartsLibrary } from '@/lib/useChordChartsLibrary';
import { useFavorites } from '@/lib/useFavorites';
import { useSetlists } from '@/lib/useSetlists';
import { tuneSummary, useTuneLists, type TuneListId } from '@/lib/useTuneList';
import { useAppTheme } from '@/theme/ThemeProvider';

/** Shown in place of Favorites until you've starred some tools. */
const STARTER_HREFS = ['/metronome', '/jam-practice', '/tuner', '/practice-timer'];
const TOOLS = NAV_LINKS_DATA.filter((l) => !TAB_HREFS.includes(l.href));
const TOOL_BY_HREF = new Map(TOOLS.map((l) => [l.href, l]));

/**
 * Home — an overview with the tools front and centre: your favorite tools as big cards (a starter
 * set until you star some), "Jump back in" (the tools, tunes and charts you opened last), your
 * library at a glance (tunes, setlists, charts — each opening its page), then every tool by
 * category. The search finds tools and your tunes.
 */
function Home() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const [query, setQuery] = useState('');
  const { favorites, toggleFavorite, ready } = useFavorites();
  const recentTools = useRecentTools();
  const recentItems = useRecentItems();
  const { lists, ready: tunesReady } = useTuneLists();
  const { setlists } = useSetlists();
  const { playlists, totalSongs } = useChordChartsLibrary(null);

  const q = query.trim();
  const openTool = (item: NavLinkInfo) => router.push(`/tool/${hrefToSlug(item.href)}`);

  const chartMeta = useMemo(() => {
    const m = new Map<string, { title: string; key: string }>();
    for (const p of playlists) for (const s of p.songs) m.set(s.id, { title: s.title, key: s.key });
    return m;
  }, [playlists]);

  const tuneMatches = useMemo(() => {
    if (!q) return [];
    const words = q.toLowerCase().split(/\s+/);
    const out: { tune: Tune; list: TuneListId }[] = [];
    for (const list of ['tunes', 'learn'] as TuneListId[]) {
      for (const tune of lists[list].tunes) if (words.every((w) => tune.name.toLowerCase().includes(w))) out.push({ tune, list });
    }
    return out.slice(0, 8);
  }, [q, lists]);

  if (!ready || !tunesReady) {
    return (
      <View className="flex-1" style={{ backgroundColor: colors.background }}>
        <Stack.Screen options={{ headerShown: false }} />
        <ScreenSpinner />
      </View>
    );
  }

  const favoriteTools = TOOLS.filter((t) => favorites.includes(t.href));
  const pinned = favoriteTools.length ? favoriteTools : TOOLS.filter((t) => STARTER_HREFS.includes(t.href));

  // "Jump back in": recent tools first, then recent tunes and charts.
  const jumpCards: { key: string; Icon: ComponentType<IconProps>; title: string; detail: string; onPress: () => void }[] = [];
  for (const href of recentTools) {
    const tool = TOOL_BY_HREF.get(href);
    const Icon = NAV_LINK_ICONS[href];
    if (tool && Icon) jumpCards.push({ key: href, Icon, title: tool.label, detail: 'Tool', onPress: () => openTool(tool) });
    if (jumpCards.length >= 4) break;
  }
  for (const item of recentItems) {
    if (jumpCards.length >= 10) break;
    if (item.kind === 'tune') {
      const list = (['tunes', 'learn'] as TuneListId[]).find((l) => lists[l].tunes.some((t) => t.id === item.id));
      const tune = list ? lists[list].tunes.find((t) => t.id === item.id) : undefined;
      if (list && tune) {
        jumpCards.push({
          key: `t:${tune.id}`,
          Icon: MusicNoteIcon,
          title: tune.name,
          detail: 'Tune',
          onPress: () => router.push({ pathname: '/library/tune', params: { list, id: tune.id } }),
        });
      }
    } else {
      const meta = chartMeta.get(item.id);
      if (meta) {
        jumpCards.push({
          key: `c:${item.id}`,
          Icon: ChordChartIcon,
          title: meta.title,
          detail: meta.key ? `Chart · ${meta.key}` : 'Chart',
          onPress: () => router.push({ pathname: '/tool/chord-charts-view', params: { id: item.id } }),
        });
      }
    }
  }

  const toolMatches = q ? filterNavLinks(TOOLS, q) : [];

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView className="flex-1" edges={['top']}>
        <View className="flex-row items-center justify-between px-5 pb-3 pt-4">
          <Logo height={30} />
          <Pressable
            onPress={() => router.push('/theme')}
            accessibilityLabel="Theme"
            className="h-10 w-10 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.surface }}
          >
            <ThemeIcon color={colors.foreground} size={20} />
          </Pressable>
        </View>

        <View className="px-5 pb-2">
          <View className="flex-row items-center gap-2.5 rounded-full pl-4" style={{ backgroundColor: colors.surface }}>
            <SearchIcon color={colors.muted} size={18} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search tools and tunes…"
              placeholderTextColor={colors.muted}
              returnKeyType="search"
              className="font-inter flex-1 text-base"
              style={{ color: colors.foreground, paddingVertical: 10 }}
            />
            {query ? (
              <Pressable onPress={() => setQuery('')} accessibilityLabel="Clear search" className="h-11 w-11 items-center justify-center">
                <ClearIcon color={colors.muted} size={18} />
              </Pressable>
            ) : null}
          </View>
        </View>

        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 10, paddingBottom: TAB_BAR_CONTENT_HEIGHT + 40, gap: 26 }}
        >
          {q ? (
            <>
              <Section title="Tools">
                {toolMatches.length ? (
                  <ToolList items={toolMatches} favorites={favorites} onOpen={openTool} onToggle={toggleFavorite} />
                ) : (
                  <Muted text={`No tools match “${q}”.`} />
                )}
              </Section>
              <Section title="Your tunes">
                {tuneMatches.length ? (
                  <View className="overflow-hidden rounded-2xl" style={{ backgroundColor: colors.surface }}>
                    {tuneMatches.map(({ tune, list }, i) => (
                      <Pressable
                        key={tune.id}
                        onPress={() => router.push({ pathname: '/library/tune', params: { list, id: tune.id } })}
                        android_ripple={{ color: colors['surface-hover'] }}
                        className="flex-row items-center gap-3 px-4"
                        style={{ minHeight: 56, borderTopWidth: i ? 1 : 0, borderTopColor: colors.background }}
                      >
                        <MusicNoteIcon color={colors.accent} size={18} />
                        <View className="flex-1 py-2">
                          <Text numberOfLines={1} className="font-inter-semibold text-base font-semibold" style={{ color: colors.foreground }}>
                            {tune.name}
                          </Text>
                          <Text numberOfLines={1} className="font-inter text-xs" style={{ color: colors.muted }}>
                            {[list === 'learn' ? 'To learn' : 'I know', tuneSummary(tune)].filter(Boolean).join(' · ')}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                ) : (
                  <Muted text="No tunes match." />
                )}
              </Section>
            </>
          ) : (
            <>
              <Section title={favoriteTools.length ? 'Favorites' : 'Get started'} detail={favoriteTools.length ? undefined : 'Tap ☆ on a tool to pin it here'}>
                {chunk(pinned, 2).map((row, i) => (
                  <View key={i} className="flex-row gap-3">
                    {row.map((item) => (
                      <ToolTile
                        key={item.href}
                        item={item}
                        favorited={favorites.includes(item.href)}
                        onPress={() => openTool(item)}
                        onToggleFavorite={() => toggleFavorite(item.href)}
                      />
                    ))}
                    {row.length === 1 ? <View className="flex-1" /> : null}
                  </View>
                ))}
              </Section>

              {jumpCards.length ? (
                <Section title="Jump back in">
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}>
                    {jumpCards.map((c) => (
                      <Pressable
                        key={c.key}
                        onPress={c.onPress}
                        className="justify-between rounded-2xl p-3"
                        style={{ width: 140, height: 104, backgroundColor: colors.surface }}
                      >
                        <View className="h-9 w-9 items-center justify-center rounded-xl" style={{ backgroundColor: `${colors.accent}22` }}>
                          <c.Icon color={colors.accent} size={19} />
                        </View>
                        <View>
                          <Text numberOfLines={1} className="font-inter-bold text-sm font-bold" style={{ color: colors.foreground }}>
                            {c.title}
                          </Text>
                          <Text numberOfLines={1} className="font-inter text-xs" style={{ color: colors.muted }}>
                            {c.detail}
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </ScrollView>
                </Section>
              ) : null}

              <Section title="Your library">
                <View className="flex-row gap-3">
                  <LibraryCard Icon={MusicNoteIcon} count={lists.tunes.tunes.length + lists.learn.tunes.length} label="Tunes" onPress={() => router.push('/library')} />
                  <LibraryCard Icon={SetlistIcon} count={setlists.length} label="Setlists" onPress={() => router.push(setlists.length ? '/library/setlists' : '/library')} />
                  <LibraryCard Icon={ChordChartIcon} count={totalSongs} label="Charts" onPress={() => router.push('/charts')} />
                </View>
              </Section>

              {groupByCategory(TOOLS).map(({ category, items }) => (
                <Section key={category} title={category}>
                  <ToolList items={items} favorites={favorites} onOpen={openTool} onToggle={toggleFavorite} />
                </Section>
              ))}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Section({ title, detail, children }: { title: string; detail?: string; children: ReactNode }) {
  const { colors } = useAppTheme();
  return (
    <View className="gap-2.5">
      <View className="flex-row items-baseline gap-2 px-1">
        <Text className="font-inter-bold text-xl font-bold" style={{ color: colors.foreground }}>
          {title}
        </Text>
        {detail ? (
          <Text numberOfLines={1} className="font-inter flex-1 text-xs" style={{ color: colors.muted }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function ToolList({
  items,
  favorites,
  onOpen,
  onToggle,
}: {
  items: NavLinkInfo[];
  favorites: string[];
  onOpen: (item: NavLinkInfo) => void;
  onToggle: (href: string) => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View className="overflow-hidden rounded-2xl px-3" style={{ backgroundColor: colors.surface }}>
      {items.map((item, i) => (
        <View key={item.href}>
          <ToolRow item={item} favorited={favorites.includes(item.href)} onPress={() => onOpen(item)} onToggleFavorite={() => onToggle(item.href)} />
          {i < items.length - 1 ? <View style={{ height: 1, marginHorizontal: -12, backgroundColor: colors.background }} /> : null}
        </View>
      ))}
    </View>
  );
}

function LibraryCard({ Icon, count, label, onPress }: { Icon: ComponentType<IconProps>; count: number; label: string; onPress: () => void }) {
  const { colors } = useAppTheme();
  return (
    <Pressable onPress={onPress} android_ripple={{ color: colors['surface-hover'] }} className="flex-1 gap-2 overflow-hidden rounded-2xl p-3" style={{ backgroundColor: colors.surface }}>
      <View className="flex-row items-center justify-between">
        <Icon color={colors.accent} size={20} />
        <ChevronRightIcon color={colors.muted} size={16} />
      </View>
      <View>
        <Text className="font-inter-extrabold text-2xl font-extrabold tabular-nums" style={{ color: colors.foreground }}>
          {count}
        </Text>
        <Text numberOfLines={1} className="font-inter-semibold text-xs font-semibold" style={{ color: colors.muted }}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

function Muted({ text }: { text: string }) {
  const { colors } = useAppTheme();
  return (
    <Text className="font-inter rounded-2xl p-4 text-sm" style={{ backgroundColor: colors.surface, color: colors.muted }}>
      {text}
    </Text>
  );
}

export default withScreenLoader(Home);
