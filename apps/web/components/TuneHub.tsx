"use client";

import { BackButton } from "@/components/library/shared";
import { useConvexAuth } from "@convex-dev/auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import ChordChart from "@/components/ChordChart";
import ConfirmDialog from "@/components/ConfirmDialog";
import LoadingSpinner from "@/components/LoadingSpinner";
import Select from "@/components/Select";
import TuneEditorModal from "@/components/TuneEditorModal";
import ChartLinkPicker from "@/components/library/ChartLinkPicker";
import { TuneRecordings } from "@/components/recordings/RecordingParts";
import { ChordChartIcon, LinkIcon, PencilIcon, TrashIcon } from "@/components/tools";
import { KEY_NAMES, keyPitchClass, transposeSong } from "@/lib/iRealPro";
import { makeId, type Tune } from "@/lib/types";
import { useChordChartsLibrary, type LibrarySongMeta } from "@/lib/useChordChartsLibrary";
import { useRecentTunes } from "@/lib/recents";
import { useSyncedTunes } from "@/lib/useSyncedTunes";
import { useTunesToLearn } from "@/lib/useTunesToLearn";

type ListId = "tunes" | "learn";
const LIST_LABEL: Record<ListId, string> = { tunes: "Tunes I Know", learn: "Tunes to Learn" };
const NOTES_SAVE_MS = 600;

/** Loose title match for "is there already a chart for this tune": case, punctuation and a
    leading or trailing article are ignored (iReal titles are often "Man I Love, The"). */
function titleKey(title: string) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^(the|a|an) /, "")
    .replace(/ (the|a|an)$/, "");
}

/** Minor if the tune's own keys are written as minor ("Dm", "D-", "Dmin"). */
function isMinorKey(value: string) {
  return /^[A-Ga-g][#b]?(m(?!aj)|-|min)/.test(value.trim());
}

/**
 * A tune's own page — a hub for *learning* it, mirroring the mobile app's tune page: its chord
 * chart right on the page (transposable), the 12 keys as a grid you mark as you learn them (that's
 * the tune's own key list — the keys Jam Practice picks from), and notes you write straight in,
 * saved as you type. Edit opens the usual tune form; the tune can be moved between Tunes I Know
 * and Tunes to Learn, or deleted. Linked from every tune in the account's tune lists.
 */
export default function TuneHub({ id, list: listParam }: { id: string; list?: string }) {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const [tunes, setTunes] = useSyncedTunes();
  const [learn, setLearn] = useTunesToLearn();
  const lists = { tunes: { tunes, setTunes }, learn: { tunes: learn, setTunes: setLearn } };

  // Look in both lists (editing or moving can change which one it's in); prefer the one linked to.
  const order: ListId[] = listParam === "learn" ? ["learn", "tunes"] : ["tunes", "learn"];
  let found: { list: ListId; tune: Tune } | null = null;
  for (const l of order) {
    const tune = lists[l].tunes.find((t) => t.id === id);
    if (tune) {
      found = { list: l, tune };
      break;
    }
  }

  if (!found) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 px-4 py-24 text-center">
        <p className="text-sm text-muted">That tune isn&apos;t in your lists.</p>
        <Link href="/tunes" className="text-sm font-semibold text-accent">
          Go to your tunes
        </Link>
      </div>
    );
  }
  return (
    <Hub
      key={found.tune.id}
      list={found.list}
      tune={found.tune}
      setTunes={lists[found.list].setTunes}
      moveTo={(target) => {
        const t = found.tune;
        lists[found.list].setTunes((prev) => prev.filter((x) => x.id !== t.id));
        lists[target].setTunes((prev) => [...prev, t]);
      }}
      canUseLearn={isAuthenticated}
      onDeleted={() => router.back()}
    />
  );
}

function Hub({
  list,
  tune,
  setTunes,
  moveTo,
  canUseLearn,
  onDeleted,
}: {
  list: ListId;
  tune: Tune;
  setTunes: (update: Tune[] | ((prev: Tune[]) => Tune[])) => void;
  moveTo: (target: ListId) => void;
  canUseLearn: boolean;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const { selectedSong: chart, selectedSongLoading, loading: libraryLoading, allSongs } = useChordChartsLibrary(tune.chordChartId ?? null);
  const [previewKey, setPreviewKey] = useState("");
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function patch(update: Partial<Tune>) {
    setTunes((prev) =>
      prev.map((t) => {
        if (t.id !== tune.id) return t;
        const next = { ...t, ...update };
        if (next.chordChartId === undefined) delete next.chordChartId;
        return next;
      }),
    );
  }

  // --- notes: saved shortly after you stop typing, and when leaving the page ---
  const [notes, setNotes] = useState(tune.notes);
  const pending = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef<(text: string) => void>(() => {});
  useEffect(() => {
    saveRef.current = (text) => setTunes((prev) => prev.map((t) => (t.id === tune.id ? { ...t, notes: text } : t)));
  });
  function flushNotes() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current !== null) {
      saveRef.current(pending.current);
      pending.current = null;
    }
  }
  useEffect(() => () => flushNotes(), []);

  // --- keys you know it in ---
  const minor = tune.keys.length > 0 ? tune.keys.every((k) => isMinorKey(k.value)) : !!chart && isMinorKey(chart.key);
  const suffix = minor ? "m" : "";
  const knownPcs = new Set(tune.keys.map((k) => keyPitchClass(k.value)));
  function toggleKey(pc: number) {
    if (knownPcs.has(pc)) patch({ keys: tune.keys.filter((k) => keyPitchClass(k.value) !== pc) });
    else patch({ keys: [...tune.keys, { id: makeId(), value: `${KEY_NAMES[pc]}${suffix}`, enabled: true }] });
  }

  // Charts whose title matches the tune's name — a one-tap link when none is linked.
  const matches = useMemo(() => {
    if (tune.chordChartId) return [];
    const want = titleKey(tune.name);
    const out: { song: LibrarySongMeta; playlist: string }[] = [];
    for (const s of allSongs) if (titleKey(s.title) === want) out.push({ song: s, playlist: s.playlistNames });
    return out.slice(0, 3);
  }, [tune.chordChartId, tune.name, allSongs]);

  const shownChart = useMemo(() => {
    if (!chart || !previewKey) return chart;
    const semis = (KEY_NAMES.indexOf(previewKey) - keyPitchClass(chart.key) + 12) % 12;
    return semis ? transposeSong(chart, semis) : chart;
  }, [chart, previewKey]);

  const tempos = tune.tempos.map((t) => t.value);
  const other: ListId = list === "tunes" ? "learn" : "tunes";

  function openInChordCharts() {
    if (!tune.chordChartId) return;
    router.push(`/chord-charts/view?id=${encodeURIComponent(tune.chordChartId)}`);
  }

  // Opening a tune's page puts it in the Tunes page's "Recently opened".
  const { record: recordRecent } = useRecentTunes();
  const recordRef = useRef(recordRecent);
  useEffect(() => {
    recordRef.current = recordRecent;
  });
  useEffect(() => {
    recordRef.current(tune.id);
  }, [tune.id]);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 pb-16 pt-[calc(env(safe-area-inset-top)+4.5rem)] sm:px-6 lg:pt-12">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <BackButton onClick={() => router.back()} className="mb-2" />
          <h1 className="truncate text-3xl font-bold">{tune.name}</h1>
          <p className="text-sm text-muted">
            {[LIST_LABEL[list], tune.timeSignature, tempos.length ? `${tempos.join(", ")} BPM` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setEditing(true)} className="flex items-center gap-1.5 rounded-lg bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-hover">
            <PencilIcon className="h-4 w-4" /> Edit
          </button>
          {(other === "tunes" || canUseLearn) && (
            <button type="button" onClick={() => moveTo(other)} className="rounded-lg bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-hover">
              Move to {LIST_LABEL[other]}
            </button>
          )}
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete tune"
            title="Delete tune"
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface text-muted hover:bg-surface-hover hover:text-danger"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Chord chart */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Chord chart</h2>
          {chart && (
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={previewKey}
                onChange={setPreviewKey}
                options={[{ value: "", label: `Original (${chart.key || "—"})` }, ...KEY_NAMES.map((k) => ({ value: k, label: k }))]}
                className="min-w-32"
              />
              <button type="button" onClick={openInChordCharts} className="rounded-lg bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-hover">
                Open in Chord Charts
              </button>
              <button type="button" onClick={() => setPicking(true)} className="rounded-lg bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-hover">
                Change
              </button>
              <button type="button" onClick={() => patch({ chordChartId: undefined })} className="rounded-lg bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-hover">
                Unlink
              </button>
            </div>
          )}
        </div>
        {tune.chordChartId && (selectedSongLoading || libraryLoading) ? (
          <div className="flex justify-center py-10">
            <LoadingSpinner />
          </div>
        ) : shownChart ? (
          <div className="rounded-2xl bg-surface p-3 sm:p-5">
            <ChordChart song={shownChart} hideHeader />
          </div>
        ) : (
          <div className="flex flex-col gap-3 rounded-2xl bg-surface p-4">
            <p className="text-sm text-muted">
              {tune.chordChartId ? "The linked chart isn't in your chord charts anymore." : "No chord chart linked yet."}
            </p>
            {matches.map((m) => (
              <div key={m.song.id} className="flex items-center gap-3 rounded-xl bg-background p-3">
                <ChordChartIcon className="h-5 w-5 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{m.song.title}</div>
                  <div className="truncate text-xs text-muted">{[m.song.key, m.playlist].filter(Boolean).join(" · ")}</div>
                </div>
                <button
                  type="button"
                  onClick={() => patch({ chordChartId: m.song.id })}
                  className="rounded-full bg-accent px-4 py-1.5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
                >
                  Link it
                </button>
              </div>
            ))}
            <div>
              <button type="button" onClick={() => setPicking(true)} className="flex items-center gap-1.5 rounded-lg bg-background px-3 py-2 text-sm font-medium hover:bg-surface-hover">
                <LinkIcon className="h-4 w-4" /> Link a chart
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Keys */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-bold">Keys I know it in</h2>
          <span className="text-sm tabular-nums text-muted">{knownPcs.size} of 12</span>
        </div>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {KEY_NAMES.map((name, pc) => {
            const known = knownPcs.has(pc);
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggleKey(pc)}
                aria-pressed={known}
                title={known ? "Known — click to unmark" : "Click to mark as known"}
                className={`rounded-xl py-3 text-base font-bold transition-colors ${
                  known ? "bg-accent text-accent-foreground hover:bg-accent-hover" : "bg-surface text-muted hover:bg-surface-hover hover:text-foreground"
                }`}
              >
                {name}
                {suffix}
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted">Jam Practice picks from the keys you mark here.</p>
      </section>

      <TuneRecordings tuneId={tune.id} />

      {/* Notes */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold">Notes</h2>
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            pending.current = e.target.value;
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(flushNotes, NOTES_SAVE_MS);
          }}
          onBlur={flushNotes}
          placeholder="Form, tricky changes, voicings, recordings to check out…"
          rows={6}
          className="w-full resize-y rounded-2xl bg-surface p-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </section>

      {editing && <TuneEditorModal initial={tune} isNew={false} onSave={(t) => { patch(t); setEditing(false); }} onClose={() => setEditing(false)} />}
      {picking && (
        <ChartLinkPicker
          songs={allSongs}
          initialQuery={tune.name}
          onPick={(songId) => {
            patch({ chordChartId: songId });
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete "${tune.name}"?`}
          message={`This removes it from ${LIST_LABEL[list]}. Its chord chart (if any) is kept.`}
          confirmLabel="Delete"
          onConfirm={() => {
            setTunes((prev) => prev.filter((t) => t.id !== tune.id));
            setConfirmDelete(false);
            onDeleted();
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </main>
  );
}
