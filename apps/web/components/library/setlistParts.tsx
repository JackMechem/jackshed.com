"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { TUNE_LIST_LABEL, useTuneLists, type TuneListId } from "@/components/library/useTuneActions";
import { tuneSummary } from "@/components/library/shared";
import { CheckIcon, SearchIcon, SetlistIcon } from "@/components/tools";
import { KEY_NAMES } from "@/lib/iRealPro";
import type { Tune } from "@/lib/types";
import type { Setlist, SetlistOverride } from "@/lib/useSetlists";
import { displayKey, isMinorKey, setlistKey } from "@jam-practice/core/setlistKeys";
import { sortByText } from "@jam-practice/core/sortText";

/** Pieces of the setlist pages (`SetlistsPage`, `SetlistPage`), the web side of the mobile app's
    `app/library/setlist*.tsx` and `components/library/*`. */

export function setlistHref(id: string) {
  return `/tunes/setlist?id=${encodeURIComponent(id)}`;
}

/** One setlist in a list — name, tune count, shared — opening its page. */
export function SetlistRow({ setlist }: { setlist: Setlist }) {
  const n = setlist.tuneIds.length;
  return (
    <Link href={setlistHref(setlist.id)} className="flex items-center gap-3 rounded-xl bg-surface px-4 py-3 transition-colors hover:bg-surface-hover">
      <SetlistIcon className="h-5 w-5 shrink-0 text-accent" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold">{setlist.name}</span>
        <span className="block truncate text-xs text-muted">
          {n} tune{n === 1 ? "" : "s"}
          {setlist.shareId ? " · shared" : ""}
        </span>
      </span>
      <span className="text-muted">›</span>
    </Link>
  );
}

/** A tune's key and tempo *in a setlist*: the setlist's own choice if it made one, otherwise the
    chart's key (else the tune's first key) and the tune's first tempo. */
export function playInfo(tune: Tune, override: SetlistOverride | undefined, chartKey: string | undefined) {
  const tuneKeys = tune.keys.filter((k) => k.enabled).map((k) => k.value);
  const base = chartKey || tuneKeys[0] || null;
  const defaultTempo = tune.tempos.find((t) => t.enabled)?.value ?? null;
  return {
    key: setlistKey({ overrideRoot: override?.key, chartKey, tuneKeys }),
    defaultKey: base ? displayKey(base) : null,
    minor: base ? isMinorKey(base) : false,
    keyChanged: !!override?.key,
    tempo: override?.tempo ?? defaultTempo,
    defaultTempo,
    tempoChanged: override?.tempo != null,
  };
}

/** "Em · 140 BPM · 4/4" — the key/tempo in accent when the setlist changed them. */
export function PlayInfoLine({ info, timeSignature }: { info: ReturnType<typeof playInfo>; timeSignature: string }) {
  const parts: { text: string; changed: boolean }[] = [];
  if (info.key) parts.push({ text: info.key, changed: info.keyChanged });
  if (info.tempo != null) parts.push({ text: `${info.tempo} BPM`, changed: info.tempoChanged });
  if (timeSignature) parts.push({ text: timeSignature, changed: false });
  return (
    <span className="block truncate text-sm text-muted">
      {parts.map((p, i) => (
        <span key={i} className={p.changed ? "font-bold text-accent" : undefined}>
          {i ? " · " : ""}
          {p.text}
        </span>
      ))}
    </span>
  );
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

/** Pick several of your tunes at once (from both lists) — adding tunes to a setlist or a post.
    Tunes already in it (`exclude`) aren't offered again. */
export function TunePickerModal({ exclude, onAdd, onClose }: { exclude: string[]; onAdd: (tuneIds: string[]) => void; onClose: () => void }) {
  const lists = useTuneLists();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  useEscape(onClose);

  const rows = useMemo(() => {
    const skip = new Set(exclude);
    const all: { tune: Tune; list: TuneListId }[] = [];
    for (const list of ["tunes", "learn"] as TuneListId[]) for (const tune of lists[list].tunes) if (!skip.has(tune.id)) all.push({ tune, list });
    const q = query.trim().toLowerCase();
    return sortByText(q ? all.filter((r) => r.tune.name.toLowerCase().includes(q)) : all, (r) => r.tune.name);
  }, [lists, exclude, query]);

  const toggle = (id: string) => setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 pt-[8vh]" onClick={onClose}>
      <div role="dialog" aria-label="Add tunes" className="flex max-h-[80vh] w-full max-w-lg flex-col gap-3 rounded-2xl bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-lg font-bold">Add tunes</h2>
          <button type="button" onClick={onClose} className="rounded-full px-3 py-1.5 text-sm text-muted hover:bg-background hover:text-foreground">
            Cancel
          </button>
          <button
            type="button"
            disabled={picked.length === 0}
            onClick={() => {
              onAdd(picked);
              onClose();
            }}
            className="rounded-full bg-accent px-4 py-1.5 text-sm font-bold text-accent-foreground hover:bg-accent-hover disabled:opacity-40"
          >
            {picked.length ? `Add ${picked.length}` : "Add"}
          </button>
        </div>
        <label className="flex items-center gap-2 rounded-xl bg-background px-3 py-2">
          <SearchIcon className="h-4 w-4 text-muted" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your tunes…" className="min-w-0 flex-1 bg-transparent outline-none" />
        </label>
        <ul className="flex flex-col gap-0.5 overflow-y-auto">
          {rows.length === 0 ? (
            <li className="p-3 text-sm text-muted">{query.trim() ? `No tunes match “${query}”.` : "Every one of your tunes is already in here."}</li>
          ) : (
            rows.slice(0, 300).map(({ tune, list }) => {
              const on = picked.includes(tune.id);
              return (
                <li key={tune.id}>
                  <button type="button" onClick={() => toggle(tune.id)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-background">
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${on ? "bg-accent text-accent-foreground" : "border-2 border-muted"}`}>
                      {on && <CheckIcon className="h-3.5 w-3.5" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{tune.name}</span>
                      <span className="block truncate text-xs text-muted">{[TUNE_LIST_LABEL[list], tuneSummary(tune)].filter(Boolean).join(" · ")}</span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}

const MIN_BPM = 30;
const MAX_BPM = 400;

/** Key and tempo for one tune *in one setlist* — the 12 keys (plus "Default", the chart's/tune's
    own key) and a tempo stepper (plus "Default"). Saving never changes the tune itself. */
export function SetlistTuneDialog({
  tuneName,
  minor,
  defaultKey,
  defaultTempo,
  value,
  onSave,
  onClose,
}: {
  tuneName: string;
  minor: boolean;
  defaultKey: string | null;
  defaultTempo: number | null;
  value: SetlistOverride | undefined;
  onSave: (next: SetlistOverride | null) => void;
  onClose: () => void;
}) {
  const [key, setKey] = useState<string | undefined>(value?.key);
  const [tempo, setTempo] = useState<number | undefined>(value?.tempo);
  useEscape(onClose);
  const shownTempo = tempo ?? defaultTempo ?? 120;
  const bump = (d: number) => setTempo(Math.max(MIN_BPM, Math.min(MAX_BPM, shownTempo + d)));

  function save() {
    const next: SetlistOverride = {};
    if (key) next.key = key;
    if (tempo != null && tempo !== defaultTempo) next.tempo = tempo;
    onSave(Object.keys(next).length ? next : null);
    onClose();
  }

  const pill = (selected: boolean) => `rounded-xl py-2 text-sm font-semibold ${selected ? "bg-accent text-accent-foreground" : "bg-background hover:bg-surface-hover"}`;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 pt-[8vh]" onClick={onClose}>
      <div role="dialog" aria-label={`Key and tempo for ${tuneName}`} className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-bold">{tuneName}</h2>
            <p className="text-xs text-muted">Key and tempo in this setlist only — the tune itself doesn&apos;t change.</p>
          </div>
          <button type="button" onClick={save} className="rounded-full bg-accent px-4 py-1.5 text-sm font-bold text-accent-foreground hover:bg-accent-hover">
            Done
          </button>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-muted">Key</span>
          <button type="button" onClick={() => setKey(undefined)} className={pill(!key)}>
            Default{defaultKey ? ` (${defaultKey})` : ""}
          </button>
          <div className="grid grid-cols-4 gap-2">
            {KEY_NAMES.map((k) => (
              <button key={k} type="button" onClick={() => setKey(k)} className={pill(key === k)}>
                {k}
                {minor ? "m" : ""}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-muted">Tempo</span>
          <div className="flex items-center gap-2">
            {[-5, -1].map((d) => (
              <button key={d} type="button" onClick={() => bump(d)} className="h-11 w-11 rounded-xl bg-background font-bold hover:bg-surface-hover">
                {d}
              </button>
            ))}
            <div className="flex flex-1 flex-col items-center">
              <span className={`text-3xl font-extrabold tabular-nums ${tempo != null ? "text-accent" : ""}`}>{shownTempo}</span>
              <span className="text-xs text-muted">BPM</span>
            </div>
            {[1, 5].map((d) => (
              <button key={d} type="button" onClick={() => bump(d)} className="h-11 w-11 rounded-xl bg-background font-bold hover:bg-surface-hover">
                +{d}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setTempo(undefined)} className={pill(tempo == null)}>
            Default{defaultTempo ? ` (${defaultTempo} BPM)` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * A vertical list whose rows can be dragged to a new position by their grip (`handle`) — mouse,
 * touch or pen alike (Pointer Events + pointer capture, the same approach as the Metronome's
 * structure form chips). Rows are measured once when a drag starts; crossing into another row's
 * slot reorders live. `onReorder` gets the new order of `keys` when the drag ends.
 */
export function DraggableList({
  keys,
  renderRow,
  onReorder,
}: {
  keys: string[];
  renderRow: (key: string, index: number, handle: (node: ReactNode) => ReactNode, dragging: boolean) => ReactNode;
  onReorder: (order: string[]) => void;
}) {
  const [order, setOrder] = useState<string[] | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const drag = useRef<{ key: string; startY: number; slots: { top: number; height: number }[] } | null>(null);
  const shown = order ?? keys;

  function start(e: React.PointerEvent, key: string) {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      key,
      startY: e.clientY,
      slots: keys.map((k) => {
        const r = rowRefs.current.get(k)!.getBoundingClientRect();
        return { top: r.top, height: r.height };
      }),
    };
    setOrder(keys);
    setDragKey(key);
    setOffset(0);
  }

  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || !order) return;
    const dy = e.clientY - d.startY;
    const origin = d.slots[keys.indexOf(d.key)];
    // Where the dragged row's centre is now, and which slot that falls in.
    const centre = origin.top + origin.height / 2 + dy;
    let to = d.slots.findIndex((s) => centre < s.top + s.height);
    if (to === -1) to = d.slots.length - 1;
    const from = order.indexOf(d.key);
    let next = order;
    if (to !== from) {
      next = [...order];
      next.splice(from, 1);
      next.splice(to, 0, d.key);
      setOrder(next);
    }
    // Keep the row under the pointer, relative to the slot it's rendered in now.
    setOffset(origin.top + dy - d.slots[to].top);
  }

  function end() {
    if (order && drag.current && order.join("|") !== keys.join("|")) onReorder(order);
    drag.current = null;
    setOrder(null);
    setDragKey(null);
    setOffset(0);
  }

  return (
    <div>
      {shown.map((key, i) => {
        const dragging = key === dragKey;
        return (
          <div
            key={key}
            ref={(el) => {
              if (el) rowRefs.current.set(key, el);
              else rowRefs.current.delete(key);
            }}
            style={dragging ? { transform: `translateY(${offset}px)`, position: "relative", zIndex: 10 } : undefined}
            className={dragging ? "shadow-lg" : undefined}
          >
            {renderRow(
              key,
              i,
              (node) => (
                <div
                  onPointerDown={(e) => start(e, key)}
                  onPointerMove={move}
                  onPointerUp={end}
                  onPointerCancel={end}
                  className="cursor-grab touch-none active:cursor-grabbing"
                >
                  {node}
                </div>
              ),
              dragging,
            )}
          </div>
        );
      })}
    </div>
  );
}
