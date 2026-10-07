import {
  formatComposer,
  parseIrealPlaylist,
} from '@jam-practice/core/iRealPro';
import { decodeChartString, looksLikeChartString } from '@jam-practice/core/chartString';
import { UNSORTED_PLAYLIST_ID } from '@jam-practice/core/chordChartsLibrary';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, SectionList, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TAB_BAR_CONTENT_HEIGHT } from '@/components/FloatingTabBar';
import { PlusIcon, SearchIcon, SlidersIcon, TrashIcon } from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ToolOptionsSheet } from '@/components/ToolOptionsSheet';
import {
  useChordChartsLibrary,
  type LibrarySongMeta,
} from '@/lib/useChordChartsLibrary';
import { useAppTheme } from '@/theme/ThemeProvider';

/** What "Import a playlist" actually reads — a sheddex chart link (`@jam-practice/core/chartString`)
    first, quietly falling back to a real iReal Pro playlist link if it isn't one of those, the
    exact same two-parser fallback and deliberately-generic error message
    `apps/web/components/ChordCharts.tsx`'s own `parsePlaylistInput` uses — never naming iReal Pro
    anywhere a user can see, per `PROJECT.md`'s own documented wording choices for this panel. */
function parsePlaylistInput(text: string) {
  if (looksLikeChartString(text)) return decodeChartString(text);
  try {
    return parseIrealPlaylist(text);
  } catch {
    throw new Error("Couldn't read that — paste a sheddex chord chart link.");
  }
}

/**
 * Native port of `apps/web/components/ChordCharts.tsx`. **The main screen is the tune list
 * itself** — every imported/created chart, grouped by playlist, searchable, right there with no
 * extra tap — per a direct follow-up correcting the first version of this screen (which hid the
 * list behind an Options tap, matching every other tool's "essentials on the main screen, rest in
 * a sheet" convention mechanically rather than fitting *this* tool's own shape: browsing charts
 * *is* the main activity here, not a secondary setting). Tapping a tune pushes
 * `chord-charts-view.tsx`, a dedicated full-page chart viewer (with its own transpose control and
 * delete action) — not an inline swap on this same screen — matching the same direct follow-up's
 * "clicking a tune should bring you to another page with the chart" request. Options is now just
 * Import (a single tab, so `ToolOptionsSheet`'s own tab row doesn't even render) — genuinely
 * light, opens instantly regardless of library size, since nothing it renders depends on how many
 * charts exist.
 *
 * **Two real, reported performance bugs, not hypothetical ones**:
 * 1. The first version passed the entire (potentially long) song list as a plain `ReactNode` into
 *    `ToolOptionsSheet`'s `tabs` prop — since that's a plain JS value, constructing it (including
 *    sorting/mapping every song) happened on *every* render of this screen regardless of whether
 *    the sheet was open, so the state update that should have just revealed the sheet also had to
 *    first finish re-rendering the whole library — reported as "it takes forever for Options to
 *    open if there are a bunch of charts." Fixed at the root, in `ToolOptionsSheet.tsx` itself
 *    (now takes a `() => ReactNode` thunk per tab, invoked only for the active tab while actually
 *    visible) — a general app-wide fix, not special-cased here.
 * 2. Once the library moved onto *this* screen's own main view (per the layout change below), a
 *    second, more fundamental version of the same class of bug showed up at real scale: a plain
 *    `ScrollView` wrapping a `.map()` over every song mounts *every single row* as a real native
 *    view up front, all at once, regardless of how many actually fit on screen — fine for a dozen
 *    charts, genuinely unusable at 1,500 ("takes forever to open the chord charts tool"). Fixed by
 *    switching to `SectionList` (grouped-by-playlist browsing) / `FlatList` (the search-filtered
 *    flat view) — both virtualize, rendering only what's near the visible viewport and recycling
 *    rows as you scroll, the standard React Native fix for exactly this, regardless of library
 *    size.
 */
export default function ChordChartsScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();

  const { playlists: unsortedPlaylists, totalSongs, loading, importSongs, deleteSong, clearAll } =
    useChordChartsLibrary(null);

  // Pre-sorted once here (not per-row, not per-section-render) — `SectionList`'s own `sections`
  // prop wants `{title, data}[]` directly, and sorting songs within a playlist up front means
  // `renderItem` itself stays a pure, cheap lookup rather than re-sorting on every scroll-driven
  // re-render of a recycled row.
  const sections = useMemo(() => {
    const real = unsortedPlaylists.filter((p) => p.id !== UNSORTED_PLAYLIST_ID).sort((a, b) => a.name.localeCompare(b.name));
    const unsorted = unsortedPlaylists.filter((p) => p.id === UNSORTED_PLAYLIST_ID);
    return [...real, ...unsorted].map((p) => ({
      title: p.name,
      count: p.songs.length,
      data: [...p.songs].sort((a, b) => a.title.localeCompare(b.title)),
    }));
  }, [unsortedPlaylists]);

  const allSongs = useMemo(
    () => unsortedPlaylists.flatMap((p) => p.songs).sort((a, b) => a.title.localeCompare(b.title)),
    [unsortedPlaylists],
  );

  const [optionsOpen, setOptionsOpen] = useState(false);
  const [linkText, setLinkText] = useState('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [query, setQuery] = useState('');

  async function importText(text: string) {
    let playlist;
    try {
      playlist = parsePlaylistInput(text);
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : "Couldn't read that." });
      return;
    }
    try {
      const { added, skipped } = await importSongs(playlist.songs, playlist.name);
      setStatus({
        kind: 'ok',
        message:
          `Imported ${added} song${added === 1 ? '' : 's'} into "${playlist.name}".` +
          (skipped > 0 ? ` (${skipped} already in your library.)` : ''),
      });
      setLinkText('');
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : "Couldn't import that playlist." });
    }
  }

  const openSong = useCallback(
    (id: string) => {
      router.push({ pathname: '/tool/chord-charts-view', params: { id } });
    },
    [router],
  );

  const filteredSongs = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    return allSongs.filter((s) => s.title.toLowerCase().includes(q) || s.composer.toLowerCase().includes(q));
  }, [allSongs, query]);

  const renderSong = useCallback(
    ({ item: song }: { item: LibrarySongMeta }) => (
      <SongRow song={song} onSelect={() => openSong(song.id)} onDelete={() => void deleteSong(song.id)} />
    ),
    [openSong, deleteSong],
  );
  const keyExtractor = useCallback((song: LibrarySongMeta) => song.id, []);

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: 'Chord Charts' }} />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        <View className="gap-3 px-4 pb-2 pt-2">
          <View className="flex-row items-center justify-end gap-2">
            <Pressable
              onPress={() => router.push('/tool/chord-charts-editor')}
              accessibilityLabel="Create a chord chart"
              className="flex-row items-center gap-1.5 rounded-full px-4 py-2"
              style={{ backgroundColor: colors.surface }}
            >
              <PlusIcon color={colors.foreground} size={16} />
              <Text className="font-inter-bold text-sm font-bold" style={{ color: colors.foreground }}>
                New
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setOptionsOpen(true)}
              accessibilityLabel="Options"
              className="flex-row items-center gap-1.5 rounded-full px-4 py-2"
              style={{ backgroundColor: colors.surface }}
            >
              <SlidersIcon color={colors.foreground} size={18} />
              <Text className="font-inter-bold text-sm font-bold" style={{ color: colors.foreground }}>
                Options
              </Text>
            </Pressable>
          </View>

          {totalSongs > 0 ? (
            <View className="flex-row items-center gap-2 rounded-xl px-3" style={{ backgroundColor: colors.surface }}>
              <SearchIcon color={colors.muted} size={16} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={`Search ${totalSongs} tunes…`}
                placeholderTextColor={colors.muted}
                className="font-inter flex-1"
                style={{ color: colors.foreground, paddingVertical: 10 }}
              />
            </View>
          ) : null}
        </View>

        {loading ? (
          <View className="flex-1 items-center justify-center py-16">
            <LoadingSpinner showLabel label="Loading your library…" />
          </View>
        ) : totalSongs === 0 ? (
          <View className="flex-1 items-center justify-center gap-2 px-16">
            <Text className="font-inter text-center text-sm" style={{ color: colors.muted }}>
              Import a playlist, or create a chart, to see it here.
            </Text>
          </View>
        ) : filteredSongs ? (
          <FlatList
            data={filteredSongs}
            keyExtractor={keyExtractor}
            renderItem={renderSong}
            contentContainerStyle={{ padding: 16, paddingTop: 4, paddingBottom: 16 + TAB_BAR_CONTENT_HEIGHT, gap: 2 }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={
              <Text className="font-inter text-sm" style={{ color: colors.muted }}>
                No tunes match &ldquo;{query}&rdquo;.
              </Text>
            }
          />
        ) : (
          <SectionList
            sections={sections}
            keyExtractor={keyExtractor}
            renderItem={renderSong}
            renderSectionHeader={({ section }) => (
              <View
                className="flex-row items-center justify-between"
                style={{ backgroundColor: colors.background, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 }}
              >
                <Text className="font-inter-semibold text-xs font-semibold" style={{ color: colors.muted }}>
                  {section.title}
                </Text>
                <Text className="font-inter text-xs tabular-nums" style={{ color: colors.muted }}>
                  {section.count}
                </Text>
              </View>
            )}
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 + TAB_BAR_CONTENT_HEIGHT }}
            stickySectionHeadersEnabled={false}
          />
        )}
      </SafeAreaView>

      <ToolOptionsSheet
        visible={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        title="Chord Charts"
        tabs={[
          {
            key: 'import',
            label: 'Import',
            content: () => (
              <View style={{ gap: 10 }}>
                <Text className="font-inter text-xs leading-5" style={{ color: colors.muted }}>
                  Paste a sheddex chord chart link below — export one from the chart builder, or
                  from a chart someone shared with you.
                </Text>
                <TextInput
                  value={linkText}
                  onChangeText={setLinkText}
                  placeholder="sheddex://..."
                  placeholderTextColor={colors.muted}
                  multiline
                  numberOfLines={4}
                  className="font-inter"
                  style={{ backgroundColor: colors.background, borderRadius: 10, padding: 10, color: colors.foreground, minHeight: 90, textAlignVertical: 'top' }}
                />
                <Pressable
                  onPress={() => linkText.trim() && void importText(linkText)}
                  disabled={!linkText.trim()}
                  className="items-center rounded-xl py-2.5"
                  style={{ backgroundColor: colors.accent, opacity: linkText.trim() ? 1 : 0.4 }}
                >
                  <Text className="font-inter-bold text-sm font-bold" style={{ color: colors['accent-foreground'] }}>
                    Import
                  </Text>
                </Pressable>
                {status ? (
                  <Text className="font-inter text-xs" style={{ color: status.kind === 'error' ? colors.danger : colors.muted }}>
                    {status.message}
                  </Text>
                ) : null}

                <Pressable
                  onPress={() => setConfirmClear(true)}
                  disabled={totalSongs === 0}
                  className="flex-row items-center justify-center gap-1.5 rounded-xl py-2.5"
                  style={{ backgroundColor: colors.background, opacity: totalSongs === 0 ? 0.4 : 1 }}
                >
                  <TrashIcon color={colors.danger} size={14} />
                  <Text className="font-inter-semibold text-sm" style={{ color: colors.danger }}>
                    Clear all tunes
                  </Text>
                </Pressable>
              </View>
            ),
          },
        ]}
      />

      <ConfirmDialog
        visible={confirmClear}
        title="Clear all tunes?"
        message="This removes every imported or created chart from this library. You can re-import a playlist any time."
        confirmLabel="Clear all"
        onConfirm={() => {
          void clearAll();
          setConfirmClear(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </View>
  );
}

function SongRow({
  song,
  onSelect,
  onDelete,
}: {
  song: LibrarySongMeta;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View className="flex-row items-center gap-1">
      <Pressable onPress={onSelect} className="flex-1 rounded-xl px-3 py-2">
        <Text numberOfLines={1} className="font-inter-semibold text-sm" style={{ color: colors.foreground }}>
          {song.title}
        </Text>
        {song.composer ? (
          <Text numberOfLines={1} className="font-inter text-xs" style={{ color: colors.muted }}>
            {formatComposer(song.composer)}
          </Text>
        ) : null}
      </Pressable>
      <Pressable onPress={onDelete} accessibilityLabel={`Remove ${song.title}`} className="h-8 w-8 items-center justify-center rounded-full">
        <TrashIcon color={colors.muted} size={14} />
      </Pressable>
    </View>
  );
}
