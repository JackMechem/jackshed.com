"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import ConfirmDialog from "@/components/ConfirmDialog";
import { PageHeader, PageShell } from "@/components/library/shared";
import SwitchRow from "@/components/SwitchRow";
import { TrashIcon } from "@/components/tools";
import { decodeChartString, looksLikeChartString } from "@/lib/chartString";
import { parseIrealPlaylist } from "@/lib/iRealPro";
import { useChordChartsLibrary } from "@/lib/useChordChartsLibrary";

/** A sheddex chart link first, quietly falling back to an iReal Pro playlist link — never naming
    iReal Pro anywhere a user can see. */
function parsePlaylistInput(text: string) {
  if (looksLikeChartString(text)) return decodeChartString(text);
  try {
    return parseIrealPlaylist(text);
  } catch {
    throw new Error("Couldn't read that — paste a sheddex chord chart link.");
  }
}

/** Importing chord charts: paste a chart link or playlist link (or pick a file it's saved in). */
export default function ImportChartsPage() {
  const router = useRouter();
  const { importSongs, clearAll, totalSongs } = useChordChartsLibrary(null);
  const [text, setText] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; message: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function run(input: string) {
    let playlist;
    try {
      playlist = parsePlaylistInput(input);
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : "Couldn't read that." });
      return;
    }
    setImporting(true);
    setStatus(null);
    try {
      const { added, skipped, updated } = await importSongs(playlist.songs, playlist.name, { replaceExisting });
      const plural = (n: number) => `${n} chart${n === 1 ? "" : "s"}`;
      setStatus({
        kind: "ok",
        message:
          `Imported ${plural(added)} into "${playlist.name}".` +
          (updated ? ` Updated ${plural(updated)} you already had.` : "") +
          (skipped > 0 ? ` (${skipped} already in your library, left as they were.)` : ""),
      });
      setText("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      setStatus({ kind: "error", message: e instanceof Error ? e.message : "Couldn't import that playlist." });
    } finally {
      setImporting(false);
    }
  }

  return (
    <PageShell>
      <PageHeader title="Import charts" back={() => router.push("/chord-charts")} />
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste a chord chart link or playlist link"
        rows={5}
        className="w-full resize-y rounded-2xl bg-surface p-4 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-accent"
      />
      <SwitchRow
        label="Update charts you already have"
        checked={replaceExisting}
        onChange={setReplaceExisting}
        hint="When a chart in the link is already in your library (same title, composer and key), replace yours with the one from the link — it stays in the same playlist. Turn this off to only add charts you don't have yet."
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => text.trim() && !importing && void run(text)}
          disabled={!text.trim() || importing}
          className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-40"
        >
          {importing ? "Importing…" : "Import"}
        </button>
        <button type="button" onClick={() => fileRef.current?.click()} className="rounded-lg bg-surface px-4 py-2.5 text-sm font-medium hover:bg-surface-hover">
          Choose file…
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.html,text/plain,text/html"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => typeof reader.result === "string" && void run(reader.result);
            reader.onerror = () => setStatus({ kind: "error", message: "Couldn't read that file." });
            reader.readAsText(file);
          }}
        />
      </div>
      {status && (
        <div className="flex flex-col gap-2">
          <p className={`text-sm ${status.kind === "error" ? "text-danger" : ""}`}>{status.message}</p>
          {status.kind === "ok" && (
            <button type="button" onClick={() => router.push("/chord-charts")} className="self-start rounded-lg bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-hover">
              Back to chord charts
            </button>
          )}
        </div>
      )}
      <button
        type="button"
        onClick={() => setConfirmClear(true)}
        disabled={totalSongs === 0}
        className="mt-6 flex items-center gap-1.5 self-start text-sm font-medium text-danger disabled:opacity-40"
      >
        <TrashIcon className="h-4 w-4" /> Delete all chord charts
      </button>
      {confirmClear && (
        <ConfirmDialog
          title="Delete all chord charts?"
          message="This removes every imported or created chart and every playlist. You can re-import a playlist any time."
          confirmLabel="Delete all"
          onConfirm={() => {
            void clearAll();
            setConfirmClear(false);
          }}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </PageShell>
  );
}
