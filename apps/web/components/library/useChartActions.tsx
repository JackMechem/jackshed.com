"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import ContextMenu, { type MenuItem, type MenuState } from "@/components/ContextMenu";
import PromptDialog from "@/components/PromptDialog";
import { menuPosition } from "@/components/library/shared";
import { UNSORTED_PLAYLIST_ID } from "@/lib/chordChartsLibrary";
import { useRecentCharts } from "@/lib/recents";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";

/**
 * The ⋮ menus for chord charts and playlists, shared by every Chord Charts page: a chart's menu
 * (Edit / Move to a playlist / Move to a new playlist… / Delete) and a playlist's (Delete playlist,
 * confirmed). Returns the openers plus `element` — the menu and its dialogs — to render once.
 */
export function useChartActions(options: { onPlaylistDeleted?: () => void; onSongDeleted?: () => void } = {}) {
  const router = useRouter();
  const { playlists, moveSong, deleteSong, deletePlaylist } = useChordChartsLibrary(null);
  const recents = useRecentCharts();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [movingToNew, setMovingToNew] = useState<string | null>(null);
  const [deletingSong, setDeletingSong] = useState<{ id: string; title: string } | null>(null);
  const [deletingPlaylist, setDeletingPlaylist] = useState<{ id: string; name: string; count: number } | null>(null);

  function openSongMenu(e: React.MouseEvent, song: { id: string; title: string }, playlistId: string) {
    const items: MenuItem[] = [
      { label: "Edit chart", onSelect: () => router.push(`/chord-charts/edit?id=${encodeURIComponent(song.id)}`) },
      ...playlists
        .filter((p) => p.id !== playlistId && p.id !== UNSORTED_PLAYLIST_ID)
        .slice(0, 8)
        .map((p) => ({ label: `Move to ${p.name}`, onSelect: () => void moveSong(song.id, p.name) })),
      { label: "Move to a new playlist…", onSelect: () => setMovingToNew(song.id) },
      { label: "Delete chart", danger: true, onSelect: () => setDeletingSong(song) },
    ];
    setMenu({ ...menuPosition(e), items });
  }

  function openPlaylistMenu(e: React.MouseEvent, playlist: { id: string; name: string; count: number }) {
    if (playlist.id === UNSORTED_PLAYLIST_ID) return;
    setMenu({ ...menuPosition(e), items: [{ label: "Delete playlist", danger: true, onSelect: () => setDeletingPlaylist(playlist) }] });
  }

  const element = (
    <>
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {movingToNew && (
        <PromptDialog
          title="Move to a new playlist"
          initialValue=""
          onSubmit={(name) => {
            if (name.trim()) void moveSong(movingToNew, name.trim());
            setMovingToNew(null);
          }}
          onCancel={() => setMovingToNew(null)}
        />
      )}
      {deletingSong && (
        <ConfirmDialog
          title={`Delete "${deletingSong.title}"?`}
          message="This removes the chart from your library. This can't be undone."
          confirmLabel="Delete"
          onConfirm={() => {
            void deleteSong(deletingSong.id);
            recents.forget(deletingSong.id);
            setDeletingSong(null);
            options.onSongDeleted?.();
          }}
          onCancel={() => setDeletingSong(null)}
        />
      )}
      {deletingPlaylist && (
        <ConfirmDialog
          title={`Delete "${deletingPlaylist.name}"?`}
          message={`This deletes the playlist and all ${deletingPlaylist.count} chart${deletingPlaylist.count === 1 ? "" : "s"} in it. Tunes linked to those charts keep their notes and keys. This can't be undone.`}
          confirmLabel="Delete playlist"
          onConfirm={() => {
            void deletePlaylist(deletingPlaylist.id);
            setDeletingPlaylist(null);
            options.onPlaylistDeleted?.();
          }}
          onCancel={() => setDeletingPlaylist(null)}
        />
      )}
    </>
  );

  return { openSongMenu, openPlaylistMenu, element };
}
