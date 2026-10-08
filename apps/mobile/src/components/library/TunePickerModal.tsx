import { sortByText } from '@jam-practice/core/sortText';
import type { Tune } from '@jam-practice/core/types';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SearchField } from '@/components/ChordChartList';
import { CheckIcon, CloseIcon } from '@/components/icons';
import { TUNE_LIST_LABEL, tuneSummary, useTuneLists, type TuneListId } from '@/lib/useTuneList';
import { useAppTheme } from '@/theme/ThemeProvider';

const ROW_H = 60;

/**
 * Pick several of your tunes at once (from Tunes I Know and Tunes to Learn) — adding tunes to a
 * setlist. Tunes already in it (`exclude`) aren't offered again. Full screen with its own search;
 * the Add button sits in the header so the keyboard never covers it.
 */
export function TunePickerModal({
  visible,
  exclude,
  onAdd,
  onClose,
}: {
  visible: boolean;
  exclude: string[];
  onAdd: (tuneIds: string[]) => void;
  onClose: () => void;
}) {
  const { colors } = useAppTheme();
  const { lists } = useTuneLists();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setQuery('');
      setPicked([]);
    }
  }

  const rows = useMemo(() => {
    const skip = new Set(exclude);
    const all: { tune: Tune; list: TuneListId }[] = [];
    for (const list of ['tunes', 'learn'] as TuneListId[]) for (const tune of lists[list].tunes) if (!skip.has(tune.id)) all.push({ tune, list });
    const q = query.trim().toLowerCase();
    return sortByText(q ? all.filter((r) => r.tune.name.toLowerCase().includes(q)) : all, (r) => r.tune.name);
  }, [lists, exclude, query]);

  function toggle(id: string) {
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <View className="flex-row items-center gap-2 px-4 pb-2 pt-3">
          <Pressable onPress={onClose} accessibilityLabel="Close" className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: colors.surface }}>
            <CloseIcon color={colors.foreground} size={20} />
          </Pressable>
          <Text className="font-inter-bold flex-1 text-xl font-bold" style={{ color: colors.foreground }}>
            Add tunes
          </Text>
          <Pressable
            onPress={() => {
              onAdd(picked);
              onClose();
            }}
            disabled={picked.length === 0}
            className="rounded-full px-5 py-2"
            style={{ backgroundColor: colors.accent, opacity: picked.length ? 1 : 0.4 }}
          >
            <Text className="font-inter-bold text-sm font-bold" style={{ color: colors['accent-foreground'] }}>
              {picked.length ? `Add ${picked.length}` : 'Add'}
            </Text>
          </Pressable>
        </View>
        <View className="px-4 pb-2">
          <SearchField value={query} onChange={setQuery} placeholder="Search your tunes…" />
        </View>
        <FlatList
          data={rows}
          keyExtractor={(r) => r.tune.id}
          getItemLayout={(_, index) => ({ length: ROW_H, offset: ROW_H * index, index })}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
          ListEmptyComponent={
            <Text className="font-inter py-8 text-center text-sm" style={{ color: colors.muted }}>
              {query.trim() ? `No tunes match “${query}”.` : 'Every one of your tunes is already in this setlist.'}
            </Text>
          }
          renderItem={({ item }) => {
            const on = picked.includes(item.tune.id);
            return (
              <Pressable
                onPress={() => toggle(item.tune.id)}
                android_ripple={{ color: colors['surface-hover'] }}
                className="flex-row items-center gap-3 rounded-xl px-3"
                style={{ height: ROW_H }}
              >
                <View
                  className="h-6 w-6 items-center justify-center rounded-md"
                  style={{ backgroundColor: on ? colors.accent : 'transparent', borderWidth: on ? 0 : 1.5, borderColor: colors.muted }}
                >
                  {on ? <CheckIcon color={colors['accent-foreground']} size={16} /> : null}
                </View>
                <View className="flex-1">
                  <Text numberOfLines={1} className="font-inter-semibold text-base font-semibold" style={{ color: colors.foreground }}>
                    {item.tune.name}
                  </Text>
                  <Text numberOfLines={1} className="font-inter text-sm" style={{ color: colors.muted }}>
                    {[TUNE_LIST_LABEL[item.list], tuneSummary(item.tune)].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}
