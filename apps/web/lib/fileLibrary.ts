/** Audio kept in this browser (IndexedDB), so it's still there next visit. */
export type LibraryEntry = {
  id: string;
  name: string;
  size: number;
  added: number;
};

type Stored = LibraryEntry & { type: string; blob: Blob };

function wrap<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

const STORE = "files";

/** A small blob library backed by its own IndexedDB database. */
export function createLibrary(dbName: string, maxFiles = 20) {
  function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function withStore<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => Promise<T>,
  ): Promise<T> {
    const db = await openDb();
    try {
      return await run(db.transaction(STORE, mode).objectStore(STORE));
    } finally {
      db.close();
    }
  }

  async function list(): Promise<LibraryEntry[]> {
    try {
      const all = await withStore("readonly", (store) =>
        wrap(store.getAll() as IDBRequest<Stored[]>),
      );
      return all
        .map(({ id, name, size, added }) => ({ id, name, size, added }))
        .sort((a, b) => b.added - a.added);
    } catch {
      return [];
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await withStore("readwrite", (store) => wrap(store.delete(id)));
    } catch {
      // ignore
    }
  }

  async function save(id: string, name: string, blob: Blob): Promise<void> {
    try {
      // Ask the browser not to evict this data when space runs low.
      void navigator.storage?.persist?.();
      const record: Stored = {
        id,
        name,
        size: blob.size,
        type: blob.type,
        added: Date.now(),
        blob,
      };
      await withStore("readwrite", (store) => wrap(store.put(record)));
      const entries = await list();
      for (const old of entries.slice(maxFiles)) await remove(old.id);
    } catch {
      // Storage full or unavailable; the audio still plays for this visit.
    }
  }

  async function get(id: string): Promise<File | null> {
    try {
      const record = await withStore("readonly", (store) =>
        wrap(store.get(id) as IDBRequest<Stored | undefined>),
      );
      return record ? new File([record.blob], record.name, { type: record.type }) : null;
    } catch {
      return null;
    }
  }

  async function rename(id: string, name: string): Promise<void> {
    try {
      await withStore("readwrite", async (store) => {
        const record = await wrap(store.get(id) as IDBRequest<Stored | undefined>);
        if (record) await wrap(store.put({ ...record, name }));
      });
    } catch {
      // ignore
    }
  }

  return { list, save, get, remove, rename };
}

const files = createLibrary("jam-practice-files");

export function fileId(file: File): string {
  return `${file.name}|${file.size}`;
}

export const listFiles = files.list;
export const getFile = files.get;
export const deleteFile = files.remove;
export async function saveFile(file: File): Promise<void> {
  await files.save(fileId(file), file.name, file);
}
