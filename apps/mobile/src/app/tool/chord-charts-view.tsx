import { formatComposer, KEY_NAMES, keyPitchClass, transposeSong } from '@jam-practice/core/iRealPro';
import { UNSORTED_PLAYLIST_ID } from '@jam-practice/core/chordChartsLibrary';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ChordChartView from '@/components/ChordChartView';
import { ChordChartSongMenu, type MenuTarget } from '@/components/ChordChartSongMenu';
import { Dropdown } from '@/components/Dropdown';
import { TAB_BAR_CONTENT_HEIGHT } from '@/components/FloatingTabBar';
import { DotsVerticalIcon } from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { forgetRecentChart, recordRecentChart } from '@/lib/chordChartRecents';
import { useChordChartsLibrary } from '@/lib/useChordChartsLibrary';
import { useAppTheme } from '@/theme/ThemeProvider';
import { withScreenLoader } from '@/components/ScreenLoader';

const BARS_PER_ROW = 4;

/**
 * The full-page chart viewer — what tapping a chart in the library pushes to. Built to give the
 * chart itself as much of the screen as possible: the title and info (composer · style · key ·
 * time signature) live *in the navigation header*, next to the back button, rather than in a block
 * above the chart; the header's right side holds a compact key button (transpose, display-only —
 * accent-filled while transposed) and the same ⋮ menu the library rows use (Edit / Move / Delete).
 * Below the header there's nothing but the chart, with tight side padding so it renders as large as
 * the width allows.
 */
function ChordChartsViewScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { selectedSong: selected, selectedSongLoading, deleteSong, moveSong, playlists } = useChordChartsLibrary(id ?? null);
  const [transposeKey, setTransposeKey] = useState('');
  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null);

  useEffect(() => {
    if (id) recordRecentChart(id);
  }, [id]);

  const transposeSemitones =
    selected && transposeKey ? (KEY_NAMES.indexOf(transposeKey) - keyPitchClass(selected.key) + 12) % 12 : 0;
  const displayed = useMemo(
    () => (selected && transposeSemitones !== 0 ? transposeSong(selected, transposeSemitones) : selected),
    [selected, transposeSemitones],
  );

  const owner = playlists.find((p) => p.songs.some((s) => s.id === id));
  const meta = owner?.songs.find((s) => s.id === id);

  const subtitle = displayed
    ? [
        displayed.composer ? formatComposer(displayed.composer) : null,
        displayed.style || null,
        displayed.key || null,
        `${displayed.timeSignature.top}/${displayed.timeSignature.bottom}`,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen
        options={{
          title: selected?.title ?? 'Chart',
          headerTitle: () => (
            <View style={{ flexShrink: 1 }}>
              <Text numberOfLines={1} className="font-inter-bold text-lg font-bold tracking-tight" style={{ color: colors.accent }}>
                {selected?.title || 'Chart'}
              </Text>
              {subtitle ? (
                <Text numberOfLines={1} className="font-inter text-xs" style={{ color: colors.muted }}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
          ),
          headerRight: () =>
            selected ? (
              <View className="flex-row items-center gap-1">
                <Dropdown
                  value={transposeKey}
                  onChange={setTransposeKey}
                  triggerLabel={transposeKey || selected.key || 'Key'}
                  highlighted={!!transposeKey}
                  options={[
                    { value: '', label: `Original (${selected.key || '—'})` },
                    ...KEY_NAMES.map((k) => ({ value: k, label: k })),
                  ]}
                />
                {meta && owner ? (
                  <Pressable
                    onPress={() => setMenuTarget({ song: meta, playlistId: owner.id })}
                    accessibilityLabel="Chart options"
                    className="h-10 w-9 items-center justify-center"
                  >
                    <DotsVerticalIcon color={colors.foreground} size={22} />
                  </Pressable>
                ) : null}
              </View>
            ) : null,
        }}
      />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 6, paddingTop: 4, paddingBottom: 16 + TAB_BAR_CONTENT_HEIGHT, flexGrow: 1 }}>
          {selectedSongLoading ? (
            <View className="flex-1 items-center justify-center py-12">
              <LoadingSpinner showLabel label="Loading chart…" />
            </View>
          ) : selected && displayed ? (
            <ChordChartView song={displayed} barsPerRow={BARS_PER_ROW} hideHeader />
          ) : (
            <View className="flex-1 items-center justify-center py-16">
              <Text className="font-inter text-center text-sm" style={{ color: colors.muted }}>
                Couldn&apos;t find that chart.
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      <ChordChartSongMenu
        target={menuTarget}
        playlists={playlists
          .filter((p) => p.id !== UNSORTED_PLAYLIST_ID || p.id === owner?.id)
          .map((p) => ({ id: p.id, name: p.name, count: p.songs.length }))}
        onClose={() => setMenuTarget(null)}
        onEdit={(songId) => router.push({ pathname: '/tool/chord-charts-editor', params: { songId } })}
        onMove={(songId, name) => void moveSong(songId, name)}
        onDelete={(songId) => {
          void deleteSong(songId);
          forgetRecentChart(songId);
          router.back();
        }}
      />
    </View>
  );
}

export default withScreenLoader(ChordChartsViewScreen);
