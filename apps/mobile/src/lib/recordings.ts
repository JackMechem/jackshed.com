import { api } from '@jam-practice/convex/_generated/api';
import type { Id } from '@jam-practice/convex/_generated/dataModel';
import { File } from 'expo-file-system';
import { FileSystemUploadType, getInfoAsync, uploadAsync } from 'expo-file-system/legacy';

export type Recording = {
  _id: Id<'recordings'>;
  name: string;
  notes: string;
  durationSec: number;
  mimeType: string;
  tuneId: string | null;
  createdAt: number;
  updatedAt: number;
  url: string | null;
};

export const RECORDING_MIME = 'audio/mp4';

/** "1:05", "12:40", "1:02:03". */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 8, 10:45" — plain string work (no `Intl`/`toLocaleString`, slow on Hermes). */
export function formatRecordedAt(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Uploads a local take to Convex file storage (`generateUploadUrl` → POST the file) and returns
    the stored file's id, for `api.recordings.create`. The file is streamed natively from disk
    (`uploadAsync`, binary body) — reading it through `fetch(file://…).blob()` first arrived at
    Convex empty on Android (a 400). */
export async function uploadRecordingFile(uri: string, generateUploadUrl: () => Promise<string>) {
  const info = await getInfoAsync(uri);
  if (!info.exists || !info.size) throw new Error('The recording file is empty.');
  const uploadUrl = await generateUploadUrl();
  const res = await uploadAsync(uploadUrl, uri, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    headers: { 'Content-Type': RECORDING_MIME },
  });
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Upload failed (${res.status}${res.body ? `: ${res.body.slice(0, 120)}` : ''}).`);
  }
  const { storageId } = JSON.parse(res.body) as { storageId: Id<'_storage'> };
  return storageId;
}

/** Deletes a local take once it's uploaded or discarded. Never throws. */
export function deleteLocalTake(uri: string) {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Left in the cache directory; the OS clears it eventually.
  }
}

export const recordingsApi = api.recordings;
