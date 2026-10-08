"use client";

import { api } from "@jam-practice/convex/_generated/api";
import type { Id } from "@jam-practice/convex/_generated/dataModel";
import { useMemo } from "react";
import type { Tune } from "@/lib/types";
import { useSyncedTunes } from "@/lib/useSyncedTunes";
import { useTunesToLearn } from "@/lib/useTunesToLearn";

/** A saved recording, as `convex/recordings.ts`'s queries return it — shared with the app. */
export type Recording = {
  _id: Id<"recordings">;
  name: string;
  notes: string;
  durationSec: number;
  mimeType: string;
  tuneId: string | null;
  createdAt: number;
  updatedAt: number;
  url: string | null;
};

export const recordingsApi = api.recordings;

/** "1:05", "12:40", "1:02:03". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 8, 10:45" — the same format the app uses. */
export function formatRecordedAt(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Uploads a take to Convex file storage (`generateUploadUrl` → POST the file) and returns the
    stored file's id, for `api.recordings.create`. */
export async function uploadRecordingBlob(blob: Blob, generateUploadUrl: () => Promise<string>) {
  if (!blob.size) throw new Error("The recording is empty.");
  const uploadUrl = await generateUploadUrl();
  const res = await fetch(uploadUrl, { method: "POST", headers: { "Content-Type": blob.type || "audio/webm" }, body: blob });
  if (!res.ok) throw new Error(`Upload failed (${res.status}${res.statusText ? `: ${res.statusText}` : ""}).`);
  const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };
  return storageId;
}

export type TuneListId = "tunes" | "learn";

/** Every tune of yours by id, from both lists — for showing and picking a recording's tune. */
export function useTuneIndex() {
  const [tunes] = useSyncedTunes();
  const [learn] = useTunesToLearn();
  return useMemo(() => {
    const byId = new Map<string, { tune: Tune; list: TuneListId }>();
    for (const tune of tunes) byId.set(tune.id, { tune, list: "tunes" });
    for (const tune of learn) byId.set(tune.id, { tune, list: "learn" });
    return byId;
  }, [tunes, learn]);
}
