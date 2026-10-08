"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import ContextMenu, { type MenuState } from "@/components/ContextMenu";
import { EmptyCard, PageHeader, PageShell, RecentCards, SearchBox, SectionHeader, StatCard, TuneRow, menuPosition, tuneSummary } from "@/components/library/shared";
import { tuneHref, TUNE_LIST_LABEL, useTuneActions, useTuneLists, type TuneListId } from "@/components/library/useTuneActions";
import { SetlistRow, setlistHref } from "@/components/library/setlistParts";
import PromptDialog from "@/components/PromptDialog";
import StandardsPicker from "@/components/StandardsPicker";
import { NoteIcon, PlusIcon, SetlistIcon, StarIcon } from "@/components/tools";
import TuneEditorModal from "@/components/TuneEditorModal";
import { useRecentTunes } from "@/lib/recents";
import { DEFAULT_TIME_SIGNATURE, makeId, type Tune } from "@/lib/types";
import { useSetlists } from "@/lib/useSetlists";

const PREVIEW = 5;

function blankTune(name = ""): Tune {
  return { id: makeId(), name, tempos: [], keys: [], timeSignature: DEFAULT_TIME_SIGNATURE, notes: "" };
}

/**
 * The Tunes page — a dashboard for your tune lists, modeled on the mobile app's Tunes tab: Tunes I
 * Know, Tunes to Learn and your setlists, with counts (each opens the full list), the tunes you
 * opened most recently, your latest setlists, and the tunes you added most recently in each list.
 * One search covers both lists. The + makes a setlist or adds a jazz standard, a new tune, or a
 * tune to learn. Every tune opens its own page
 * (`TuneHub`) and has a ⋮ menu (`useTuneActions`).
 */
export default function TunesDashboard() {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const { setlists, create: createSetlist } = useSetlists();
  const [namingSetlist, setNamingSetlist] = useState(false);
  const lists = useTuneLists();
  const recent = useRecentTunes();
  const { openTuneMenu, element } = useTuneActions();
  const [query, setQuery] = useState("");
  const [addMenu, setAddMenu] = useState<MenuState | null>(null);
  const [addingStandard, setAddingStandard] = useState(false);
  const [creating, setCreating] = useState<{ list: TuneListId; tune: Tune } | null>(null);

  const tunes = lists.tunes.tunes;
  const learn = lists.learn.tunes;
  const withChart = tunes.filter((t) => t.chordChartId).length;

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return null;
    const words = q.split(/\s+/);
    const match = (t: Tune) => words.every((w) => `${t.name} ${tuneSummary(t)} ${t.notes}`.toLowerCase().includes(w));
    return { tunes: tunes.filter(match), learn: learn.filter(match) };
  }, [q, tunes, learn]);

  const recentCards = recent.ids
    .map((id) => {
      for (const list of ["tunes", "learn"] as TuneListId[]) {
        const tune = lists[list].tunes.find((t) => t.id === id);
        if (tune)
          return {
            key: tune.id,
            title: tune.name,
            detail: `${list === "learn" ? "To learn" : "I know"} · ${tune.keys.length} of 12 keys`,
            href: tuneHref(list, tune.id),
            icon: NoteIcon,
          };
      }
      return null;
    })
    .filter((x) => x !== null);

  function row(list: TuneListId) {
    return function renderTune(tune: Tune) {
      return <TuneRow key={tune.id} tune={tune} href={tuneHref(list, tune.id)} onMenu={(e) => openTuneMenu(e, list, tune)} />;
    };
  }

  return (
    <PageShell>
      <PageHeader
        title="Tunes"
        actions={
          <button
            type="button"
            onClick={(e) =>
              setAddMenu({
                ...menuPosition(e),
                items: [
                  { label: "New setlist", onSelect: () => setNamingSetlist(true) },
                  { label: "Add a jazz standard", onSelect: () => setAddingStandard(true) },
                  { label: "New tune", onSelect: () => setCreating({ list: "tunes", tune: blankTune() }) },
                  ...(isAuthenticated ? [{ label: "New tune to learn", onSelect: () => setCreating({ list: "learn", tune: blankTune() }) }] : []),
                ],
              })
            }
            aria-label="Add a tune"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-foreground hover:bg-accent-hover"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
        }
      />
      <SearchBox value={query} onChange={setQuery} placeholder="Search your tunes…" />

      {results ? (
        <>
          {results.tunes.length > 0 && (
            <section className="flex flex-col gap-1">
              <SectionHeader title={TUNE_LIST_LABEL.tunes} detail={String(results.tunes.length)} />
              {results.tunes.slice(0, 50).map(row("tunes"))}
            </section>
          )}
          {results.learn.length > 0 && (
            <section className="flex flex-col gap-1">
              <SectionHeader title={TUNE_LIST_LABEL.learn} detail={String(results.learn.length)} />
              {results.learn.slice(0, 50).map(row("learn"))}
            </section>
          )}
          {results.tunes.length + results.learn.length === 0 && <p className="py-6 text-center text-sm text-muted">Nothing matches “{query}”.</p>}
        </>
      ) : (
        <>
          <div className="flex gap-3">
            <StatCard icon={NoteIcon} count={tunes.length} label="I Know" href="/tunes/list?list=tunes" />
            <StatCard icon={StarIcon} count={learn.length} label="To Learn" href="/tunes/list?list=learn" />
            <StatCard icon={SetlistIcon} count={setlists.length} label="Setlists" href="/tunes/setlists" />
          </div>

          {recentCards.length > 0 && (
            <section className="flex flex-col gap-2">
              <SectionHeader title="Recently opened" />
              <RecentCards items={recentCards} />
            </section>
          )}

          <section className="flex flex-col gap-1.5">
            <SectionHeader title="Setlists" detail={setlists.length > PREVIEW ? String(setlists.length) : undefined} href={setlists.length ? "/tunes/setlists" : undefined} />
            {setlists.length === 0 ? (
              <button type="button" onClick={() => setNamingSetlist(true)} className="flex items-center gap-3 rounded-2xl bg-surface p-4 text-left text-sm text-muted hover:bg-surface-hover">
                <SetlistIcon className="h-5 w-5 shrink-0 text-accent" />
                Make a setlist for a gig or a session — share it by link or post it to Community.
              </button>
            ) : (
              [...setlists]
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .slice(0, PREVIEW)
                .map((sl) => <SetlistRow key={sl.id} setlist={sl} />)
            )}
          </section>

          <section className="flex flex-col gap-1">
            <SectionHeader title={TUNE_LIST_LABEL.tunes} detail={tunes.length ? `${tunes.length - withChart} without a chart` : undefined} href="/tunes/list?list=tunes" />
            {tunes.length === 0 ? <EmptyCard>No tunes yet — press + to add a jazz standard or your own.</EmptyCard> : [...tunes].reverse().slice(0, PREVIEW).map(row("tunes"))}
          </section>

          {isAuthenticated && (
            <section className="flex flex-col gap-1">
              <SectionHeader title={TUNE_LIST_LABEL.learn} href="/tunes/list?list=learn" />
              {learn.length === 0 ? <EmptyCard>Tunes you want to learn, kept apart from the ones you know.</EmptyCard> : [...learn].reverse().slice(0, PREVIEW).map(row("learn"))}
            </section>
          )}
        </>
      )}

      {element}
      {addMenu && <ContextMenu menu={addMenu} onClose={() => setAddMenu(null)} />}
      {namingSetlist && (
        <PromptDialog
          title="New setlist"
          initialValue=""
          placeholder="e.g. Friday gig"
          confirmLabel="Create"
          onSubmit={(name) => {
            setNamingSetlist(false);
            router.push(setlistHref(createSetlist(name).id));
          }}
          onCancel={() => setNamingSetlist(false)}
        />
      )}
      {addingStandard && (
        <StandardsPicker
          tunes={lists.tunes.tunes}
          setTunes={lists.tunes.setTunes}
          onClose={() => setAddingStandard(false)}
          onCreateCustom={(name) => {
            setAddingStandard(false);
            setCreating({ list: "tunes", tune: blankTune(name) });
          }}
        />
      )}
      {creating && (
        <TuneEditorModal
          initial={creating.tune}
          isNew
          onSave={(t) => {
            lists[creating.list].setTunes((prev) => [...prev, t]);
            setCreating(null);
          }}
          onClose={() => setCreating(null)}
        />
      )}
    </PageShell>
  );
}
