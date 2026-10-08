"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { chartHref } from "@/components/library/ChartsDashboard";
import { ChartRow, PageHeader, PageShell, SearchBox } from "@/components/library/shared";
import { useChartActions } from "@/components/library/useChartActions";
import { DotsVerticalIcon, PlusIcon } from "@/components/tools";
import { UNSORTED_PLAYLIST_ID } from "@/lib/chordChartsLibrary";
import { sortByText } from "@jam-practice/core/sortText";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";

/** One playlist's charts, alphabetical and searchable, each opening its own page; + adds a chart to
    this playlist, ⋮ deletes the playlist. */
export default function PlaylistPage({ id }: { id: string }) {
  const router = useRouter();
  const { playlists, loading } = useChordChartsLibrary(null);
  const { openSongMenu, openPlaylistMenu, element } = useChartActions({ onPlaylistDeleted: () => router.push("/chord-charts") });
  const [query, setQuery] = useState("");
  const playlist = playlists.find((p) => p.id === id);

  const q = query.trim().toLowerCase();
  const songs = useMemo(() => {
    const all = sortByText(playlist?.songs ?? [], (s) => s.title);
    return q ? all.filter((s) => `${s.title} ${s.composer}`.toLowerCase().includes(q)) : all;
  }, [playlist, q]);

  return (
    <PageShell>
      <PageHeader
        title={playlist?.name ?? "Playlist"}
        subtitle={playlist ? `${playlist.songs.length} chart${playlist.songs.length === 1 ? "" : "s"}` : undefined}
        back={() => router.push("/chord-charts")}
        actions={
          playlist && playlist.id !== UNSORTED_PLAYLIST_ID ? (
            <>
              <button
                type="button"
                onClick={() => router.push(`/chord-charts/new?playlist=${encodeURIComponent(playlist.name)}`)}
                aria-label={`New chord chart in ${playlist.name}`}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-foreground hover:bg-accent-hover"
              >
                <PlusIcon className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={(e) => openPlaylistMenu(e, { id: playlist.id, name: playlist.name, count: playlist.songs.length })}
                aria-label={`Options for ${playlist.name}`}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-muted hover:bg-surface-hover hover:text-foreground"
              >
                <DotsVerticalIcon className="h-5 w-5" />
              </button>
            </>
          ) : undefined
        }
      />
      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : !playlist ? (
        <p className="py-10 text-center text-sm text-muted">This playlist isn&apos;t in your library anymore.</p>
      ) : (
        <>
          <SearchBox value={query} onChange={setQuery} placeholder={`Search ${playlist.songs.length} in ${playlist.name}…`} />
          <section className="flex flex-col gap-0.5">
            {songs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">{q ? `No charts match “${query}”.` : "No charts here yet — press + to create one, or move charts in with ⋮."}</p>
            ) : (
              songs.map((s) => <ChartRow key={s.id} song={s} href={chartHref(s.id)} onMenu={(e) => openSongMenu(e, s, playlist.id)} />)
            )}
          </section>
        </>
      )}
      {element}
    </PageShell>
  );
}
