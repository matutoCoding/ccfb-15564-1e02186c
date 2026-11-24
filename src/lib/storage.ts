import type { Project, ProjectSummary } from '../types.ts';
import { projectSummary } from './project.ts';

const DB_NAME = 'tea-terrace-workbench';
const STORE = 'projects';
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = run(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}

export const projectStorage = {
  async save(project: Project): Promise<void> {
    project.updatedAt = Date.now();
    await tx('readwrite', (s) => s.put(project));
  },
  async get(id: string): Promise<Project | undefined> {
    return tx('readonly', (s) => s.get(id) as IDBRequest<Project | undefined>);
  },
  async list(): Promise<ProjectSummary[]> {
    const all = await tx('readonly', (s) => s.getAll() as IDBRequest<Project[]>);
    return all.map(projectSummary).sort((a, b) => b.updatedAt - a.updatedAt);
  },
  async listFull(): Promise<Project[]> {
    const all = await tx('readonly', (s) => s.getAll() as IDBRequest<Project[]>);
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  },
  async remove(id: string): Promise<void> {
    await tx('readwrite', (s) => s.delete(id));
  }
};
