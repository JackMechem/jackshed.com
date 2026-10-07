import { KEY_NAMES, keyPitchClass, transposeSong } from '@jam-practice/core/iRealPro';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ChordChartView from '@/components/ChordChartView';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Dropdown } from '@/components/Dropdown';
import { TAB_BAR_CONTENT_HEIGHT } from '@/components/FloatingTabBar';
import { TrashIcon } from '@/components/icons';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useChordChartsLibrary } from '@/lib/useChordChartsLibrary';
import { useAppTheme } from '@/theme/ThemeProvider';

const BARS_PER_ROW = 4;

/**
 * A dedicated full-page chart viewer — what tapping a tune on the main Chord Charts list pushes
 * to, per a direct follow-up ("when you click on a tune it brings you to another page/popup with
 * the chart," correcting the first version's own inline-swap-on-the-same-screen design). Only
 * ever reached with a real song id as a route param, so it owns its own
 * `useChordChartsLibrary(id)` call rather than threading the selection through the list screen —
 * each screen gets its own independent Convex subscription, same as any other two routes in this
 * app that both read synced data.
 *
 * Transpose (display-only, resets whenever a different chart is opened simply because this is a
 * fresh screen instance each time) and delete both live directly in the header here now, rather
 * than behind an "Options" sheet — both are about *this one chart*, not a secondary setting, and
 * there's no long list behind either one, so there's no "slow to open" concern `ToolOptionsSheet`
 * exists to protect against here in the first place.
 */
export default function ChordChartsViewScreen() {
  const { colors } = useAppTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { selectedSong: selected, selectedSongLoading, deleteSong } = useChordChartsLibrary(id ?? null);
  const [transposeKey, setTransposeKey] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const transposeSemitones =
    selected && transposeKey ? (KEY_NAMES.indexOf(transposeKey) - keyPitchClass(selected.key) + 12) % 12 : 0;
  const displayed = useMemo(
    () => (selected && transposeSemitones !== 0 ? transposeSong(selected, transposeSemitones) : selected),
    [selected, transposeSemitones],
  );

  async function handleDelete() {
    if (!id) return;
    await deleteSong(id);
    setConfirmDelete(false);
    router.back();
  }

  const chartActions = selected ? (
    <View className="flex-row items-center gap-2">
      <Dropdown
        value={transposeKey}
        onChange={setTransposeKey}
        options={[
          { value: '', label: `Original (${selected.key || '—'})` },
          ...KEY_NAMES.map((k) => ({ value: k, label: k })),
        ]}
      />
      <Pressable
        onPress={() => setConfirmDelete(true)}
        accessibilityLabel="Delete this chart"
        className="h-9 w-9 items-center justify-center rounded-full"
        style={{ backgroundColor: colors.surface }}
      >
        <TrashIcon color={colors.danger} size={16} />
      </Pressable>
    </View>
  ) : null;

  return (
    <View className="flex-1" style={{ backgroundColor: colors.background }}>
      <Stack.Screen options={{ title: selected?.title ?? 'Chart' }} />
      <SafeAreaView className="flex-1" edges={['bottom']}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 16 + TAB_BAR_CONTENT_HEIGHT, flexGrow: 1 }}>
          {selectedSongLoading ? (
            <View className="flex-1 items-center justify-center py-12">
              <LoadingSpinner showLabel label="Loading chart…" />
            </View>
          ) : selected && displayed ? (
            <ChordChartView song={displayed} barsPerRow={BARS_PER_ROW} headerActions={chartActions} />
          ) : (
            <View className="flex-1 items-center justify-center py-16">
              <Text className="font-inter text-center text-sm" style={{ color: colors.muted }}>
                Couldn&apos;t find that chart.
              </Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      <ConfirmDialog
        visible={confirmDelete}
        title={`Delete "${selected?.title ?? ''}"?`}
        message="This removes the chart from your library. This can't be undone."
        confirmLabel="Delete"
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </View>
  );
}
