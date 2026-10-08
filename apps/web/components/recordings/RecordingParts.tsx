"use client";

import { useConvexAuth } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import { CloseIcon, LinkIcon, MicIcon, SearchIcon } from "@/components/tools";
import { sortByText } from "@jam-practice/core/sortText";
import {
  type Recording,
  formatDuration,
  formatRecordedAt,
  recordingsApi,
  uploadRecordingBlob,
  useTuneIndex,
} from "@/lib/recordings";

/** A recording in a list: name (links to its page), date · length (· tune), and a player. */
export function RecordingCard({ recording, tuneName }: { recording: Recording; tuneName?: string | null }) {
  const detail = [formatRecordedAt(recording.createdAt), formatDuration(recording.durationSec), tuneName].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-surface p-3">
      <Link href={`/recordings/view?id=${recording._id}`} className="min-w-0 hover:underline">
        <div className="truncate font-semibold">{recording.name}</div>
        <div className="truncate text-xs text-muted">{detail}</div>
      </Link>
      {recording.url && <audio controls preload="none" src={recording.url} className="h-10 w-full" />}
    </div>
  );
}

function useEscape(onClose: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
}

/** Pick one of your tunes (from both lists) to link a recording to. */
export function TuneSelectDialog({ onPick, onClose }: { onPick: (tuneId: string) => void; onClose: () => void }) {
  useEscape(onClose);
  const byId = useTuneIndex();
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = [...byId.values()].filter((r) => !q || r.tune.name.toLowerCase().includes(q));
    return sortByText(all, (r) => r.tune.name);
  }, [byId, query]);
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 pt-[10vh]" onClick={onClose}>
      <div role="dialog" aria-label="Link to a tune" className="flex max-h-[75vh] w-full max-w-lg flex-col gap-3 rounded-2xl bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 rounded-xl bg-background px-3 py-2">
          <SearchIcon className="h-4 w-4 text-muted" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your tunes" className="min-w-0 flex-1 bg-transparent outline-none" />
        </div>
        <ul className="flex flex-col gap-0.5 overflow-y-auto">
          {rows.length === 0 ? (
            <li className="p-3 text-sm text-muted">{query ? "No tunes match." : "No tunes in your library yet."}</li>
          ) : (
            rows.slice(0, 300).map((r) => (
              <li key={r.tune.id}>
                <button type="button" onClick={() => onPick(r.tune.id)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-background">
                  <LinkIcon className="h-4 w-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{r.tune.name}</span>
                    <span className="block truncate text-xs text-muted">{r.list === "learn" ? "Tunes to Learn" : "Tunes I Know"}</span>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

/** Pick one of your existing recordings to link to a tune. Ones already linked to it aren't
    offered; ones linked to another tune say so (linking moves them). */
export function RecordingSelectDialog({
  excludeTuneId,
  onPick,
  onClose,
}: {
  excludeTuneId: string;
  onPick: (recording: Recording) => void;
  onClose: () => void;
}) {
  useEscape(onClose);
  const recordings = useQuery(recordingsApi.list, {});
  const byId = useTuneIndex();
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (recordings ?? []).filter((r) => r.tuneId !== excludeTuneId && (!q || r.name.toLowerCase().includes(q)));
  }, [recordings, excludeTuneId, query]);
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-black/40 p-4 pt-[10vh]" onClick={onClose}>
      <div role="dialog" aria-label="Link a recording" className="flex max-h-[75vh] w-full max-w-lg flex-col gap-3 rounded-2xl bg-surface p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 rounded-xl bg-background px-3 py-2">
          <SearchIcon className="h-4 w-4 text-muted" />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search recordings" className="min-w-0 flex-1 bg-transparent outline-none" />
        </div>
        <ul className="flex flex-col gap-0.5 overflow-y-auto">
          {recordings === undefined ? (
            <li className="flex justify-center p-4">
              <LoadingSpinner />
            </li>
          ) : rows.length === 0 ? (
            <li className="p-3 text-sm text-muted">{query ? "No recordings match." : "No other recordings to link."}</li>
          ) : (
            rows.map((r) => {
              const other = r.tuneId ? byId.get(r.tuneId)?.tune.name : null;
              return (
                <li key={r._id}>
                  <button type="button" onClick={() => onPick(r)} className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-background">
                    <span className="truncate text-sm font-medium">{r.name}</span>
                    <span className="truncate text-xs text-muted">
                      {[formatRecordedAt(r.createdAt), formatDuration(r.durationSec), other ? `linked to ${other}` : null].filter(Boolean).join(" · ")}
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

/** What a finished take turns into: listen back, name it, link a tune, add notes, then Save
    uploads it to the account. Discard asks first — the take only exists in this tab until saved. */
export function SaveTakeDialog({
  blob,
  durationSec,
  initialTuneId,
  onSaved,
  onDiscard,
}: {
  blob: Blob;
  durationSec: number;
  initialTuneId: string | null;
  onSaved: (id: string) => void;
  onDiscard: () => void;
}) {
  const byId = useTuneIndex();
  const generateUploadUrl = useMutation(recordingsApi.generateUploadUrl);
  const create = useMutation(recordingsApi.create);
  const forTune = useQuery(recordingsApi.listForTune, initialTuneId ? { tuneId: initialTuneId } : "skip");
  // Released when the dialog is done (saved/discarded) — not in an effect cleanup, which React's
  // dev double-mount runs early and leaves the preview pointing at a revoked URL.
  const [url] = useState(() => URL.createObjectURL(blob));
  const [recordedAt] = useState(() => Date.now());

  const [tuneId, setTuneId] = useState<string | null>(initialTuneId);
  const [name, setName] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [picking, setPicking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const defaultName = initialTuneId && forTune ? `Take ${forTune.length + 1}` : formatRecordedAt(recordedAt);
  const shownName = name ?? defaultName;
  const tune = tuneId ? byId.get(tuneId)?.tune : undefined;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const storageId = await uploadRecordingBlob(blob, generateUploadUrl);
      const id = await create({
        storageId,
        name: shownName,
        notes,
        durationSec,
        mimeType: blob.type || "audio/webm",
        ...(tuneId ? { tuneId } : {}),
      });
      URL.revokeObjectURL(url);
      onSaved(id);
    } catch (e) {
      setSaving(false);
      setError(e instanceof Error ? e.message : "Couldn't save the recording.");
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-[8vh]">
      <div role="dialog" aria-label="Save recording" className="flex w-full max-w-lg flex-col gap-4 rounded-2xl bg-surface p-5 text-left shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Save recording</h2>
          <button type="button" onClick={() => setConfirmDiscard(true)} aria-label="Discard" className="rounded-full p-1.5 text-muted hover:bg-background hover:text-foreground">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <audio controls src={url} className="w-full" />
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-muted">Name</span>
          <input value={shownName} onChange={(e) => setName(e.target.value)} className="rounded-xl bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent" />
        </label>
        <div className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-muted">Tune</span>
          <div className="flex items-center gap-2 rounded-xl bg-background px-3 py-2">
            <LinkIcon className={`h-4 w-4 ${tune ? "text-accent" : "text-muted"}`} />
            <button type="button" onClick={() => setPicking(true)} className={`min-w-0 flex-1 truncate text-left text-base ${tune ? "" : "text-muted"}`}>
              {tune ? tune.name : "Not linked — click to link a tune"}
            </button>
            {tune && (
              <button type="button" onClick={() => setTuneId(null)} className="text-sm font-medium text-muted hover:text-foreground">
                Unlink
              </button>
            )}
          </div>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-muted">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="How did it go? What to work on…"
            className="resize-y rounded-xl bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent"
          />
        </label>
        {error && <p className="text-sm text-danger">{error} Your take is still here — try Save again.</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setConfirmDiscard(true)} disabled={saving} className="rounded-full px-5 py-2 font-semibold text-danger hover:bg-background disabled:opacity-50">
            Discard
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="flex items-center gap-2 rounded-full bg-accent px-6 py-2 font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-60"
          >
            {saving && <LoadingSpinner size="sm" inline />}
            {saving ? "Uploading…" : "Save"}
          </button>
        </div>
        {confirmDiscard && (
          <div className="flex flex-col gap-3 rounded-xl bg-background p-3">
            <p className="text-sm">Discard this take? It hasn&apos;t been saved, so it&apos;ll be gone for good.</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmDiscard(false)} className="rounded-full px-4 py-1.5 text-sm font-medium hover:bg-surface">
                Keep it
              </button>
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(url);
                  onDiscard();
                }}
                className="rounded-full bg-danger px-4 py-1.5 text-sm font-semibold text-white"
              >
                Discard
              </button>
            </div>
          </div>
        )}
      </div>
      {picking && (
        <TuneSelectDialog
          onPick={(id) => {
            setTuneId(id);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

/** A tune page's Recordings: its takes (playable in place), "Record a take" (the Recorder, already
    linked to this tune, metronome at its tempo) and "Link existing". */
export function TuneRecordings({ tuneId }: { tuneId: string }) {
  const { isAuthenticated } = useConvexAuth();
  const recordings = useQuery(recordingsApi.listForTune, isAuthenticated ? { tuneId } : "skip");
  const update = useMutation(recordingsApi.update);
  const [linking, setLinking] = useState(false);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-bold">Recordings</h2>
        {recordings && recordings.length > 0 && <span className="text-sm tabular-nums text-muted">{recordings.length}</span>}
      </div>
      {!isAuthenticated ? (
        <p className="rounded-2xl bg-surface p-4 text-sm text-muted">Sign in to record takes of this tune — recordings are saved to your account.</p>
      ) : (
        <>
          {recordings === undefined ? (
            <LoadingSpinner />
          ) : (
            recordings.length > 0 && (
              <div className="grid gap-3 sm:grid-cols-2">
                {recordings.map((r) => (
                  <RecordingCard key={r._id} recording={r} />
                ))}
              </div>
            )
          )}
          <div className="flex flex-wrap gap-2">
            <Link href={`/recorder?tuneId=${tuneId}`} className="flex items-center gap-1.5 rounded-lg bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-hover">
              <MicIcon className="h-4 w-4" /> Record a take
            </Link>
            <button type="button" onClick={() => setLinking(true)} className="flex items-center gap-1.5 rounded-lg bg-surface px-3 py-2 text-sm font-medium hover:bg-surface-hover">
              <LinkIcon className="h-4 w-4" /> Link existing
            </button>
          </div>
        </>
      )}
      {linking && (
        <RecordingSelectDialog
          excludeTuneId={tuneId}
          onPick={(r) => {
            setLinking(false);
            void update({ id: r._id, tuneId });
          }}
          onClose={() => setLinking(false)}
        />
      )}
    </section>
  );
}
