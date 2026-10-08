"use client";

import type { Id } from "@jam-practice/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import LoadingSpinner from "@/components/LoadingSpinner";
import { EmptyCard, PageHeader, PageShell } from "@/components/library/shared";
import { TuneSelectDialog } from "@/components/recordings/RecordingParts";
import { LinkIcon, TrashIcon } from "@/components/tools";
import { formatDuration, formatRecordedAt, recordingsApi, useTuneIndex } from "@/lib/recordings";

/** `/recordings/view?id=…` — one recording: play it, rename it, keep notes on it, link it to a tune
    (or change or unlink it), or delete it. Edits save with the Save button, or when you leave. */
export default function RecordingPage({ id }: { id: string }) {
  const router = useRouter();
  const recording = useQuery(recordingsApi.get, id ? { id: id as Id<"recordings"> } : "skip");
  const update = useMutation(recordingsApi.update);
  const remove = useMutation(recordingsApi.remove);
  const byId = useTuneIndex();
  const [name, setName] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Anything typed but not saved is saved on the way out.
  const pending = useRef<{ id: Id<"recordings">; name?: string; notes?: string } | null>(null);
  useEffect(() => {
    if (!recording) return;
    const n = name?.trim();
    pending.current = {
      id: recording._id,
      ...(n && n !== recording.name ? { name: n } : {}),
      ...(notes !== null && notes !== recording.notes ? { notes } : {}),
    };
  }, [recording, name, notes]);
  useEffect(
    () => () => {
      const p = pending.current;
      if (p && (p.name !== undefined || p.notes !== undefined)) void update(p);
    },
    [update],
  );

  if (recording === undefined) {
    return (
      <PageShell>
        <LoadingSpinner />
      </PageShell>
    );
  }
  if (recording === null) {
    return (
      <PageShell>
        <EmptyCard>This recording doesn&apos;t exist anymore.</EmptyCard>
      </PageShell>
    );
  }
  const rec = recording;
  const shownName = name ?? rec.name;
  const shownNotes = notes ?? rec.notes;
  const dirty = (shownName.trim() !== "" && shownName.trim() !== rec.name) || shownNotes !== rec.notes;
  function save() {
    const patch = {
      ...(shownName.trim() && shownName.trim() !== rec.name ? { name: shownName.trim() } : {}),
      ...(shownNotes !== rec.notes ? { notes: shownNotes } : {}),
    };
    if (Object.keys(patch).length) void update({ id: rec._id, ...patch });
    setName(null);
    setNotes(null);
  }
  const linked = rec.tuneId ? byId.get(rec.tuneId) : undefined;

  return (
    <PageShell>
      <PageHeader
        title={rec.name}
        subtitle={`${formatRecordedAt(rec.createdAt)} · ${formatDuration(rec.durationSec)}`}
        back={() => router.back()}
        actions={
          <>
            {dirty && (
              <button type="button" onClick={save} className="rounded-full bg-accent px-5 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-hover">
                Save
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label="Delete recording"
              title="Delete recording"
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface text-muted hover:bg-surface-hover hover:text-danger"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </>
        }
      />
      {rec.url && <audio controls src={rec.url} className="w-full" />}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-muted">Name</span>
        <input value={shownName} onChange={(e) => setName(e.target.value)} className="rounded-xl bg-surface px-4 py-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent" />
      </label>

      <div className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-muted">Tune</span>
        <div className="flex items-center gap-3 rounded-xl bg-surface px-4 py-3">
          <LinkIcon className={`h-4 w-4 ${linked ? "text-accent" : "text-muted"}`} />
          {linked ? (
            <Link href={`/tunes/tune?id=${linked.tune.id}&list=${linked.list}`} className="min-w-0 flex-1 truncate text-base font-semibold hover:underline">
              {linked.tune.name}
            </Link>
          ) : (
            <span className="flex-1 text-base text-muted">{rec.tuneId ? "Its tune was deleted." : "Not linked to a tune."}</span>
          )}
          <button type="button" onClick={() => setPicking(true)} className="text-sm font-medium text-accent hover:underline">
            {linked ? "Change" : "Link a tune"}
          </button>
          {linked && (
            <button type="button" onClick={() => void update({ id: rec._id, tuneId: null })} className="text-sm font-medium text-muted hover:text-foreground">
              Unlink
            </button>
          )}
        </div>
      </div>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-muted">Notes</span>
        <textarea
          value={shownNotes}
          onChange={(e) => setNotes(e.target.value)}
          rows={8}
          placeholder="How did it go? What to work on…"
          className="resize-y rounded-2xl bg-surface p-4 text-base outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </label>

      {picking && (
        <TuneSelectDialog
          onPick={(tuneId) => {
            setPicking(false);
            void update({ id: rec._id, tuneId });
          }}
          onClose={() => setPicking(false)}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Delete this recording?"
          message="The audio is deleted from your account for good."
          confirmLabel="Delete"
          onConfirm={() => {
            pending.current = null;
            setConfirmDelete(false);
            void remove({ id: rec._id });
            router.push("/recordings");
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </PageShell>
  );
}
