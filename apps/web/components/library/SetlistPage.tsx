"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@jam-practice/convex/_generated/api";
import ConfirmDialog from "@/components/ConfirmDialog";
import ContextMenu, { type MenuItem, type MenuState } from "@/components/ContextMenu";
import PromptDialog from "@/components/PromptDialog";
import { BackButton, MenuButton, PageShell, menuPosition } from "@/components/library/shared";
import { DraggableList, PlayInfoLine, SetlistTuneDialog, TunePickerModal, playInfo } from "@/components/library/setlistParts";
import { tuneHref, useTuneLists, type TuneListId } from "@/components/library/useTuneActions";
import { ChordChartIcon, DotsVerticalIcon, DragIcon, PlusIcon, ShareIcon, SlidesIcon, UsersIcon } from "@/components/tools";
import { useShareSetlist } from "@/lib/shareSetlist";
import type { Tune } from "@/lib/types";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";
import { useSetlists } from "@/lib/useSetlists";

/**
 * One setlist (`/tunes/setlist?id=`), the web side of the mobile app's setlist screen: its tunes in
 * order, numbered, each opening its tune page; drag a row's grip to reorder, or use its ⋮ (move
 * to top / up / down, key & tempo for this set, open its chart, remove). "View all charts" opens
 * every tune's chart in order, one per page (`/setlist-charts`). The header has + (add tunes) and
 * ⋮ for the setlist: rename, description, share link (anyone with it can open it, no account
 * needed — it always shows the setlist as it is now), post to Community (or view the post, once
 * it's posted), stop sharing, delete.
 */
export default function SetlistPage({ id }: { id: string }) {
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const { setlists, patch, remove } = useSetlists();
  const lists = useTuneLists();
  const { share, unshare } = useShareSetlist();
  const { allSongs } = useChordChartsLibrary(null);
  const chartKeys = useMemo(() => {
    const m = new Map<string, string>();
    for (const song of allSongs) m.set(song.id, song.key);
    return m;
  }, [allSongs]);
  const setlist = setlists.find((s) => s.id === id);
  const postId = useQuery(api.communityTunes.postForSetlist, isAuthenticated && id ? { setlistId: id } : "skip") ?? null;

  const [menu, setMenu] = useState<MenuState | null>(null);
  const [picking, setPicking] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [describing, setDescribing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [settingsFor, setSettingsFor] = useState<Tune | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  if (!setlist) {
    return (
      <PageShell>
        <BackButton href="/tunes" label="Tunes" />
        <p className="py-10 text-center text-sm text-muted">That setlist isn&apos;t here — it may have been deleted.</p>
      </PageShell>
    );
  }

  const found: { tune: Tune; list: TuneListId }[] = [];
  for (const tuneId of setlist.tuneIds) {
    for (const list of ["tunes", "learn"] as TuneListId[]) {
      const tune = lists[list].tunes.find((t) => t.id === tuneId);
      if (tune) {
        found.push({ tune, list });
        break;
      }
    }
  }
  const tunes = found.map((f) => f.tune);
  const info = (tune: Tune) => playInfo(tune, setlist.overrides?.[tune.id], tune.chordChartId ? chartKeys.get(tune.chordChartId) : undefined);

  async function doShare() {
    if (!setlist) return;
    if (!isAuthenticated) {
      setMessage({ text: "Sign in to share a setlist by link.", error: true });
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const { id: shareId, result } = await share(setlist, tunes);
      if (shareId !== setlist.shareId) patch(setlist.id, { shareId });
      if (result === "copied") setMessage({ text: "Link copied — anyone with it can open this setlist." });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Couldn't share that.", error: true });
    } finally {
      setBusy(false);
    }
  }

  function move(from: number, to: number) {
    if (!setlist || to < 0 || to >= setlist.tuneIds.length) return;
    const next = [...setlist.tuneIds];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    patch(setlist.id, { tuneIds: next });
  }

  const post = () => router.push(postId ? `/post/${postId}` : `/community/new?setlist=${encodeURIComponent(setlist.id)}`);

  function openSetlistMenu(e: React.MouseEvent) {
    if (!setlist) return;
    const items: MenuItem[] = [
      { label: "Rename", onSelect: () => setRenaming(true) },
      { label: setlist.description ? "Edit description" : "Add a description", onSelect: () => setDescribing(true) },
      { label: "Share link", onSelect: () => void doShare() },
      { label: postId ? "View post" : "Post to Community", onSelect: post },
    ];
    if (setlist.shareId) {
      const shareId = setlist.shareId;
      items.push({
        label: "Stop sharing link",
        onSelect: () => {
          patch(setlist.id, { shareId: undefined });
          void unshare(shareId);
        },
      });
    }
    items.push({ label: "Delete setlist", danger: true, onSelect: () => setConfirmDelete(true) });
    setMenu({ ...menuPosition(e), items });
  }

  function openTuneMenu(e: React.MouseEvent, i: number) {
    if (!setlist) return;
    const { tune } = found[i];
    const items: MenuItem[] = [];
    if (i > 0) items.push({ label: "Move to top", onSelect: () => move(i, 0) }, { label: "Move up", onSelect: () => move(i, i - 1) });
    if (i < found.length - 1) items.push({ label: "Move down", onSelect: () => move(i, i + 1) });
    items.push({ label: "Key & tempo for this set", onSelect: () => setSettingsFor(tune) });
    if (tune.chordChartId) items.push({ label: "Open chord chart", onSelect: () => router.push(`/chord-charts/view?id=${encodeURIComponent(tune.chordChartId!)}`) });
    items.push({ label: "Remove from setlist", danger: true, onSelect: () => patch(setlist.id, { tuneIds: setlist.tuneIds.filter((x) => x !== tune.id) }) });
    setMenu({ ...menuPosition(e), items });
  }

  const settings = settingsFor ? info(settingsFor) : null;

  return (
    <PageShell>
      <div className="flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <BackButton href="/tunes" label="Tunes" className="mb-2" />
          <h1 className="truncate text-3xl font-extrabold tracking-tight">{setlist.name}</h1>
          <p className="truncate text-sm text-muted">
            Setlist · {tunes.length} tune{tunes.length === 1 ? "" : "s"}
            {setlist.shareId ? " · shared" : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setPicking(true)}
            aria-label="Add tunes"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-foreground hover:bg-accent-hover"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
          <button type="button" onClick={openSetlistMenu} aria-label="Setlist options" className="flex h-11 w-10 items-center justify-center rounded-full hover:bg-surface">
            <DotsVerticalIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {setlist.description && <p className="-mt-2 whitespace-pre-line">{setlist.description}</p>}

      <div className="flex flex-col gap-2">
        {found.length > 0 && (
          <Link href={`/setlist-charts?mine=${encodeURIComponent(setlist.id)}`} className="flex items-center justify-center gap-2 rounded-xl bg-accent py-3 font-bold text-accent-foreground hover:bg-accent-hover">
            <SlidesIcon className="h-5 w-5" />
            View all charts
          </Link>
        )}
        <div className="flex gap-2">
          <button type="button" onClick={() => void doShare()} disabled={busy} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-surface py-2.5 text-sm font-semibold hover:bg-surface-hover disabled:opacity-50">
            <ShareIcon className="h-4 w-4" />
            {busy ? "Sharing…" : "Share link"}
          </button>
          <button type="button" onClick={post} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-surface py-2.5 text-sm font-semibold hover:bg-surface-hover">
            <UsersIcon className="h-4 w-4" />
            {postId ? "View post" : "Post to Community"}
          </button>
        </div>
        {message && <p className={`text-sm ${message.error ? "text-danger" : "text-muted"}`}>{message.text}</p>}
      </div>

      {found.length === 0 ? (
        <button type="button" onClick={() => setPicking(true)} className="flex flex-col items-center gap-2 rounded-2xl bg-surface p-6 text-sm text-muted hover:bg-surface-hover">
          <PlusIcon className="h-6 w-6 text-accent" />
          No tunes yet — add some from your lists.
        </button>
      ) : (
        <>
          <div className="overflow-hidden rounded-2xl bg-surface">
            <DraggableList
              keys={found.map((f) => f.tune.id)}
              onReorder={(order) => patch(setlist.id, { tuneIds: [...order, ...setlist.tuneIds.filter((x) => !order.includes(x))] })}
              renderRow={(key, i, handle, dragging) => {
                const { tune, list } = found.find((f) => f.tune.id === key)!;
                return (
                  <div className={`group flex items-center border-t border-background ${dragging ? "bg-surface-hover" : "bg-surface hover:bg-surface-hover"}`}>
                    {handle(
                      <span aria-label={`Drag to reorder ${tune.name}`} className="flex h-14 w-10 items-center justify-center text-muted">
                        <DragIcon className="h-5 w-5" />
                      </span>,
                    )}
                    <Link href={tuneHref(list, tune.id)} className="flex min-w-0 flex-1 items-center gap-3 py-2">
                      <span className="w-5 text-right font-bold tabular-nums text-accent">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate font-semibold">{tune.name}</span>
                          {tune.chordChartId && <ChordChartIcon className="h-4 w-4 shrink-0 text-accent" />}
                        </span>
                        <PlayInfoLine info={info(tune)} timeSignature={tune.timeSignature} />
                      </span>
                    </Link>
                    <div className="pr-2">
                      <MenuButton label={`Options for ${tune.name}`} onClick={(e) => openTuneMenu(e, i)} alwaysVisible />
                    </div>
                  </div>
                );
              }}
            />
          </div>
          <button type="button" onClick={() => setPicking(true)} className="-mt-3 flex items-center justify-center gap-1.5 rounded-xl bg-surface py-2.5 text-sm font-semibold hover:bg-surface-hover">
            <PlusIcon className="h-4 w-4" />
            Add tunes
          </button>
        </>
      )}

      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
      {picking && <TunePickerModal exclude={setlist.tuneIds} onAdd={(ids) => patch(setlist.id, { tuneIds: [...setlist.tuneIds, ...ids] })} onClose={() => setPicking(false)} />}
      {settingsFor && settings && (
        <SetlistTuneDialog
          tuneName={settingsFor.name}
          minor={settings.minor}
          defaultKey={settings.defaultKey}
          defaultTempo={settings.defaultTempo}
          value={setlist.overrides?.[settingsFor.id]}
          onSave={(next) => {
            const overrides = { ...(setlist.overrides ?? {}) };
            if (next) overrides[settingsFor.id] = next;
            else delete overrides[settingsFor.id];
            patch(setlist.id, { overrides });
          }}
          onClose={() => setSettingsFor(null)}
        />
      )}
      {renaming && (
        <PromptDialog
          title="Rename setlist"
          initialValue={setlist.name}
          onSubmit={(name) => {
            patch(setlist.id, { name });
            setRenaming(false);
          }}
          onCancel={() => setRenaming(false)}
        />
      )}
      {describing && (
        <PromptDialog
          title="Description"
          initialValue={setlist.description}
          placeholder="e.g. Friday at the Blue Room, 2 sets"
          allowEmpty
          onSubmit={(description) => {
            patch(setlist.id, { description });
            setDescribing(false);
          }}
          onCancel={() => setDescribing(false)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete "${setlist.name}"?`}
          message={`The setlist goes away; its tunes stay in your lists.${setlist.shareId ? " Its shared link stops working." : ""}`}
          confirmLabel="Delete"
          onConfirm={() => {
            if (setlist.shareId) void unshare(setlist.shareId);
            remove(setlist.id);
            router.push("/tunes");
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </PageShell>
  );
}
