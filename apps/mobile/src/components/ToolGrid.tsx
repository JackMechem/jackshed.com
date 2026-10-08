import {
  type NavLinkInfo,
  NAV_LINKS_DATA,
  filterNavLinks,
  groupByCategory,
  hrefToSlug,
} from '@jam-practice/core/navLinks';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { TAB_BAR_CONTENT_HEIGHT } from '@/components/FloatingTabBar';
import { NAV_LINK_ICONS, StarIcon } from '@/components/icons';
import { useFavorites } from '@/lib/useFavorites';
import { useAppTheme } from '@/theme/ThemeProvider';

/** Community and Chord Charts have their own tabs in `FloatingTabBar`, so they are not repeated in
    this list (a direct request: Chord Charts is "a big and main feature" that belongs in the nav). */
export const TAB_HREFS = ['/community', '/chord-charts', '/tunes'];

/** Splits a list into fixed-size rows for the Favorites grid. `SectionList`'s own `numColumns`
    doesn't exist — chunking rows by hand is the usual workaround — but a `FlatList`/`FlashList`
    switch isn't warranted here either: Favorites is a small, fixed-length subset, not a feed, so a
    plain `ScrollView` over pre-chunked rows is simplest. */
export function chunk<T>(items: T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

/**
 * The tool browser — per a direct follow-up reversing the previous round's own icon-grid redesign
 * for everything except Favorites: "I want all the tools to be in a list not a grid, except for
 * the favorites section which will be at the top in a grid." Category headers lost both their
 * small leading icon and the all-caps/tracking-wide styling (`CATEGORIES`'s own entries,
 * `@jam-practice/core/navLinks`, are already properly capitalized — e.g. "Timing & Tuning" — the
 * `.toUpperCase()` call that used to force them to shout was the only thing making them look
 * uppercase at all, not the source data). This *is* `Home`'s own content now (`app/index.tsx`) —
 * `Home` owns the fixed top bar/search row above this and hands down `query`; this component is
 * purely the scrollable content below it.
 *
 * **Favorites** (`useFavorites`, the same account-only Convex-backed list web's own sidebar star
 * uses, under the identical `"jam-practice-favorites"` syncedSettings key) renders first, as its
 * own small 2-column grid of the same icon-chip cards the whole browser used to be — the one
 * place that style still earns its keep, since a short, hand-curated set of favorites is exactly
 * the "a few special things" case a card grid suits, unlike a long flat list of everything.
 * Every row/card gets a star toggle (`StarIcon`, filled once favorited) — signed out, or before
 * `useFavorites` has anything synced yet, the star still shows (so it's discoverable) but tapping
 * it simply has nothing to persist to, matching `useFavorites`'s own documented signed-out
 * behavior rather than hiding the control entirely.
 */
export function ToolGrid({
  query = '',
  bottomInset = TAB_BAR_CONTENT_HEIGHT + 40,
}: {
  query?: string;
  /** Extra scroll padding so the last row isn't hidden behind the floating tab bar. */
  bottomInset?: number;
}) {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { favorites, toggleFavorite } = useFavorites();
  // Community and Chord Charts each have their own tab in the bottom nav, so they aren't repeated here.
  const visible = filterNavLinks(NAV_LINKS_DATA, query).filter((link) => !TAB_HREFS.includes(link.href));
  const sections = groupByCategory(visible);
  const favoriteItems = visible.filter((item) => favorites.includes(item.href));

  function go(item: NavLinkInfo) {
    router.push(`/tool/${hrefToSlug(item.href)}`);
  }

  if (visible.length === 0) {
    return (
      <View className="items-center px-6 py-16">
        <Text className="text-sm font-inter" style={{ color: colors.muted }}>
          No tools match &ldquo;{query}&rdquo;.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: bottomInset }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {favoriteItems.length > 0 ? (
        <View className="mb-6 mt-4">
          <Text className="mb-2 px-1 text-2xl font-bold font-inter-bold" style={{ color: colors.foreground }}>
            Favorites
          </Text>
          {chunk(favoriteItems, 2).map((row, i) => (
            <View key={i} className="mb-3 flex-row gap-3">
              {row.map((item) => (
                <ToolTile
                  key={item.href}
                  item={item}
                  favorited
                  onPress={() => go(item)}
                  onToggleFavorite={() => toggleFavorite(item.href)}
                />
              ))}
              {row.length === 1 ? <View className="flex-1" /> : null}
            </View>
          ))}
        </View>
      ) : null}

      {sections.map(({ category, items }) => (
        <View key={category} className="mb-6 mt-4">
          <Text className="mb-2 px-1 text-2xl font-bold font-inter-bold" style={{ color: colors.foreground }}>
            {category}
          </Text>
          <View className="overflow-hidden rounded-2xl px-3" style={{ backgroundColor: colors.surface }}>
            {items.map((item, i) => (
              <View key={item.href}>
                <ToolRow
                  item={item}
                  favorited={favorites.includes(item.href)}
                  onPress={() => go(item)}
                  onToggleFavorite={() => toggleFavorite(item.href)}
                />
                {i < items.length - 1 ? (
                  <View style={{ height: 1, marginHorizontal: -12, backgroundColor: colors.background }} />
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

export function ToolRow({
  item,
  favorited,
  onPress,
  onToggleFavorite,
}: {
  item: NavLinkInfo;
  favorited: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
}) {
  const { colors } = useAppTheme();
  const Icon = NAV_LINK_ICONS[item.href];
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 px-2 py-3"
    >
      {Icon ? <Icon color={colors.muted} size={18} /> : null}
      <Text className="flex-1 text-sm font-semibold font-inter-semibold" numberOfLines={1} style={{ color: colors.foreground }}>
        {item.label}
      </Text>
      <Pressable
        onPress={onToggleFavorite}
        hitSlop={8}
        accessibilityLabel={favorited ? `Unfavorite ${item.label}` : `Favorite ${item.label}`}
        className="h-8 w-8 items-center justify-center"
      >
        <StarIcon color={favorited ? colors.accent : colors.muted} size={16} filled={favorited} />
      </Pressable>
    </Pressable>
  );
}

export function ToolTile({
  item,
  favorited,
  onPress,
  onToggleFavorite,
}: {
  item: NavLinkInfo;
  favorited: boolean;
  onPress: () => void;
  onToggleFavorite: () => void;
}) {
  const { colors } = useAppTheme();
  const Icon = NAV_LINK_ICONS[item.href];
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 rounded-2xl border p-4"
      style={{ backgroundColor: colors.surface, borderColor: colors['surface-hover'] }}
    >
      <View className="flex-row items-start justify-between">
        {/* Icon chip tinted with the theme's own accent at low alpha — a plain hex-with-alpha-suffix
            (`#RRGGBBAA`), not a Tailwind `/opacity` modifier, since this app's theme colors are flat
            hex strings rather than rgb()-triplets (see `ThemeProvider.tsx`'s own doc comment on why
            color lives in inline style at all here). Works identically across every one of the 30
            presets without needing to know anything about the specific hex value. */}
        <View
          className="mb-3 h-11 w-11 items-center justify-center rounded-2xl"
          style={{ backgroundColor: `${colors.accent}22` }}
        >
          {Icon ? <Icon color={colors.accent} size={20} /> : null}
        </View>
        <Pressable onPress={onToggleFavorite} hitSlop={8} accessibilityLabel={favorited ? `Unfavorite ${item.label}` : `Favorite ${item.label}`}>
          <StarIcon color={favorited ? colors.accent : colors.muted} size={16} filled={favorited} />
        </Pressable>
      </View>
      <Text
        className="text-[15px] font-bold font-inter-bold"
        numberOfLines={2}
        style={{ color: colors.foreground }}
      >
        {item.label}
      </Text>
    </Pressable>
  );
}
