"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import ContextMenu, { type MenuItem, type MenuState } from "@/components/ContextMenu";
import ChartLinkPicker from "@/components/library/ChartLinkPicker";
import { menuPosition } from "@/components/library/shared";
import TuneEditorModal from "@/components/TuneEditorModal";
import { useRecentTunes } from "@/lib/recents";
import type { Tune } from "@/lib/types";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";
import { useSyncedTunes } from "@/lib/useSyncedTunes";
import { useTunesToLearn } from "@/lib/useTunesToLearn";

export type TuneListId = "tunes" | "learn";
export const TUNE_LIST_LABEL: Record<TuneListId, string> = { tunes: "Tunes I Know", learn: "Tunes to Learn" };

export function tuneHref(list: TuneListId, id: string) {
  return `/tunes/tune?list=${list}&id=${encodeURIComponent(id)}`;
}

/** Both tune lists (both hooks always run), for pages that work with either or move between them. */
export function useTuneLists() {
  const [tunes, setTunes] = useSyncedTunes();
  const [learn, setLearn] = useTunesToLearn();
  return { tunes: { tunes, setTunes }, learn: { tunes: learn, setTunes: setLearn } } as const;
}

/**
 * The ⋮ menu for a tune, shared by the Tunes pages: Open / Edit tune / open, link, change or
 * unlink its chord chart / move between Tunes I Know and Tunes to Learn / Delete. Returns the
 * opener plus `element` (menu, editor, chart picker, delete confirmation) to render once.
 */
export function useTuneActions() {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const lists = useTuneLists();
  const { allSongs } = useChordChartsLibrary(null);
  const recents = useRecentTunes();
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [editing, setEditing] = useState<{ list: TuneListId; tune: Tune } | null>(null);
  const [picking, setPicking] = useState<{ list: TuneListId; tune: Tune } | null>(null);
  const [deleting, setDeleting] = useState<{ list: TuneListId; tune: Tune } | null>(null);

  function patch(list: TuneListId, id: string, update: Partial<Tune>) {
    lists[list].setTunes((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const next = { ...t, ...update };
        if (next.chordChartId === undefined) delete next.chordChartId;
        return next;
      }),
    );
  }

  function openTuneMenu(e: React.MouseEvent, list: TuneListId, tune: Tune) {
    const other: TuneListId = list === "tunes" ? "learn" : "tunes";
    const items: MenuItem[] = [
      { label: "Open", onSelect: () => router.push(tuneHref(list, tune.id)) },
      { label: "Edit tune", onSelect: () => setEditing({ list, tune }) },
    ];
    if (tune.chordChartId) {
      const chartId = tune.chordChartId;
      items.push(
        { label: "Open chord chart", onSelect: () => router.push(`/chord-charts/view?id=${encodeURIComponent(chartId)}`) },
        { label: "Change linked chart", onSelect: () => setPicking({ list, tune }) },
        { label: "Unlink chord chart", onSelect: () => patch(list, tune.id, { chordChartId: undefined }) },
      );
    } else {
      items.push({ label: "Link a chord chart", onSelect: () => setPicking({ list, tune }) });
    }
    // Tunes to Learn only exists in your account — signed out, moving a tune there would lose it.
    if (other === "tunes" || isAuthenticated) {
      items.push({
        label: `Move to ${TUNE_LIST_LABEL[other]}`,
        onSelect: () => {
          lists[list].setTunes((prev) => prev.filter((t) => t.id !== tune.id));
          lists[other].setTunes((prev) => [...prev, tune]);
        },
      });
    }
    items.push({ label: "Delete tune", danger: true, onSelect: () => setDeleting({ list, tune }) });
    setMenu({ ...menuPosition(e), items });
  }

  const element = (
    <>
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {editing && (
        <TuneEditorModal
          initial={editing.tune}
          isNew={false}
          onSave={(t) => {
            patch(editing.list, editing.tune.id, t);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {picking && (
        <ChartLinkPicker
          songs={allSongs}
          initialQuery={picking.tune.name}
          onPick={(songId) => {
            patch(picking.list, picking.tune.id, { chordChartId: songId });
            setPicking(null);
          }}
          onClose={() => setPicking(null)}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title={`Delete "${deleting.tune.name}"?`}
          message={`This removes it from ${TUNE_LIST_LABEL[deleting.list]}. Its chord chart (if any) is kept.`}
          confirmLabel="Delete"
          onConfirm={() => {
            lists[deleting.list].setTunes((prev) => prev.filter((t) => t.id !== deleting.tune.id));
            recents.forget(deleting.tune.id);
            setDeleting(null);
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </>
  );

  return { openTuneMenu, element };
}
