import { articleKey, type Bookmark, type HistoryEntry, type LawDb, type Note } from './db';

export type Backup = {
  version: 1;
  exportedAt: string;
  history: HistoryEntry[];
  bookmarks: Bookmark[];
  notes: Note[];
};

export async function exportAll(db: LawDb): Promise<Backup> {
  const [history, bookmarks, notes] = await Promise.all([
    db.getAll('history'),
    db.getAll('bookmarks'),
    db.getAll('notes'),
  ]);
  return { version: 1, exportedAt: new Date().toISOString(), history, bookmarks, notes };
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function asHistory(v: unknown): Omit<HistoryEntry, 'id'> | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!isNum(o.ts) || !isStr(o.query) || !isStr(o.pcode) || !isStr(o.no)) return null;
  return { ts: o.ts, query: o.query, pcode: o.pcode, no: o.no };
}

function asBookmark(v: unknown): Bookmark | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!isStr(o.pcode) || !isStr(o.no) || !isNum(o.ts)) return null;
  return { key: articleKey(o.pcode, o.no), pcode: o.pcode, no: o.no, ts: o.ts };
}

function asNote(v: unknown): Note | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!isStr(o.pcode) || !isStr(o.no) || !isStr(o.body)) return null;
  return {
    key: articleKey(o.pcode, o.no),
    pcode: o.pcode,
    no: o.no,
    body: o.body,
    updatedAt: isNum(o.updatedAt) ? o.updatedAt : Date.now(),
    lawVersionAtWrite: isStr(o.lawVersionAtWrite) ? o.lawVersionAtWrite : '',
  };
}

/**
 * 匯入外部備份檔。輸入來自使用者選擇的檔案,型別完全不可信,
 * 因此逐欄驗證;個別紀錄不合法就跳過,不讓整批匯入失敗。
 */
export async function importAll(
  db: LawDb,
  data: unknown
): Promise<{ history: number; bookmarks: number; notes: number }> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('備份檔格式不正確:預期為物件');
  }
  const o = data as Record<string, unknown>;
  if (o.version !== 1) {
    throw new Error(`不支援的備份版本:${String(o.version)}`);
  }

  const counts = { history: 0, bookmarks: 0, notes: 0 };

  for (const raw of Array.isArray(o.history) ? o.history : []) {
    const e = asHistory(raw);
    if (!e) continue;
    await db.add('history', e as HistoryEntry);
    counts.history++;
  }
  for (const raw of Array.isArray(o.bookmarks) ? o.bookmarks : []) {
    const b = asBookmark(raw);
    if (!b) continue;
    await db.put('bookmarks', b);
    counts.bookmarks++;
  }
  for (const raw of Array.isArray(o.notes) ? o.notes : []) {
    const note = asNote(raw);
    if (!note) continue;
    await db.put('notes', note);
    counts.notes++;
  }
  return counts;
}
