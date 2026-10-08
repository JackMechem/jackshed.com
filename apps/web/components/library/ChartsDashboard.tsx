"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import LoadingSpinner from "@/components/LoadingSpinner";
import PromptDialog from "@/components/PromptDialog";
import { ChartRow, EmptyCard, FolderRow, PageHeader, PageShell, RecentCards, SearchBox, SectionHeader, StatCard, menuPosition } from "@/components/library/shared";
import { useChartActions } from "@/components/library/useChartActions";
import { useTuneLists } from "@/components/library/useTuneActions";
import { ChordChartIcon, LinkIcon, PlusIcon } from "@/components/tools";
import { UNSORTED_PLAYLIST_ID } from "@/lib/chordChartsLibrary";
import { formatComposer } from "@/lib/iRealPro";
import { useRecentCharts } from "@/lib/recents";
import { sortByText } from "@jam-practice/core/sortText";
import { useChordChartsLibrary, type LibrarySongMeta } from "@/lib/useChordChartsLibrary";

export const chartHref = (id: string) => `/chord-charts/view?id=${encodeURIComponent(id)}`;
export const playlistHref = (id: string) => `/chord-charts/playlist?id=${encodeURIComponent(id)}`;

function FolderGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
    </svg>
  );
}

/**
 * The Chord Charts page — modeled on the mobile app's Chord Charts tab: search across every chart,
 * counts (charts / playlists / charts linked to one of your tunes), the charts you opened most
 * recently, and your playlists as folders (each opens its own page; ⋮ to delete). The + makes a
 * new chart or playlist, or imports. A chart opens on its own page (`ChartViewPage`); every chart
 * row has the chart ⋮ menu (`useChartActions`).
 */
export default function ChartsDashboard() {
  const router = useRouter();
  const { playlists: raw, totalSongs, loading, createPlaylist } = useChordChartsLibrary(null);
  const { openSongMenu, openPlaylistMenu, element } = useChartActions();
  const recent = useRecentCharts();
  const lists = useTuneLists();
  const [query, setQuery] = useState("");
  const [addMenu, setAddMenu] = useState<MenuState | null>(null);
  const [naming, setNaming] = useState(false);

  const playlists = useMemo(() => {
    const real = sortByText(raw.filter((p) => p.id !== UNSORTED_PLAYLIST_ID), (p) => p.name);
    return [...real, ...raw.filter((p) => p.id === UNSORTED_PLAYLIST_ID)];
  }, [raw]);
  const index = useMemo(() => {
    const m = new Map<string, { song: LibrarySongMeta; playlistId: string; playlistName: string }>();
    for (const p of playlists) for (const s of p.songs) m.set(s.id, { song: s, playlistId: p.id, playlistName: p.name });
    return m;
  }, [playlists]);

  const q = query.trim().toLowerCase();
  const hits = useMemo(() => {
    if (!q) return null;
    const words = q.split(/\s+/);
    return sortByText(
      [...index.values()].filter(({ song }) => words.every((w) => `${song.title} ${song.composer} ${song.style}`.toLowerCase().includes(w))),
      (h) => h.song.title,
    );
  }, [q, index]);

  const linked = new Set([...lists.tunes.tunes, ...lists.learn.tunes].map((t) => t.chordChartId).filter((id): id is string => !!id && index.has(id))).size;
  const recentCards = recent.ids
    .map((id) => index.get(id))
    .filter((x) => x !== undefined)
    .map((r) => ({ key: r.song.id, title: r.song.title, detail: [r.song.key, r.playlistName].filter(Boolean).join(" · "), href: chartHref(r.song.id), icon: ChordChartIcon }));

  return (
    <PageShell>
      <PageHeader
        title="Chord Charts"
        actions={
          <button
            type="button"
            onClick={(e) =>
              setAddMenu({
                ...menuPosition(e),
                items: [
                  { label: "New chord chart", onSelect: () => router.push("/chord-charts/new") },
                  { label: "New playlist", onSelect: () => setNaming(true) },
                  { label: "Import charts", onSelect: () => router.push("/chord-charts/import") },
                ],
              })
            }
            aria-label="New chord chart, playlist or import"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-foreground hover:bg-accent-hover"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
        }
      />
      <SearchBox value={query} onChange={setQuery} placeholder={`Search ${totalSongs} charts…`} />

      {loading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner label="Loading your charts…" showLabel />
        </div>
      ) : hits ? (
        <section className="flex flex-col gap-1">
          {hits.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">No charts match “{query}”.</p>
          ) : (
            hits.slice(0, 200).map((h) => (
              <ChartRow
                key={h.song.id}
                song={h.song}
                subtitle={[h.song.composer ? formatComposer(h.song.composer) : null, h.playlistName].filter(Boolean).join(" · ")}
                href={chartHref(h.song.id)}
                onMenu={(e) => openSongMenu(e, h.song, h.playlistId)}
              />
            ))
          )}
        </section>
      ) : (
        <>
          <div className="flex gap-3">
            <StatCard icon={ChordChartIcon} count={totalSongs} label="Charts" />
            <StatCard icon={FolderGlyph} count={playlists.filter((p) => p.id !== UNSORTED_PLAYLIST_ID).length} label="Playlists" />
            <StatCard icon={LinkIcon} count={linked} label="Linked to tunes" />
          </div>

          {totalSongs === 0 && (
            <EmptyCard>
              No chord charts yet. Build one or import a chart link or playlist with the + button.
            </EmptyCard>
          )}

          {recentCards.length > 0 && (
            <section className="flex flex-col gap-2">
              <SectionHeader title="Recently opened" />
              <RecentCards items={recentCards} />
            </section>
          )}

          {playlists.length > 0 && (
            <section className="flex flex-col gap-2">
              <SectionHeader title="Playlists" />
              {playlists.map((p) => (
                <FolderRow
                  key={p.id}
                  name={p.name}
                  count={p.songs.length}
                  href={playlistHref(p.id)}
                  onMenu={p.id === UNSORTED_PLAYLIST_ID ? undefined : (e) => openPlaylistMenu(e, { id: p.id, name: p.name, count: p.songs.length })}
                />
              ))}
            </section>
          )}
        </>
      )}

      {element}
      {addMenu && <ContextMenu menu={addMenu} onClose={() => setAddMenu(null)} />}
      {naming && (
        <PromptDialog
          title="New playlist"
          initialValue=""
          onSubmit={(name) => {
            if (name.trim()) void createPlaylist(name.trim());
            setNaming(false);
          }}
          onCancel={() => setNaming(false)}
        />
      )}
    </PageShell>
  );
}
