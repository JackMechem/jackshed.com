"use client";

import Link from "next/link";

import { ReactNode, useMemo, useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import StandardsPicker from "@/components/StandardsPicker";
import TuneEditorModal from "@/components/TuneEditorModal";
import { CheckIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon } from "@/components/tools";
import { csvToTunes, downloadTunesCsv } from "@/lib/csv";
import { DEFAULT_TIME_SIGNATURE, Tune, makeId } from "@/lib/types";

function blankTune(name = ""): Tune {
  return {
    id: makeId(),
    name,
    tempos: [],
    keys: [],
    timeSignature: DEFAULT_TIME_SIGNATURE,
    notes: "",
  };
}

function summary(tune: Tune): string {
  const keys = tune.keys.filter((k) => k.enabled).map((k) => k.value);
  const tempos = tune.tempos.filter((t) => t.enabled).map((t) => t.value);
  return [
    keys.length ? keys.join(", ") : "no keys",
    tempos.length ? `${tempos.join(", ")} BPM` : "no tempos",
    tune.timeSignature,
  ].join(" · ");
}

type Editing = { tune: Tune; isNew: boolean };

/** The shared search + multi-select + edit/delete + bulk-actions layout behind both of the account
    page's tune tabs (`TunesTab.tsx`/`TunesToLearnTab.tsx`) — one UI, two mounts, so the two lists
    stay visually and behaviorally identical rather than drifting apart, per a direct request to
    put "this UI" (the Tunes tab's layout) on Tunes to Learn too. The search box only ever filters
    `tunes` — it never also searches the jazz standards library, unlike an earlier version of the
    Tunes tab, which showed matching standards inline under the search results; per a direct
    follow-up request that was confusing (searching *your* tunes surfacing *someone else's* library
    in the same box), so adding a standard is a separate, explicit action instead: `allowStandards`
    makes the header's `+` open `StandardsPicker` — the exact same search-and-add-or-create-custom
    modal Jam Practice's own `TunesPanel` uses, styled as the exact same small round icon button,
    per a direct request to match it — instead of jumping straight to a blank tune editor. Both
    tabs turn this on now (per a follow-up request specifically asking for it on Tunes to Learn too
    — there's a real use for it there: bookmarking a standard you don't know yet without first
    adding it to your own Tunes list): `StandardsPicker` takes `tunes`/`setTunes` as props (falling
    back to Jam Practice's own tune list only when a caller omits them — see that component's own
    comment), and this always passes its *own* `tunes`/`setTunes` straight through, so a standard
    picked from here lands in whichever list this particular mount is managing — the Tunes tab's
    own list, or the separate Tunes to Learn list — never always Jam Practice's. */
export default function TuneListManager({
  title,
  icon: Icon,
  tunes,
  setTunes,
  allowStandards,
  searchPlaceholder,
  emptyMessage,
  exportFilenamePrefix,
  infoBlurb,
  listId,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tunes: Tune[];
  setTunes: (update: Tune[] | ((prev: Tune[]) => Tune[])) => void;
  allowStandards: boolean;
  searchPlaceholder: string;
  emptyMessage: string;
  exportFilenamePrefix: string;
  infoBlurb?: ReactNode;
  /** Which list this is — each tune's name then links to its own page (`/tune`). */
  listId?: "tunes" | "learn";
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Editing | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const trimmedQuery = query.trim();
  const shown = useMemo(() => {
    const words = trimmedQuery.toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return tunes;
    return tunes.filter((t) => {
      const haystack = `${t.name} ${summary(t)}`.toLowerCase();
      return words.every((w) => haystack.includes(w));
    });
  }, [tunes, trimmedQuery]);

  const existingIds = new Set(tunes.map((t) => t.id));
  const chosen = tunes.filter((t) => selected.has(t.id) && existingIds.has(t.id));
  const allShownSelected = shown.length > 0 && shown.every((t) => selected.has(t.id));

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function toggleAllShown() {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const t of shown) {
        if (allShownSelected) next.delete(t.id);
        else next.add(t.id);
      }
      return next;
    });
  }

  function saveTune(tune: Tune) {
    setTunes((prev) =>
      prev.some((t) => t.id === tune.id)
        ? prev.map((t) => (t.id === tune.id ? tune : t))
        : [...prev, tune],
    );
    setEditing(null);
  }

  function deleteTune(id: string) {
    setTunes((prev) => prev.filter((t) => t.id !== id));
    setSelected((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function deleteSelected() {
    const ids = new Set(chosen.map((t) => t.id));
    setTunes((prev) => prev.filter((t) => !ids.has(t.id)));
    setSelected(new Set());
    setConfirmingDelete(false);
  }

  function importCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const imported = csvToTunes(String(reader.result ?? ""));
      setTunes((prev) => [...prev, ...imported]);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <>
      <section className="flex flex-col gap-4 rounded-2xl bg-surface p-5 text-left">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Icon className="h-5 w-5 text-muted" />
            {title}
            {tunes.length ? ` (${tunes.length})` : ""}
          </h2>
          <button
            type="button"
            onClick={() =>
              allowStandards ? setPickerOpen(true) : setEditing({ tune: blankTune(), isNew: true })
            }
            aria-label={allowStandards ? "Add tune" : "New tune"}
            title={allowStandards ? "Add tune" : "New tune"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground hover:bg-accent-hover"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        </div>

        {infoBlurb && <p className="text-xs text-muted">{infoBlurb}</p>}

        <div className="flex items-center gap-3 rounded-xl bg-background px-3 py-2">
          <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
          />
        </div>

        {tunes.length === 0 ? (
          <p className="text-sm text-muted">{emptyMessage}</p>
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted">No tunes match “{trimmedQuery}”.</p>
        ) : (
          <ul className="flex max-h-[32rem] flex-col gap-1.5 overflow-y-auto pr-1">
            {shown.map((tune) => {
              const isSelected = selected.has(tune.id);
              return (
                <li
                  key={tune.id}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                    isSelected ? "bg-background" : "hover:bg-background/60"
                  }`}
                >
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    aria-label={`Select ${tune.name}`}
                    onClick={() => toggleSelected(tune.id)}
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                      isSelected
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-muted/50 text-transparent hover:border-muted"
                    }`}
                  >
                    <CheckIcon className="h-3.5 w-3.5" />
                  </button>
                  {listId ? (
                    <Link href={`/tunes/tune?list=${listId}&id=${encodeURIComponent(tune.id)}`} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-sm font-medium hover:text-accent">{tune.name}</div>
                      <div className="truncate text-xs text-muted">{summary(tune)}</div>
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleSelected(tune.id)}
                      className="min-w-0 flex-1 text-left"
                      tabIndex={-1}
                    >
                      <div className="truncate text-sm font-medium">{tune.name}</div>
                      <div className="truncate text-xs text-muted">{summary(tune)}</div>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditing({ tune, isNew: false })}
                    aria-label={`Edit ${tune.name}`}
                    title="Edit"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteTune(tune.id)}
                    aria-label={`Delete ${tune.name}`}
                    title="Delete"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-danger"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-background pt-3 text-sm">
          <button
            type="button"
            onClick={toggleAllShown}
            disabled={shown.length === 0}
            className="rounded-lg px-2 py-1.5 font-medium text-muted hover:text-foreground disabled:opacity-50"
          >
            {allShownSelected ? "Deselect all" : "Select all"}
          </button>
          <span className="text-muted">{chosen.length} selected</span>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() =>
                downloadTunesCsv(
                  chosen.length > 0 ? chosen : tunes,
                  `${exportFilenamePrefix}${chosen.length > 0 ? "-selected" : ""}.csv`,
                )
              }
              disabled={tunes.length === 0}
              className="rounded-lg bg-background px-3 py-1.5 font-medium hover:bg-surface-hover disabled:opacity-50"
            >
              {chosen.length > 0 ? `Export ${chosen.length}` : "Export all"}
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="rounded-lg bg-background px-3 py-1.5 font-medium hover:bg-surface-hover"
            >
              Import CSV
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              disabled={chosen.length === 0}
              className="rounded-lg bg-background px-3 py-1.5 font-medium text-danger hover:bg-surface-hover disabled:opacity-50"
            >
              Delete selected
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={importCsv}
            className="hidden"
          />
        </div>
      </section>

      {confirmingDelete && (
        <ConfirmDialog
          title={`Delete ${chosen.length} tune${chosen.length === 1 ? "" : "s"}?`}
          message="The selected tunes will be removed from this list. This can't be undone — export first if you want a backup."
          confirmLabel="Delete"
          onConfirm={deleteSelected}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}

      {allowStandards && pickerOpen && (
        <StandardsPicker
          tunes={tunes}
          setTunes={setTunes}
          onClose={() => setPickerOpen(false)}
          onCreateCustom={(name) => {
            setPickerOpen(false);
            setEditing({ tune: blankTune(name), isNew: true });
          }}
        />
      )}

      {editing && (
        <TuneEditorModal
          key={editing.tune.id}
          initial={editing.tune}
          isNew={editing.isNew}
          onSave={saveTune}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}
