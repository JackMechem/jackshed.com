/** Multitrack projects kept in this browser (IndexedDB): small metadata plus one blob per track. */
export type ClipMeta = {
  id: string;
  name: string;
  offset: number;
  trimStart?: number;
  trimEnd?: number;
  repeatEnd?: number | null;
  size: number;
};

export type TrackMeta = {
  id: string;
  name: string;
  color?: string;
  volume: number;
  muted: boolean;
  solo: boolean;
  /** Missing in projects saved before tracks could hold several clips. */
  clips?: ClipMeta[];
  // Legacy single-clip fields (one track = one recording).
  offset?: number;
  trimStart?: number;
  trimEnd?: number;
  repeatEnd?: number | null;
  size?: number;
};

export type ProjectMeta = {
  id: string;
  name: string;
  added: number;
  tracks: TrackMeta[];
};

export type ProjectInfo = { id: string; name: string; added: number; trackCount: number };

const DB_NAME = "jam-practice-projects";
const PROJECTS = "projects";
const BLOBS = "blobs";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(PROJECTS, { keyPath: "id" });
      request.result.createObjectStore(BLOBS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withDb<T>(
  stores: string[],
  mode: IDBTransactionMode,
  run: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  const db = await openDb();
  try {
    return await run(db.transaction(stores, mode));
  } finally {
    db.close();
  }
}

/** The ids that audio blobs are stored under for a track (old projects used the track id). */
export function clipIdsOf(track: TrackMeta): string[] {
  return track.clips ? track.clips.map((c) => c.id) : [track.id];
}

const blobKey = (projectId: string, trackId: string) => `${projectId}/${trackId}`;

export async function listProjects(): Promise<ProjectInfo[]> {
  try {
    const all = await withDb([PROJECTS], "readonly", (tx) =>
      wrap(tx.objectStore(PROJECTS).getAll() as IDBRequest<ProjectMeta[]>),
    );
    return all
      .map((p) => ({ id: p.id, name: p.name, added: p.added, trackCount: p.tracks.length }))
      .sort((a, b) => b.added - a.added);
  } catch {
    return [];
  }
}

export async function saveProjectMeta(meta: ProjectMeta): Promise<void> {
  try {
    void navigator.storage?.persist?.();
    await withDb([PROJECTS], "readwrite", (tx) => wrap(tx.objectStore(PROJECTS).put(meta)));
  } catch {
    // storage unavailable
  }
}

export async function saveTrackBlob(projectId: string, trackId: string, blob: Blob): Promise<void> {
  try {
    await withDb([BLOBS], "readwrite", (tx) =>
      wrap(tx.objectStore(BLOBS).put(blob, blobKey(projectId, trackId))),
    );
  } catch {
    // storage unavailable
  }
}

export async function deleteTrackBlob(projectId: string, trackId: string): Promise<void> {
  try {
    await withDb([BLOBS], "readwrite", (tx) =>
      wrap(tx.objectStore(BLOBS).delete(blobKey(projectId, trackId))),
    );
  } catch {
    // ignore
  }
}

export async function loadProject(
  id: string,
): Promise<{ meta: ProjectMeta; blobs: Map<string, Blob> } | null> {
  try {
    return await withDb([PROJECTS, BLOBS], "readonly", async (tx) => {
      const meta = (await wrap(tx.objectStore(PROJECTS).get(id))) as ProjectMeta | undefined;
      if (!meta) return null;
      const blobs = new Map<string, Blob>();
      for (const track of meta.tracks) {
        for (const clipId of clipIdsOf(track)) {
          const blob = (await wrap(tx.objectStore(BLOBS).get(blobKey(id, clipId)))) as
            Blob | undefined;
          if (blob) blobs.set(clipId, blob);
        }
      }
      return { meta, blobs };
    });
  } catch {
    return null;
  }
}

export async function deleteProject(id: string): Promise<void> {
  try {
    const loaded = await loadProject(id);
    await withDb([PROJECTS, BLOBS], "readwrite", async (tx) => {
      await wrap(tx.objectStore(PROJECTS).delete(id));
      for (const track of loaded?.meta.tracks ?? []) {
        for (const clipId of clipIdsOf(track)) {
          await wrap(tx.objectStore(BLOBS).delete(blobKey(id, clipId)));
        }
      }
    });
  } catch {
    // ignore
  }
}
