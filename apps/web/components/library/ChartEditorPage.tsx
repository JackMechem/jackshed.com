"use client";

import { useRouter } from "next/navigation";
import ChordChartEditor from "@/components/ChordChartEditor";
import LoadingSpinner from "@/components/LoadingSpinner";
import { PageShell } from "@/components/library/shared";
import { UNSORTED_PLAYLIST_ID } from "@/lib/chordChartsLibrary";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";

/** The chart builder as a page: a new chart (`/chord-charts/new`, optionally `?playlist=` to
    preselect one) or editing an existing one in place (`/chord-charts/edit?id=`). */
export default function ChartEditorPage({ editId, playlist }: { editId?: string; playlist?: string }) {
  const router = useRouter();
  const { playlists, loading, selectedSong, selectedSongLoading, importSongs, updateSong } = useChordChartsLibrary(editId ?? null);
  const names = playlists.filter((p) => p.id !== UNSORTED_PLAYLIST_ID).map((p) => p.name);

  if (loading || (editId && (selectedSongLoading || !selectedSong))) {
    return (
      <PageShell>
        <div className="flex justify-center py-24">
          {editId && !loading && !selectedSongLoading ? (
            <p className="text-sm text-muted">That chart isn&apos;t in your library.</p>
          ) : (
            <LoadingSpinner label="Loading…" showLabel />
          )}
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell wide>
      {editId && selectedSong ? (
        <ChordChartEditor key={editId} initial={selectedSong} onSave={(song) => updateSong(editId, song)} onClose={() => router.back()} />
      ) : (
        <ChordChartEditor
          playlists={names}
          defaultPlaylist={playlist && names.includes(playlist) ? playlist : undefined}
          onSave={async (song, playlistName) => {
            const { added } = await importSongs([song], playlistName);
            if (added === 0) throw new Error("A chart with this title, composer and key is already in your library.");
          }}
          onClose={() => router.back()}
        />
      )}
    </PageShell>
  );
}
