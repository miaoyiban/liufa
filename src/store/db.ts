import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type HistoryEntry = {
  id?: number;
  ts: number;
  query: string;
  pcode: string;
  no: string;
};

export type Bookmark = { key: string; pcode: string; no: string; ts: number };

export type Note = {
  key: string;
  pcode: string;
  no: string;
  body: string;              // 原始 Markdown
  updatedAt: number;
  lawVersionAtWrite: string; // 寫入當下該法的「最新異動日期」
};

interface LawDbSchema extends DBSchema {
  history: { key: number; value: HistoryEntry; indexes: { 'by-ts': number } };
  bookmarks: { key: string; value: Bookmark; indexes: { 'by-ts': number } };
  notes: { key: string; value: Note };
}

export type LawDb = IDBPDatabase<LawDbSchema>;

const HISTORY_LIMIT = 200;

export function articleKey(pcode: string, no: string): string {
  return `${pcode}:${no}`;
}

export async function openLawDb(name = 'law-lookup'): Promise<LawDb> {
  return openDB<LawDbSchema>(name, 1, {
    upgrade(db) {
      const history = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
      history.createIndex('by-ts', 'ts');
      const bookmarks = db.createObjectStore('bookmarks', { keyPath: 'key' });
      bookmarks.createIndex('by-ts', 'ts');
      db.createObjectStore('notes', { keyPath: 'key' });
    },
  });
}

export async function addHistory(db: LawDb, e: Omit<HistoryEntry, 'id'>): Promise<void> {
  await db.add('history', e as HistoryEntry);
  const tx = db.transaction('history', 'readwrite');
  const keys = await tx.store.index('by-ts').getAllKeys();
  const excess = keys.length - HISTORY_LIMIT;
  for (let i = 0; i < excess; i++) await tx.store.delete(keys[i]!);
  await tx.done;
}

export async function listHistory(db: LawDb, limit = 20): Promise<HistoryEntry[]> {
  const all = await db.getAllFromIndex('history', 'by-ts');
  return all.reverse().slice(0, limit);
}

export async function toggleBookmark(db: LawDb, pcode: string, no: string): Promise<boolean> {
  const key = articleKey(pcode, no);
  if (await db.get('bookmarks', key)) {
    await db.delete('bookmarks', key);
    return false;
  }
  await db.put('bookmarks', { key, pcode, no, ts: Date.now() });
  return true;
}

export async function listBookmarks(db: LawDb): Promise<Bookmark[]> {
  return (await db.getAllFromIndex('bookmarks', 'by-ts')).reverse();
}

export async function getNote(db: LawDb, pcode: string, no: string): Promise<Note | undefined> {
  return db.get('notes', articleKey(pcode, no));
}

export async function putNote(
  db: LawDb, pcode: string, no: string, body: string, lawVersionAtWrite: string
): Promise<void> {
  const key = articleKey(pcode, no);
  if (body.trim() === '') {
    await db.delete('notes', key);
    return;
  }
  await db.put('notes', { key, pcode, no, body, updatedAt: Date.now(), lawVersionAtWrite });
}

export async function listNotes(db: LawDb): Promise<Note[]> {
  return db.getAll('notes');
}
