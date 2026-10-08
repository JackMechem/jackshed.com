import { formatComposer } from '@jam-practice/core/iRealPro';
import { UNSORTED_PLAYLIST_ID } from '@jam-practice/core/chordChartsLibrary';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { CheckIcon, FolderIcon, FolderMoveIcon, FolderPlusIcon, PencilIcon, TrashIcon } from '@/components/icons';
import type { LibrarySongMeta } from '@/lib/useChordChartsLibrary';
import { sheetEdge } from '@/components/sheetStyle';
import { useAppTheme } from '@/theme/ThemeProvider';

export type MenuTarget = { song: LibrarySongMeta; playlistId: string };

/**
 * The ⋮ menu for one chart in the Chord Charts list — a bottom sheet (thumb-reachable, big rows,
 * built for one-handed use on a gig) with two steps: the action list (Edit / Move / Delete), then — for
 * Move — a "pick a playlist" list plus a "New playlist" field. Deletion goes through
 * `ConfirmDialog` so a stray tap mid-song can't lose a chart. Hand-built `Modal` rather than
 * `@expo/ui`'s native sheet, same "not generic native chrome" call as `ToolOptionsSheet`.
 */
export function ChordChartSongMenu({
  target,
  playlists,
  onClose,
  onEdit,
  onMove,
  onDelete,
}: {
  target: MenuTarget | null;
  playlists: { id: string; name: string; count: number }[];
  onClose: () => void;
  onEdit: (songId: string) => void;
  onMove: (songId: string, playlistName: string) => void;
  onDelete: (songId: string) => void;
}) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<'actions' | 'move'>('actions');
  const [newName, setNewName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  function close() {
    setStep('actions');
    setNewName('');
    onClose();
  }

  const song = target?.song;
  const currentPlaylist = playlists.find((p) => p.id === target?.playlistId);
  const movable = playlists.filter((p) => p.id !== UNSORTED_PLAYLIST_ID);

  return (
    <>
      <Modal visible={!!target && !confirmDelete} transparent animationType="slide" onRequestClose={close}>
        <Pressable style={{ flex: 1 }} onPress={close} />
        <View
          style={{
            ...sheetEdge(colors),
            backgroundColor: colors.surface,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingBottom: insets.bottom + 12,
            maxHeight: '80%',
          }}
        >
          <View className="items-center pt-2.5">
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors['surface-hover'] }} />
          </View>
          {song ? (
            <View className="gap-0.5 px-5 pb-3 pt-3">
              <Text numberOfLines={1} className="font-inter-bold text-lg font-bold" style={{ color: colors.foreground }}>
                {song.title}
              </Text>
              <Text numberOfLines={1} className="font-inter text-sm" style={{ color: colors.muted }}>
                {[song.composer ? formatComposer(song.composer) : null, currentPlaylist?.name].filter(Boolean).join(' · ')}
              </Text>
            </View>
          ) : null}
          <View style={{ height: 1, backgroundColor: colors['surface-hover'] }} />

          {step === 'actions' ? (
            <View className="py-1">
              <SheetRow
                icon={<PencilIcon color={colors.foreground} size={22} />}
                label="Edit chart"
                onPress={() => {
                  const id = song?.id;
                  close();
                  if (id) onEdit(id);
                }}
              />
              <SheetRow
                icon={<FolderMoveIcon color={colors.foreground} size={22} />}
                label="Move to playlist"
                onPress={() => setStep('move')}
              />
              <SheetRow
                icon={<TrashIcon color={colors.danger} size={22} />}
                label="Delete chart"
                color={colors.danger}
                onPress={() => setConfirmDelete(true)}
              />
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingVertical: 4 }}>
              <Text className="font-inter-semibold px-5 pb-1 pt-2 text-xs font-semibold" style={{ color: colors.muted }}>
                Move to…
              </Text>
              {movable.map((p) => {
                const current = p.id === target?.playlistId;
                return (
                  <SheetRow
                    key={p.id}
                    icon={<FolderIcon color={current ? colors.muted : colors.foreground} size={22} />}
                    label={p.name}
                    detail={String(p.count)}
                    color={current ? colors.muted : undefined}
                    trailing={current ? <CheckIcon color={colors.accent} size={20} /> : undefined}
                    disabled={current}
                    onPress={() => {
                      if (song) onMove(song.id, p.name);
                      close();
                    }}
                  />
                );
              })}
              <View className="flex-row items-center gap-3 px-5 py-2">
                <FolderPlusIcon color={colors.foreground} size={22} />
                <TextInput
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="New playlist…"
                  placeholderTextColor={colors.muted}
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    if (song && newName.trim()) {
                      onMove(song.id, newName.trim());
                      close();
                    }
                  }}
                  className="font-inter flex-1 text-base"
                  style={{ color: colors.foreground, backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}
                />
                <Pressable
                  disabled={!newName.trim()}
                  onPress={() => {
                    if (song && newName.trim()) {
                      onMove(song.id, newName.trim());
                      close();
                    }
                  }}
                  className="rounded-xl px-4 py-2.5"
                  style={{ backgroundColor: colors.accent, opacity: newName.trim() ? 1 : 0.4 }}
                >
                  <Text className="font-inter-bold text-sm font-bold" style={{ color: colors['accent-foreground'] }}>
                    Move
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>

      <ConfirmDialog
        visible={confirmDelete}
        title="Delete this chart?"
        message={song ? `"${song.title}" will be removed from your library.` : ''}
        confirmLabel="Delete"
        onConfirm={() => {
          if (song) onDelete(song.id);
          setConfirmDelete(false);
          close();
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}

function SheetRow({
  icon,
  label,
  detail,
  color,
  trailing,
  disabled,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  detail?: string;
  color?: string;
  trailing?: React.ReactNode;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: colors['surface-hover'] }}
      className="flex-row items-center gap-3 px-5"
      style={{ minHeight: 56 }}
    >
      {icon}
      <Text numberOfLines={1} className="font-inter-semibold flex-1 text-base font-semibold" style={{ color: color ?? colors.foreground }}>
        {label}
      </Text>
      {detail ? (
        <Text className="font-inter text-sm tabular-nums" style={{ color: colors.muted }}>
          {detail}
        </Text>
      ) : null}
      {trailing}
    </Pressable>
  );
}
