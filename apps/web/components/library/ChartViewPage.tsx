"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import ChordChart from "@/components/ChordChart";
import LoadingSpinner from "@/components/LoadingSpinner";
import { PageShell } from "@/components/library/shared";
import { useChartActions } from "@/components/library/useChartActions";
import Select from "@/components/Select";
import { DotsVerticalIcon, MaximizeIcon, MinimizeIcon } from "@/components/tools";
import { formatComposer, KEY_NAMES, keyPitchClass, transposeSong } from "@/lib/iRealPro";
import { useRecentCharts } from "@/lib/recents";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";

/** One chord chart on its own page: title and details up top, a key selector (display-only
    transpose), full-screen, and the chart ⋮ menu (edit / move / delete). Opening it puts it in
    "Recently opened". */
export default function ChartViewPage({ id }: { id: string }) {
  const router = useRouter();
  const { selectedSong: chart, selectedSongLoading, loading, playlists } = useChordChartsLibrary(id || null);
  const { openSongMenu, element } = useChartActions({ onSongDeleted: () => router.back() });
  const [transposeKey, setTransposeKey] = useState("");
  const [fullscreen, setFullscreen] = useState(false);

  const { record } = useRecentCharts();
  const recordRef = useRef(record);
  useEffect(() => {
    recordRef.current = record;
  });
  useEffect(() => {
    if (id) recordRef.current(id);
  }, [id]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFullscreen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  const owner = playlists.find((p) => p.songs.some((s) => s.id === id));
  const shown = useMemo(() => {
    if (!chart || !transposeKey) return chart;
    const semis = (KEY_NAMES.indexOf(transposeKey) - keyPitchClass(chart.key) + 12) % 12;
    return semis ? transposeSong(chart, semis) : chart;
  }, [chart, transposeKey]);

  if (loading || selectedSongLoading) {
    return (
      <PageShell>
        <div className="flex justify-center py-24">
          <LoadingSpinner label="Loading chart…" showLabel />
        </div>
      </PageShell>
    );
  }
  if (!chart || !shown) {
    return (
      <PageShell>
        <p className="py-24 text-center text-sm text-muted">That chart isn&apos;t in your library.</p>
      </PageShell>
    );
  }

  return (
    <PageShell wide>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={() => router.back()} className="mb-1 text-sm text-muted hover:text-foreground">
            ← Back
          </button>
          <h1 className="truncate text-3xl font-extrabold tracking-tight">{chart.title}</h1>
          <p className="truncate text-sm text-muted">
            {[chart.composer ? formatComposer(chart.composer) : null, chart.style || null, shown.key || null, `${chart.timeSignature.top}/${chart.timeSignature.bottom}`, owner?.name]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={transposeKey}
            onChange={setTransposeKey}
            options={[{ value: "", label: `Original (${chart.key || "—"})` }, ...KEY_NAMES.map((k) => ({ value: k, label: k }))]}
            className="min-w-32"
          />
          <button type="button" onClick={() => setFullscreen(true)} aria-label="Full screen" title="Full screen" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-muted hover:bg-surface-hover hover:text-foreground">
            <MaximizeIcon className="h-4 w-4" />
          </button>
          {owner && (
            <button
              type="button"
              onClick={(e) => openSongMenu(e, { id, title: chart.title }, owner.id)}
              aria-label="Chart options"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-muted hover:bg-surface-hover hover:text-foreground"
            >
              <DotsVerticalIcon className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-surface p-2 sm:p-6">
        <ChordChart song={shown} hideHeader />
      </div>

      {fullscreen && (
        <div className="fixed inset-0 z-[80] flex flex-col gap-3 bg-background p-4 sm:p-6">
          <button
            type="button"
            onClick={() => setFullscreen(false)}
            aria-label="Exit full screen"
            className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-surface text-muted hover:bg-surface-hover hover:text-foreground sm:right-6 sm:top-6"
          >
            <MinimizeIcon className="h-4 w-4" />
          </button>
          <div className="min-h-0 flex-1">
            <ChordChart song={shown} fullscreen />
          </div>
        </div>
      )}
      {element}
    </PageShell>
  );
}
