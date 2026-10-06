"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import ChordChart from "@/components/ChordChart";
import ChordChartEditor from "@/components/ChordChartEditor";
import CollapsiblePanel from "@/components/CollapsiblePanel";
import ConfirmDialog from "@/components/ConfirmDialog";
import Hint from "@/components/Hint";
import LoadingSpinner from "@/components/LoadingSpinner";
import Select from "@/components/Select";
import ToolLayout from "@/components/ToolLayout";
import {
  BookIcon,
  ListIcon,
  MaximizeIcon,
  MinimizeIcon,
  PencilIcon,
  SearchIcon,
  SlidersIcon,
  TrashIcon,
} from "@/components/tools";
import { formatComposer, keyPitchClass, KEY_NAMES, parseIrealPlaylist, transposeSong } from "@/lib/iRealPro";
import { decodeChartString, looksLikeChartString } from "@/lib/chartString";
import { UNSORTED_PLAYLIST_ID } from "@/lib/chordChartsLibrary";
import {
  useChordChartsLibrary,
  type LibraryPlaylist,
  type LibrarySongMeta,
} from "@/lib/useChordChartsLibrary";
import { usePersistedSettings } from "@/lib/usePersistedSettings";

const VIEW_KEY = "jam-practice-chord-charts-view";
const VIEW_DEFAULTS = { selectedId: "", barsPerRow: 4 };

const BARS_PER_ROW_OPTIONS = [2, 3, 4, 6, 8];

// `useSyncExternalStore`'s own recommended "is this the client yet" trick (an unchanging store
// that's "false" on the server and "true" on the client) — the same mechanism
// `lib/usePersistedSettings.ts` already relies on for hydration safety, just applied directly
// here rather than through a localStorage-backed store. Deliberately not a plain
// `useState(false)` + `useEffect(() => setTrue(), [])`, which the React Compiler's lint flags
// (`react-hooks/set-state-in-effect`) as exactly the cascading-render anti-pattern this sidesteps.
function NOOP_SUBSCRIBE() {
  return () => {};
}

/** What "Import a playlist" actually reads: a sheddex chart link (`lib/chartString.ts`) first,
    falling back to a real iReal Pro playlist link (`parseIrealPlaylist`) if it isn't one of
    those — quietly still supported, since a real iReal link is still perfectly good input, but
    deliberately never named anywhere in this panel's own copy (placeholder, hint text, or this
    error message) the way it used to be. Whichever parser actually recognized the input wins; if
    neither does, the error stays generic rather than leaking iReal Pro's own "should contain
    irealb://" message, which would otherwise be the one clue this fallback exists at all. */
function parsePlaylistInput(text: string) {
  if (looksLikeChartString(text)) return decodeChartString(text);
  try {
    return parseIrealPlaylist(text);
  } catch {
    throw new Error("Couldn't read that — paste a sheddex chord chart link.");
  }
}

export default function ChordCharts() {
  // barsPerRow/selectedId are a device-local display preference, not meaningfully "saved data" to
  // follow across devices, so they stay on plain usePersistedSettings regardless of sign-in state
  // — the actual library (what songs/playlists exist) is owned by useChordChartsLibrary below,
  // which handles the signed-out-vs-signed-in split (and, signed in, a size limit that blob-based
  // sync couldn't handle — see that hook's own comment) on its own.
  const [{ selectedId, barsPerRow }, updateView] = usePersistedSettings(
    VIEW_KEY,
    VIEW_DEFAULTS,
  );
  const {
    playlists: unsortedPlaylists,
    totalSongs,
    loading: libraryLoading,
    selectedSong: selected,
    selectedSongLoading,
    importSongs,
    deleteSong: removeSong,
    clearAll,
  } = useChordChartsLibrary(selectedId || null);

  // The key to transpose the currently-viewed chart *to* — "" means "leave it in its own key". A
  // per-viewing display transform, not saved data (same "bars per row" category, but ephemeral
  // rather than persisted: it resets whenever a different tune is selected, rather than silently
  // carrying over and surprising you on the next chart). Reset here during render rather than in a
  // `useEffect` — the pattern React's own docs recommend for "adjust state when a prop changes" —
  // so there's no extra render/flash and no `react-hooks/set-state-in-effect` lint issue to work
  // around (see AccountMenu.tsx's own note on hitting that rule the effect-based way).
  const [transposeKey, setTransposeKey] = useState("");
  const [lastSelectedId, setLastSelectedId] = useState(selectedId);
  if (selectedId !== lastSelectedId) {
    setLastSelectedId(selectedId);
    setTransposeKey("");
  }

  const [linkText, setLinkText] = useState("");
  const [status, setStatus] = useState<{
    kind: "ok" | "error";
    message: string;
  } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // `totalSongs` can legitimately differ between the server-rendered markup and this device's
  // actual first client render (signed-out: localStorage; signed-in: a Convex query that hasn't
  // resolved yet on the server) — gating every `totalSongs === 0` check behind "has this component
  // actually mounted on the client yet" guarantees the very first client render matches the server
  // (both treat the library as empty) regardless of which path caused the mismatch, with the real
  // value taking over immediately after that first paint.
  const mounted = useSyncExternalStore(
    NOOP_SUBSCRIBE,
    () => true,
    () => false,
  );
  const shownTotalSongs = mounted ? totalSongs : 0;

  // Escape exits the maximized (full-screen) chart, same as every other dismissable overlay in
  // this app.
  useEffect(() => {
    if (!maximized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMaximized(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [maximized]);
  // Explicit expand/collapse overrides, keyed by playlist id — a playlist with no override shown
  // expanded if it happens to contain the currently selected song (see `PlaylistSection` below),
  // so picking a tune from search always reveals where it lives without a separate "reveal" action.
  const [expandOverrides, setExpandOverrides] = useState<Record<string, boolean>>({});

  const sorted = useMemo(
    () =>
      unsortedPlaylists
        .flatMap((p) => p.songs)
        .sort((a, b) => a.title.localeCompare(b.title)),
    [unsortedPlaylists],
  );
  // "Unsorted" (songs saved before playlists existed, or otherwise orphaned) always sorts last —
  // everything else alphabetically, same as the flat list used to be ordered.
  const playlists = useMemo(() => {
    const real = unsortedPlaylists
      .filter((p) => p.id !== UNSORTED_PLAYLIST_ID)
      .sort((a, b) => a.name.localeCompare(b.name));
    const unsorted = unsortedPlaylists.filter((p) => p.id === UNSORTED_PLAYLIST_ID);
    return [...real, ...unsorted];
  }, [unsortedPlaylists]);

  // The chosen key's distance in semitones from the chart's own key — `transposeSong` itself
  // wraps at the octave, so this only ever needs to land somewhere in 0-11, never negative.
  const transposeSemitones =
    selected && transposeKey
      ? (KEY_NAMES.indexOf(transposeKey) - keyPitchClass(selected.key) + 12) % 12
      : 0;
  const displayed = useMemo(
    () => (selected && transposeSemitones !== 0 ? transposeSong(selected, transposeSemitones) : selected),
    [selected, transposeSemitones],
  );

  async function importText(text: string) {
    let playlist;
    try {
      playlist = parsePlaylistInput(text);
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Couldn't read that.",
      });
      return;
    }
    try {
      const { added, skipped } = await importSongs(playlist.songs, playlist.name);
      setStatus({
        kind: "ok",
        message:
          `Imported ${added} song${added === 1 ? "" : "s"} into "${playlist.name}".` +
          (skipped > 0 ? ` (${skipped} already in your library.)` : ""),
      });
      setLinkText("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      setStatus({
        kind: "error",
        message: e instanceof Error ? e.message : "Couldn't import that playlist.",
      });
    }
  }

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") void importText(reader.result);
    };
    reader.onerror = () =>
      setStatus({ kind: "error", message: "Couldn't read that file." });
    reader.readAsText(file);
  }

  async function deleteSong(id: string) {
    await removeSong(id);
    if (selectedId === id) updateView({ selectedId: "" });
  }

  // The chart builder takes over this page's entire content area while open — not a popup over
  // it — per a direct request ("should not be a popup, it should take up the entire chord charts
  // view"); the normal Tunes/Import/Create/Display + chart view below is simply not rendered at
  // all while `showEditor` is true, rather than sitting hidden underneath it.
  if (showEditor) {
    return (
      <ToolLayout title="Chord Charts" layout="stacked" topAligned options={null}>
        <ChordChartEditor
          onSave={(song) => importSongs([song], song.title)}
          onClose={() => setShowEditor(false)}
        />
      </ToolLayout>
    );
  }

  return (
    <ToolLayout title="Chord Charts" layout="stacked" topAligned options={null}>
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 overflow-x-hidden xl:flex-row xl:items-start">
        <div className="flex w-full min-w-0 flex-col gap-3 xl:w-80 xl:shrink-0">
          <CollapsiblePanel
            id="chord-charts-tunes"
            title={`Tunes${shownTotalSongs ? ` (${shownTotalSongs})` : ""}`}
            icon={ListIcon}
            action={
              <>
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  disabled={shownTotalSongs === 0}
                  aria-label="Clear all tunes"
                  title="Clear all tunes"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-background text-muted hover:text-danger disabled:opacity-40"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setSearchOpen(true)}
                  disabled={shownTotalSongs === 0}
                  aria-label="Search tunes"
                  title="Search tunes"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-foreground hover:bg-accent-hover disabled:opacity-40"
                >
                  <SearchIcon className="h-4 w-4" />
                </button>
              </>
            }
          >
            {libraryLoading ? (
              <div className="flex justify-center py-4">
                <LoadingSpinner />
              </div>
            ) : shownTotalSongs === 0 ? (
              <p className="text-sm text-muted">
                No tunes yet. Import a playlist below to get started.
              </p>
            ) : (
              <div className="flex max-h-[24rem] flex-col gap-1 overflow-y-auto pr-1">
                {playlists.map((playlist) => (
                  <PlaylistSection
                    key={playlist.id}
                    playlist={playlist}
                    selectedId={selectedId}
                    forcedOpen={expandOverrides[playlist.id]}
                    onToggle={(open) =>
                      setExpandOverrides((prev) => ({ ...prev, [playlist.id]: open }))
                    }
                    onSelect={(id) => updateView({ selectedId: id })}
                    onDelete={deleteSong}
                  />
                ))}
              </div>
            )}
          </CollapsiblePanel>

          <CollapsiblePanel
            id="chord-charts-import"
            title="Import a playlist"
            icon={BookIcon}
          >
            <Hint>
              Paste a sheddex chord chart link below — export one from the chart builder, or from
              a chart someone shared with you — or choose a text file it was saved to.
            </Hint>
            <textarea
              value={linkText}
              onChange={(e) => setLinkText(e.target.value)}
              placeholder="sheddex://..."
              rows={4}
              className="w-full resize-y rounded-lg bg-background p-2 text-left font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => linkText.trim() && void importText(linkText)}
                disabled={!linkText.trim()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover disabled:opacity-40"
              >
                Import
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-lg bg-background px-4 py-2 text-sm font-medium hover:bg-surface-hover"
              >
                Choose file…
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.html,text/plain,text/html"
                className="hidden"
                onChange={(e) =>
                  e.target.files?.[0] && handleFile(e.target.files[0])
                }
              />
            </div>
            {status && (
              <p
                className={`text-left text-xs ${status.kind === "error" ? "text-danger" : "text-muted"}`}
              >
                {status.message}
              </p>
            )}
          </CollapsiblePanel>

          <CollapsiblePanel
            id="chord-charts-create"
            title="Create a chord chart"
            icon={PencilIcon}
          >
            <Hint>
              Build a chart bar by bar, then save it straight into your library or export it as a
              chart link to share.
            </Hint>
            <button
              type="button"
              onClick={() => setShowEditor(true)}
              className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent-hover"
            >
              Open the chart builder
            </button>
          </CollapsiblePanel>

          <CollapsiblePanel
            id="chord-charts-display"
            title="Display"
            icon={SlidersIcon}
          >
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-muted">Bars per row</span>
              <Select
                value={barsPerRow}
                onChange={(v) => updateView({ barsPerRow: v })}
                options={BARS_PER_ROW_OPTIONS.map((n) => ({
                  value: n,
                  label: String(n),
                }))}
                className="min-w-20"
              />
            </label>
            <Hint>How many bars are shown per line before wrapping to the next.</Hint>

            <label className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-muted">Key</span>
              <Select
                value={transposeKey}
                onChange={setTransposeKey}
                disabled={!selected}
                options={[
                  { value: "", label: selected ? `Original (${selected.key || "—"})` : "Original" },
                  ...KEY_NAMES.map((k) => ({ value: k, label: k })),
                ]}
                className="min-w-32"
              />
            </label>
            <Hint>
              Transposes every chord (and the printed key) to a different key, without changing
              your saved chart — resets to the original key when you pick a different tune.
            </Hint>
          </CollapsiblePanel>
        </div>

        <div className="relative flex min-w-0 flex-1 items-center justify-center rounded-2xl bg-background px-1 py-4 sm:p-6">
          {selectedSongLoading ? (
            <LoadingSpinner label="Loading chart…" showLabel />
          ) : selected && displayed ? (
            <>
              <button
                type="button"
                onClick={() => setMaximized(true)}
                aria-label="Maximize chart"
                title="Maximize"
                className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-surface text-muted hover:bg-surface-hover hover:text-foreground"
              >
                <MaximizeIcon className="h-4 w-4" />
              </button>
              {/* ChordChart manages its own page-shaped box and scales its whole contents to fit
                  it (see that component's own comment) — no responsive wrapper needed here. */}
              <div className="w-full max-w-full">
                <ChordChart song={displayed} barsPerRow={barsPerRow} />
              </div>
            </>
          ) : (
            <p className="text-center text-sm text-muted">
              {shownTotalSongs === 0
                ? "Import a playlist to see your first chart here."
                : "Press the search icon to find a tune."}
            </p>
          )}
        </div>
      </div>

      {maximized && selected && displayed && (
        <div className="fixed inset-0 z-[80] flex flex-col gap-3 bg-background p-4 sm:p-6">
          <button
            type="button"
            onClick={() => setMaximized(false)}
            aria-label="Exit full screen"
            title="Minimize"
            className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-surface text-muted hover:bg-surface-hover hover:text-foreground sm:right-6 sm:top-6"
          >
            <MinimizeIcon className="h-4 w-4" />
          </button>
          <div className="min-h-0 flex-1">
            <ChordChart song={displayed} barsPerRow={barsPerRow} fullscreen />
          </div>
        </div>
      )}

      {searchOpen && (
        <TuneSearchPopup
          songs={sorted}
          onSelect={(id) => {
            updateView({ selectedId: id });
            setSearchOpen(false);
          }}
          onClose={() => setSearchOpen(false)}
        />
      )}

      {confirmClear && (
        <ConfirmDialog
          title="Clear all tunes?"
          message="This removes every imported chart from this browser. You can re-import a playlist any time."
          confirmLabel="Clear all"
          onConfirm={() => {
            void clearAll();
            updateView({ selectedId: "" });
            setConfirmClear(false);
          }}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </ToolLayout>
  );
}

/** One playlist's row in the "Tunes" panel — a header (chevron, name, song count) that expands to
    that playlist's songs, same row styling (selection highlight, hover-revealed delete button) the
    flat list used before playlists existed. `forcedOpen` is the parent's explicit override, if
    there is one; with no override, a playlist that contains the currently selected song shows
    expanded by default so picking a tune (e.g. from search) always reveals where it lives, without
    that needing to be written into `forcedOpen` itself — see `ChordCharts`' own `expandOverrides`
    comment. */
function PlaylistSection({
  playlist,
  selectedId,
  forcedOpen,
  onToggle,
  onSelect,
  onDelete,
}: {
  playlist: LibraryPlaylist;
  selectedId: string;
  forcedOpen: boolean | undefined;
  onToggle: (open: boolean) => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const containsSelected = playlist.songs.some((s) => s.id === selectedId);
  const open = forcedOpen ?? containsSelected;
  const sortedSongs = useMemo(
    () => [...playlist.songs].sort((a, b) => a.title.localeCompare(b.title)),
    [playlist.songs],
  );

  return (
    <div>
      <button
        type="button"
        onClick={() => onToggle(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-lg px-1 py-1.5 text-left text-sm font-semibold text-muted transition-colors hover:text-foreground"
      >
        <svg
          viewBox="0 0 20 20"
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 8l5 5 5-5" />
        </svg>
        <span className="min-w-0 flex-1 truncate">{playlist.name}</span>
        <span className="shrink-0 tabular-nums text-xs text-muted">{playlist.songs.length}</span>
      </button>
      {open && (
        <ul className="flex flex-col gap-0.5 py-0.5 pl-5">
          {sortedSongs.map((song) => (
            <li key={song.id} className="group flex items-center gap-1">
              <button
                type="button"
                onClick={() => onSelect(song.id)}
                className={`flex-1 truncate rounded-lg px-2 py-1.5 text-left text-sm transition-colors ${
                  song.id === selectedId
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-background"
                }`}
              >
                <span className="block truncate font-medium">{song.title}</span>
                {song.composer && (
                  <span
                    className={`block truncate text-xs ${
                      song.id === selectedId ? "text-accent-foreground/80" : "text-muted"
                    }`}
                  >
                    {formatComposer(song.composer)}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => onDelete(song.id)}
                aria-label={`Remove ${song.title}`}
                title="Remove"
                className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-background hover:text-danger group-hover:flex"
              >
                <TrashIcon className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A full-screen searchable picker for the imported library, styled and behaving like
    `StandardsPicker` (Jam Practice's "add a tune" popup) — search box up top, arrow keys +
    Enter to jump around and pick, click a row to select it and close. */
function TuneSearchPopup({
  songs,
  onSelect,
  onClose,
}: {
  songs: LibrarySongMeta[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.composer.toLowerCase().includes(q),
    );
  }, [songs, query]);
  const activeIndex = Math.min(active, Math.max(0, results.length - 1));

  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(results.length - 1, activeIndex + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(0, activeIndex - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = results[activeIndex];
      if (target) onSelect(target.id);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-overlay px-4 pt-[10vh] sm:pt-[14vh]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Search your tunes"
        className="w-full max-w-3xl overflow-hidden rounded-2xl bg-surface text-left text-foreground shadow-2xl shadow-black/30 ring-1 ring-foreground/10"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-4 border-b border-surface-hover px-5 py-4 sm:px-6 sm:py-5">
          <SearchIcon className="h-5 w-5 shrink-0 text-muted" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder={`Search ${songs.length} tunes…`}
            aria-label="Search your tunes"
            className="min-w-0 flex-1 bg-transparent text-lg outline-none placeholder:text-muted"
          />
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground"
          >
            Done
          </button>
        </div>

        <ul
          ref={listRef}
          role="listbox"
          className="max-h-[50dvh] overflow-y-auto p-2"
        >
          {results.length === 0 && (
            <li className="px-4 py-3 text-muted">No tunes match “{query}”</li>
          )}
          {results.map((song, i) => (
            <li
              key={song.id}
              role="option"
              aria-selected={i === activeIndex}
              data-index={i}
              onPointerMove={() => setActive(i)}
              onClick={() => onSelect(song.id)}
              className={`flex cursor-pointer items-center gap-4 rounded-xl px-4 py-3 ${
                i === activeIndex ? "bg-surface-hover" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate">{song.title}</div>
                <div className="truncate text-xs text-muted">
                  {formatComposer(song.composer)} · {song.key} · {song.style}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
