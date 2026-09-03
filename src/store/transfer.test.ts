import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { openLawDb, putNote, toggleBookmark, addHistory, listNotes, listBookmarks, type LawDb } from './db';
import { exportAll, importAll } from './transfer';

let db: LawDb;
let n = 0;
beforeEach(async () => { db = await openLawDb(`transfer-${n++}`); });

describe('exportAll', () => {
  it('匯出三個 store 的完整內容', async () => {
    await putNote(db, 'B0000001', '184', '# 筆記', '20260817');
    await toggleBookmark(db, 'C0000001', '271');
    await addHistory(db, { ts: 1, query: '民184', pcode: 'B0000001', no: '184' });

    const backup = await exportAll(db);
    expect(backup.version).toBe(1);
    expect(Date.parse(backup.exportedAt)).not.toBeNaN();
    expect(backup.notes).toHaveLength(1);
    expect(backup.bookmarks).toHaveLength(1);
    expect(backup.history).toHaveLength(1);
  });
});

describe('importAll', () => {
  it('匯入後可讀出', async () => {
    const backup = {
      version: 1,
      exportedAt: '2026-09-03T00:00:00.000Z',
      history: [{ ts: 1, query: '民184', pcode: 'B0000001', no: '184' }],
      bookmarks: [{ key: 'C0000001:271', pcode: 'C0000001', no: '271', ts: 1 }],
      notes: [{
        key: 'B0000001:184', pcode: 'B0000001', no: '184',
        body: '# 筆記', updatedAt: 1, lawVersionAtWrite: '20260817',
      }],
    };
    const counts = await importAll(db, backup);
    expect(counts).toEqual({ history: 1, bookmarks: 1, notes: 1 });
    expect(await listNotes(db)).toHaveLength(1);
    expect(await listBookmarks(db)).toHaveLength(1);
  });

  it('匯出再匯入可還原', async () => {
    await putNote(db, 'B0000001', '184', '原始筆記', '20260817');
    const backup = await exportAll(db);
    const db2 = await openLawDb(`transfer-restore-${n++}`);
    await importAll(db2, backup);
    expect((await listNotes(db2))[0]?.body).toBe('原始筆記');
  });

  it('拒絕非物件輸入', async () => {
    await expect(importAll(db, null)).rejects.toThrow(/格式不正確/);
    await expect(importAll(db, '字串')).rejects.toThrow(/格式不正確/);
  });

  it('拒絕不支援的版本', async () => {
    await expect(
      importAll(db, { version: 99, history: [], bookmarks: [], notes: [] })
    ).rejects.toThrow(/不支援的備份版本/);
  });

  it('跳過欄位不合法的紀錄,不整批失敗', async () => {
    const counts = await importAll(db, {
      version: 1,
      history: [],
      bookmarks: [{ key: 'ok', pcode: 'B0000001', no: '1', ts: 1 }, { pcode: 123 }],
      notes: [{ nope: true }],
    });
    expect(counts.bookmarks).toBe(1);
    expect(counts.notes).toBe(0);
  });
});
