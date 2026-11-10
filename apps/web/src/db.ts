/** IndexedDB persistence: projects (latest state) + snapshots (version history). */
import type { Project } from '../../../packages/shared-types/src/index';

const DB_NAME = 'planforge';
const DB_VERSION = 1;

export interface Snapshot { id: string; projectId: string; createdAt: number; label: string; project: Project }

let dbp: Promise<IDBDatabase> | null = null;
function db(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('snapshots')) d.createObjectStore('snapshots', { keyPath: 'id' }).createIndex('projectId', 'projectId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const t = d.transaction(store, mode);
    const s = t.objectStore(store);
    const r = fn(s);
    let result: T;
    if (r) r.onsuccess = () => { result = r.result; };
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error ?? new Error('Transaction aborted'));
  }));
}

export const dbApi = {
  listProjects: () => tx<Project[]>('projects', 'readonly', (s) => s.getAll()),
  getProject: (id: string) => tx<Project | undefined>('projects', 'readonly', (s) => s.get(id)),
  putProject: (p: Project) => tx<IDBValidKey>('projects', 'readwrite', (s) => s.put(p)),
  deleteProject: async (id: string) => {
    await tx('projects', 'readwrite', (s) => s.delete(id));
    const snaps = await dbApi.listSnapshots(id);
    for (const sn of snaps) await tx('snapshots', 'readwrite', (s) => s.delete(sn.id));
  },
  listSnapshots: (projectId: string) => tx<Snapshot[]>('snapshots', 'readonly', (s) => s.index('projectId').getAll(projectId)),
  putSnapshot: (sn: Snapshot) => tx<IDBValidKey>('snapshots', 'readwrite', (s) => s.put(sn)),
  deleteSnapshot: (id: string) => tx('snapshots', 'readwrite', (s) => s.delete(id)),
};
