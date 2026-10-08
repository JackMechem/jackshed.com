import { sortByText } from '@jam-practice/core/sortText';
import { formatComposer } from '@jam-practice/core/iRealPro';
import { UNSORTED_PLAYLIST_ID } from '@jam-practice/core/chordChartsLibrary';
import { useRouter } from 'expo-router';
import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { ActionSheet } from '@/components/ActionSheet';
import { ChordChartSongMenu, type MenuTarget } from '@/components/ChordChartSongMenu';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TAB_BAR_CONTENT_HEIGHT } from '@/components/FloatingTabBar';
import { ChevronRightIcon, ClearIcon, DotsVerticalIcon, FolderIcon, SearchIcon, TrashIcon } from '@/components/icons';
import { forgetRecentChart } from '@/lib/chordChartRecents';
import { useChordChartsLibrary, type LibrarySongMeta } from '@/lib/useChordChartsLibrary';
import { useAppTheme } from '@/theme/ThemeProvider';

/** Shared building blocks for the Chord Charts library screens — the top level
    (`app/tool/chord-charts.tsx`: Recent + playlist folders) and one playlist opened
    file-manager style (`app/tool/chord-charts-playlist.tsx`). Every row has a fixed height so
    lists can use `getItemLayout`, which is what makes the A–Z scrubber's jumps exact and instant
    thousands of rows down. */
export const ROW_H = 64;
export const FOLDER_H = 64;
export const LABEL_H = 40;
export const LETTERS = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];

export function letterOf(title: string) {
  const c = title.trim().charAt(0).toUpperCase();
  return c >= 'A' && c <= 'Z' ? c : '#';
}

export function songSubtitle(song: LibrarySongMeta, playlistName?: string) {
  return [song.composer ? formatComposer(song.composer) : null, playlistName].filter(Boolean).join(' · ');
}

export type SortedPlaylist = { id: string; name: string; songs: LibrarySongMeta[] };

/** The library hook plus everything both screens derive from it: playlists sorted by name
    ("Unsorted" last) with songs sorted by title, an id → {song, playlist} index, and the ⋮ menu
    (state + the rendered sheet, ready to drop into a screen). */
export function useChordChartBrowser(options: { onPlaylistDeleted?: (id: string) => void } = {}) {
  const router = useRouter();
  const library = useChordChartsLibrary(null);
  const { playlists: raw, moveSong, deleteSong, deletePlaylist } = library;
  const { colors } = useAppTheme();

  const playlists: SortedPlaylist[] = useMemo(() => {
    const real = sortByText(raw.filter((p) => p.id !== UNSORTED_PLAYLIST_ID), (p) => p.name);
    const unsorted = raw.filter((p) => p.id === UNSORTED_PLAYLIST_ID);
    return [...real, ...unsorted].map((p) => ({
      id: p.id,
      name: p.name,
      songs: sortByText(p.songs, (s) => s.title),
    }));
  }, [raw]);

  const songIndex = useMemo(() => {
    const map = new Map<string, { song: LibrarySongMeta; playlistId: string; playlistName: string }>();
    for (const p of playlists) for (const s of p.songs) map.set(s.id, { song: s, playlistId: p.id, playlistName: p.name });
    return map;
  }, [playlists]);

  const summaries = useMemo(() => playlists.map((p) => ({ id: p.id, name: p.name, count: p.songs.length })), [playlists]);

  const [menuTarget, setMenuTarget] = useState<MenuTarget | null>(null);
  // The playlist ⋮ menu, and the delete confirmation it leads to.
  const [playlistTarget, setPlaylistTarget] = useState<{ id: string; name: string; count: number } | null>(null);
  const [deletingPlaylist, setDeletingPlaylist] = useState<{ id: string; name: string; count: number } | null>(null);

  const openSong = useCallback(
    (id: string) => router.push({ pathname: '/tool/chord-charts-view', params: { id } }),
    [router],
  );

  const menu = (
    <>
    <ActionSheet
      visible={!!playlistTarget}
      title={playlistTarget?.name}
      subtitle={playlistTarget ? `${playlistTarget.count} chart${playlistTarget.count === 1 ? '' : 's'}` : undefined}
      onClose={() => setPlaylistTarget(null)}
      actions={[
        {
          key: 'delete',
          icon: <TrashIcon color={colors.danger} size={22} />,
          label: 'Delete playlist',
          danger: true,
          onPress: () => setDeletingPlaylist(playlistTarget),
        },
      ]}
    />
    <ConfirmDialog
      visible={!!deletingPlaylist}
      title={`Delete "${deletingPlaylist?.name ?? ''}"?`}
      message={
        deletingPlaylist
          ? `This deletes the playlist and all ${deletingPlaylist.count} chart${deletingPlaylist.count === 1 ? '' : 's'} in it. Tunes linked to those charts keep their notes and keys. This can't be undone.`
          : ''
      }
      confirmLabel="Delete playlist"
      onConfirm={() => {
        if (deletingPlaylist) {
          void deletePlaylist(deletingPlaylist.id);
          options.onPlaylistDeleted?.(deletingPlaylist.id);
        }
        setDeletingPlaylist(null);
      }}
      onCancel={() => setDeletingPlaylist(null)}
    />
    <ChordChartSongMenu
      target={menuTarget}
      playlists={summaries}
      onClose={() => setMenuTarget(null)}
      onEdit={(songId) => router.push({ pathname: '/tool/chord-charts-editor', params: { songId } })}
      onMove={(songId, name) => void moveSong(songId, name)}
      onDelete={(songId) => {
        void deleteSong(songId);
        forgetRecentChart(songId);
      }}
    />
    </>
  );

  /** Opens the ⋮ menu for a playlist (the synthetic "Unsorted" bucket has nothing to delete). */
  const openPlaylistMenu = (p: { id: string; name: string; count: number }) => {
    if (p.id !== UNSORTED_PLAYLIST_ID) setPlaylistTarget(p);
  };

  return { ...library, playlists, songIndex, openSong, openMenu: setMenuTarget, openPlaylistMenu, menu };
}

export const SongRow = memo(function SongRow({
  song,
  subtitle,
  onSelect,
  onMenu,
}: {
  song: LibrarySongMeta;
  subtitle: string;
  onSelect: () => void;
  onMenu: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View className="flex-row items-center" style={{ height: ROW_H }}>
      <Pressable
        onPress={onSelect}
        onLongPress={onMenu}
        android_ripple={{ color: colors['surface-hover'] }}
        className="flex-1 justify-center rounded-xl px-3"
        style={{ height: ROW_H - 4 }}
      >
        <Text numberOfLines={1} className="font-inter-semibold text-base font-semibold" style={{ color: colors.foreground }}>
          {song.title}
        </Text>
        {subtitle ? (
          <Text numberOfLines={1} className="font-inter text-sm" style={{ color: colors.muted }}>
            {subtitle}
          </Text>
        ) : null}
      </Pressable>
      <Pressable
        onPress={onMenu}
        accessibilityLabel={`Options for ${song.title}`}
        android_ripple={{ color: colors['surface-hover'], borderless: true, radius: 22 }}
        className="items-center justify-center"
        style={{ width: 44, height: 44 }}
      >
        <DotsVerticalIcon color={colors.muted} size={22} />
      </Pressable>
    </View>
  );
});

export const FolderRow = memo(function FolderRow({
  name,
  count,
  onPress,
  onMenu,
}: {
  name: string;
  count: number;
  onPress: () => void;
  /** Shows a ⋮ button (and long-press) for the playlist's menu. */
  onMenu?: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <View style={{ height: FOLDER_H, justifyContent: 'center' }}>
      <Pressable
        onPress={onPress}
        onLongPress={onMenu}
        accessibilityRole="button"
        accessibilityLabel={`${name}, ${count} charts`}
        android_ripple={{ color: colors['surface-hover'] }}
        className="flex-row items-center gap-3 rounded-xl px-4"
        style={{ height: FOLDER_H - 8, backgroundColor: colors.surface }}
      >
        <FolderIcon color={colors.accent} size={24} />
        <Text numberOfLines={1} className="font-inter-bold flex-1 text-base font-bold" style={{ color: colors.foreground }}>
          {name}
        </Text>
        <Text className="font-inter text-sm tabular-nums" style={{ color: colors.muted }}>
          {count}
        </Text>
        {onMenu ? (
          <Pressable
            onPress={onMenu}
            accessibilityLabel={`Options for ${name}`}
            hitSlop={8}
            android_ripple={{ color: colors['surface-hover'], borderless: true, radius: 20 }}
            className="items-center justify-center"
            style={{ width: 32, height: 40 }}
          >
            <DotsVerticalIcon color={colors.muted} size={22} />
          </Pressable>
        ) : (
          <ChevronRightIcon color={colors.muted} size={22} />
        )}
      </Pressable>
    </View>
  );
});

export function SectionLabel({ title }: { title: string }) {
  const { colors } = useAppTheme();
  return (
    <View style={{ height: LABEL_H, justifyContent: 'flex-end', paddingBottom: 6, paddingHorizontal: 4 }}>
      <Text className="font-inter-semibold text-sm font-semibold" style={{ color: colors.muted }}>
        {title}
      </Text>
    </View>
  );
}

/** The A–Z strip down the right edge. One responder over the whole strip (not a button per
    letter) so a finger can drag along it; letters with no chart are dimmed and jump to the next
    letter that has one. While touching, the letter shows big mid-screen, where a thumb on the
    strip isn't covering it. */
export function LetterScrubber({ available, onLetter }: { available: Map<string, number>; onLetter: (l: string) => void }) {
  const { colors } = useAppTheme();
  const stripRef = useRef<View>(null);
  const geom = useRef({ top: 0, height: 1 });
  const lastRef = useRef<string | null>(null);
  const [active, setActive] = useState<string | null>(null);

  function measure() {
    stripRef.current?.measureInWindow((_x, y, _w, h) => {
      geom.current = { top: y, height: h || 1 };
    });
  }

  function handle(pageY: number) {
    const { top, height } = geom.current;
    const i = Math.min(LETTERS.length - 1, Math.max(0, Math.floor(((pageY - top) / height) * LETTERS.length)));
    const letter = LETTERS[i];
    if (letter !== lastRef.current) {
      lastRef.current = letter;
      setActive(letter);
      onLetter(letter);
    }
  }

  function end() {
    lastRef.current = null;
    setActive(null);
  }

  return (
    <>
      <View
        style={{ width: 28, paddingTop: 4, paddingBottom: 8 + TAB_BAR_CONTENT_HEIGHT }}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={(e) => {
          measure();
          handle(e.nativeEvent.pageY);
        }}
        onResponderMove={(e) => handle(e.nativeEvent.pageY)}
        onResponderRelease={end}
        onResponderTerminate={end}
      >
        {/* Measured separately from the padded responder so letter math maps onto the letters. */}
        <View ref={stripRef} onLayout={measure} style={{ flex: 1, justifyContent: 'space-between', alignItems: 'center' }}>
          {LETTERS.map((l) => (
            <Text
              key={l}
              className="font-inter-bold text-[11px] font-bold"
              style={{
                color: l === active ? colors.accent : colors.foreground,
                opacity: available.has(l) ? 1 : 0.3,
              }}
            >
              {l}
            </Text>
          ))}
        </View>
      </View>
      {active ? (
        <View style={{ pointerEvents: 'none', position: 'absolute', top: '35%', left: 0, right: 0, alignItems: 'center' }}>
          <View className="items-center justify-center rounded-3xl" style={{ width: 96, height: 96, backgroundColor: colors.accent }}>
            <Text className="font-inter-extrabold text-5xl font-extrabold" style={{ color: colors['accent-foreground'] }}>
              {active}
            </Text>
          </View>
        </View>
      ) : null}
    </>
  );
}

export function SearchField({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const { colors } = useAppTheme();
  return (
    <View className="flex-row items-center gap-2 rounded-xl pl-3" style={{ backgroundColor: colors.surface }}>
      <SearchIcon color={colors.muted} size={18} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        returnKeyType="search"
        className="font-inter flex-1 text-base"
        style={{ color: colors.foreground, paddingVertical: 10 }}
      />
      {value ? (
        <Pressable onPress={() => onChange('')} accessibilityLabel="Clear search" className="h-11 w-11 items-center justify-center">
          <ClearIcon color={colors.muted} size={18} />
        </Pressable>
      ) : null}
    </View>
  );
}
