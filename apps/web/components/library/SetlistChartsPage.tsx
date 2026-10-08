"use client";

import { BackButton } from "@/components/library/shared";
import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import ChordChart from "@/components/ChordChart";
import LoadingSpinner from "@/components/LoadingSpinner";
import { ChevronLeftIcon, ChevronRightIcon, ChordChartIcon } from "@/components/tools";
import { formatComposer, transposeSong, type IRealSong } from "@/lib/iRealPro";
import type { PublicTune } from "@/lib/profileTunes";
import type { Tune } from "@/lib/types";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";
import { useSetlists } from "@/lib/useSetlists";
import { useSyncedTunes } from "@/lib/useSyncedTunes";
import { useTunesToLearn } from "@/lib/useTunesToLearn";
import { semitonesTo } from "@jam-practice/core/setlistKeys";

/** One page: a tune, with either its chart's library id (your own charts, loaded on demand), the
    chart itself (someone else's setlist), or neither. */
type ChartPage = { key: string; name: string; chartId?: string | null; song?: IRealSong | null; toKey?: string | null; tempo?: number | null };

const ID_RE = /^[a-z0-9]+$/i;

function publicPages(tunes: PublicTune[]): ChartPage[] {
  return tunes.map((t, i) => ({
    key: `${t.id}-${i}`,
    name: t.name,
    song: (t.linkedChart as unknown as IRealSong) ?? null,
    toKey: t.setKey ?? null,
    tempo: t.setTempo ?? t.tempos.find((x) => x.enabled)?.value ?? null,
  }));
}

/**
 * A setlist's charts, one per page — swipe (touch), the arrow keys, or the ‹ › buttons for the
 * next tune; built for reading on a gig, so each chart is scaled to fill the screen. Works for one
 * of your own setlists (`mine`), a Community setlist post (`post`) or a shared link (`shared`);
 * `start` opens on a given tune. Each tune is shown in the setlist's key for it (transposed).
 */
export default function SetlistChartsPage({ mine, post, shared, start }: { mine?: string; post?: string; shared?: string; start: number }) {
  const router = useRouter();
  const { setlists } = useSetlists();
  const [tunes] = useSyncedTunes();
  const [learn] = useTunesToLearn();
  const postData = useQuery(api.communityTunes.get, post && ID_RE.test(post) ? { id: post as Id<"communityTunes"> } : "skip");
  const sharedData = useQuery(api.setlists.getShared, shared ? { id: shared } : "skip");

  let title = "";
  let pages: ChartPage[] | null = null;
  if (mine) {
    const setlist = setlists.find((s) => s.id === mine);
    const all = [...tunes, ...learn];
    title = setlist?.name ?? "Setlist";
    pages = (setlist?.tuneIds ?? [])
      .map((id) => all.find((t) => t.id === id))
      .filter((t): t is Tune => !!t)
      .map((t) => {
        const o = setlist?.overrides?.[t.id];
        return { key: t.id, name: t.name, chartId: t.chordChartId ?? null, toKey: o?.key ?? null, tempo: o?.tempo ?? t.tempos.find((x) => x.enabled)?.value ?? null };
      });
  } else if (post) {
    if (postData !== undefined) {
      title = postData?.title ?? "Setlist";
      pages = postData ? publicPages(postData.tunes) : [];
    }
  } else if (shared) {
    if (sharedData !== undefined) {
      title = sharedData?.title ?? "Setlist";
      pages = sharedData ? publicPages(sharedData.tunes) : [];
    }
  } else {
    pages = [];
  }

  return (
    <main className="flex h-dvh w-full flex-col pt-[calc(env(safe-area-inset-top)+3.5rem)] lg:pt-0">
      {pages === null ? (
        <div className="flex flex-1 items-center justify-center">
          <LoadingSpinner label="Loading setlist…" showLabel />
        </div>
      ) : (
        <Pager pages={pages} title={title} start={Math.min(start, Math.max(0, pages.length - 1))} onBack={() => router.back()} />
      )}
    </main>
  );
}

function Pager({ pages, title, start, onBack }: { pages: ChartPage[]; title: string; start: number; onBack: () => void }) {
  const stripRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(start);

  const goTo = useCallback((i: number, smooth = true) => {
    const strip = stripRef.current;
    if (!strip) return;
    const clamped = Math.max(0, Math.min(pages.length - 1, i));
    strip.scrollTo({ left: clamped * strip.clientWidth, behavior: smooth ? "smooth" : "instant" });
  }, [pages.length]);

  // Open on `start`, without animating there.
  useEffect(() => {
    goTo(start, false);
  }, [goTo, start]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") goTo(index + 1);
      else if (e.key === "ArrowLeft" || e.key === "PageUp") goTo(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goTo, index]);

  const current = pages[index];

  return (
    <>
      <header className="flex items-center gap-3 px-4 py-2 sm:px-6">
        <BackButton onClick={onBack} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold text-accent">{current?.name ?? title}</h1>
          <p className="truncate text-xs text-muted">{pages.length ? `${index + 1} of ${pages.length} · ${title}` : title}</p>
        </div>
        {pages.length > 1 && (
          <div className="flex gap-1">
            <button type="button" onClick={() => goTo(index - 1)} disabled={index === 0} aria-label="Previous chart" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface hover:bg-surface-hover disabled:opacity-30">
              <ChevronLeftIcon className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => goTo(index + 1)} disabled={index === pages.length - 1} aria-label="Next chart" className="flex h-10 w-10 items-center justify-center rounded-full bg-surface hover:bg-surface-hover disabled:opacity-30">
              <ChevronRightIcon className="h-5 w-5" />
            </button>
          </div>
        )}
      </header>
      {pages.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-sm text-muted">No tunes yet.</p>
      ) : (
        <div
          ref={stripRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            const i = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
            if (i !== index) setIndex(i);
          }}
          className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
        >
          {pages.map((p, i) => (
            <div key={p.key} className="flex h-full w-full shrink-0 snap-center flex-col px-2 pb-2 sm:px-6">
              {Math.abs(i - index) <= 1 ? <Page page={p} /> : null}
            </div>
          ))}
        </div>
      )}
      {pages.length > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 px-4 pb-3 pt-1">
          {pages.map((p, i) => (
            <button
              key={p.key}
              type="button"
              onClick={() => goTo(i)}
              aria-label={`Go to ${p.name}`}
              className={`h-1.5 rounded-full ${i === index ? "w-4 bg-accent" : "w-1.5 bg-surface-hover"}`}
            />
          ))}
        </div>
      )}
    </>
  );
}

const Page = memo(function Page({ page }: { page: ChartPage }) {
  if (page.song) return <ChartBody song={page.song} toKey={page.toKey} tempo={page.tempo} />;
  if (page.chartId) return <LibraryChart name={page.name} chartId={page.chartId} toKey={page.toKey} tempo={page.tempo} />;
  return <NoChart name={page.name} />;
});

function LibraryChart({ name, chartId, toKey, tempo }: { name: string; chartId: string; toKey?: string | null; tempo?: number | null }) {
  const { selectedSong, selectedSongLoading, loading } = useChordChartsLibrary(chartId);
  if (selectedSong) return <ChartBody song={selectedSong} toKey={toKey} tempo={tempo} />;
  if (selectedSongLoading || loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <LoadingSpinner label="Loading chart…" showLabel />
      </div>
    );
  }
  return <NoChart name={name} missing />;
}

function NoChart({ name, missing }: { name: string; missing?: boolean }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-10 text-center">
      <ChordChartIcon className="h-8 w-8 text-muted" />
      <p className="text-xl font-bold">{name}</p>
      <p className="text-sm text-muted">{missing ? "Couldn't find this tune's chart." : "No chord chart for this tune."}</p>
    </div>
  );
}

function ChartBody({ song: original, toKey, tempo }: { song: IRealSong; toKey?: string | null; tempo?: number | null }) {
  const song = useMemo(() => (toKey ? transposeSong(original, semitonesTo(original.key, toKey)) : original), [original, toKey]);
  const info = [
    song.composer ? formatComposer(song.composer) : null,
    song.style || null,
    song.key || null,
    `${song.timeSignature.top}/${song.timeSignature.bottom}`,
    tempo ? `${tempo} BPM` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 rounded-2xl bg-surface p-2 sm:p-4">
      {info && <p className="truncate px-1 text-xs text-muted">{info}</p>}
      <div className="min-h-0 flex-1">
        <ChordChart song={song} fullscreen hideHeader />
      </div>
    </div>
  );
}
