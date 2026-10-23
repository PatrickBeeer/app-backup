// Browser-only persistence via IndexedDB. Replaces Postgres + MinIO.
// Stores: analyses, sessions, generations. Cover data URLs (large) are stored
// directly — IndexedDB handles large strings/blobs fine.

import type { Analysis, CreationVersion, Generation, SavedCreation, Session } from '../types';

const DB_NAME = 'rednote-app';
const DB_VERSION = 1;
const STORE_ANALYSES = 'analyses';
const STORE_SESSIONS = 'sessions';
const STORE_GENERATIONS = 'generations';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_ANALYSES)) {
        db.createObjectStore(STORE_ANALYSES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        const store = db.createObjectStore(STORE_SESSIONS, { keyPath: 'session_id' });
        store.createIndex('analysis_id', 'analysis_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_GENERATIONS)) {
        const store = db.createObjectStore(STORE_GENERATIONS, { keyPath: 'id' });
        store.createIndex('session_id', 'session_id', { unique: false });
        store.createIndex('analysis_id', 'analysis_id', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(store, mode);
        const request = fn(transaction.objectStore(store));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

function txAll<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T[]>): Promise<T[]> {
  return tx(store, mode, fn);
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

// ---- analyses ----
export async function listAnalyses(): Promise<Analysis[]> {
  const all = await txAll<Analysis>(STORE_ANALYSES, 'readonly', (s) => s.getAll() as IDBRequest<Analysis[]>);
  return all.sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 50);
}

export async function getAnalysis(id: string): Promise<Analysis | null> {
  const item = await tx<Analysis>(STORE_ANALYSES, 'readonly', (s) => s.get(id));
  return item ?? null;
}

export async function saveAnalysis(analysis: Analysis): Promise<void> {
  await tx(STORE_ANALYSES, 'readwrite', (s) => s.put(analysis));
}

export async function deleteAnalysis(id: string): Promise<void> {
  // cascade: delete sessions + generations for this analysis
  const sessions = await listSessionsByAnalysis(id);
  for (const session of sessions) {
    const gens = await listGenerationsBySession(session.session_id);
    for (const gen of gens) {
      await tx(STORE_GENERATIONS, 'readwrite', (s) => s.delete(gen.id));
    }
    await tx(STORE_SESSIONS, 'readwrite', (s) => s.delete(session.session_id));
  }
  await tx(STORE_ANALYSES, 'readwrite', (s) => s.delete(id));
}

// ---- sessions ----
async function listSessionsByAnalysis(analysisId: string): Promise<Session[]> {
  return txAll<Session>(STORE_SESSIONS, 'readonly', (s) => {
    const idx = s.index('analysis_id');
    return idx.getAll(analysisId) as IDBRequest<Session[]>;
  });
}

export async function saveSession(session: Session & { analysis_id: string; created_at?: string }): Promise<Session> {
  const record = { ...session, created_at: session.created_at || new Date().toISOString() };
  await tx(STORE_SESSIONS, 'readwrite', (s) => s.put(record));
  return { session_id: record.session_id, brief: record.brief, titles: record.titles, selected_title: record.selected_title };
}

// ---- generations ----
async function listGenerationsBySession(sessionId: string): Promise<Generation[]> {
  return txAll<Generation>(STORE_GENERATIONS, 'readonly', (s) => {
    const idx = s.index('session_id');
    return idx.getAll(sessionId) as IDBRequest<Generation[]>;
  });
}

export async function saveGeneration(gen: Generation & { session_id: string; analysis_id: string }): Promise<void> {
  await tx(STORE_GENERATIONS, 'readwrite', (s) => s.put(gen));
}

export async function getGeneration(id: string): Promise<Generation | null> {
  const item = await tx<Generation>(STORE_GENERATIONS, 'readonly', (s) => s.get(id));
  return item ?? null;
}

export async function deleteGeneration(id: string): Promise<void> {
  await tx(STORE_GENERATIONS, 'readwrite', (s) => s.delete(id));
}

export async function listGenerationsByAnalysis(analysisId: string): Promise<CreationVersion[]> {
  const sessions = await listSessionsByAnalysis(analysisId);
  const sessionById = new Map(sessions.map((s) => [s.session_id, s]));
  const gens = await txAll<Generation & { session_id: string; analysis_id: string }>(
    STORE_GENERATIONS,
    'readonly',
    (s) => s.index('analysis_id').getAll(analysisId) as IDBRequest<(Generation & { session_id: string; analysis_id: string })[]>,
  );
  return gens
    .map((gen) => {
      const session = sessionById.get(gen.session_id);
      return {
        ...gen,
        created_at: gen.created_at || '',
        session_id: gen.session_id,
        brief: session?.brief || '',
        titles: session?.titles || [],
      } as CreationVersion;
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
}

export async function latestCreation(analysisId: string): Promise<SavedCreation> {
  const sessions = await listSessionsByAnalysis(analysisId);
  if (sessions.length === 0) return { session: null, generation: null };
  const session = sessions.sort((a, b) => ((a as any).created_at || '').localeCompare((b as any).created_at || ''))[0];
  const gens = await listGenerationsBySession(session.session_id);
  const generation = gens.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))[0] || null;
  return { session, generation };
}

export { genId };
