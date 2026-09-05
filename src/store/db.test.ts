import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  openLawDb, articleKey, addHistory, listHistory,
  toggleBookmark, listBookmarks, getNote, putNote, listNotes,
  type LawDb,
} from './db';

let db: LawDb;
let n = 0;

beforeEach(async () => {
  db = await openLawDb(`test-${n++}`);
});

describe('articleKey', () => {
  it('組成 pcode:no', () => {
    expect(articleKey('B0000001', '184-1')).toBe('B0000001:184-1');
  });
});

describe('history', () => {
  it('新增後可讀出,最新在前', async () => {
    await addHistory(db, { ts: 1, query: '民184', pcode: 'B0000001', no: '184' });
    await addHistory(db, { ts: 2, query: '刑271', pcode: 'C0000001', no: '271' });
    const list = await listHistory(db);
    expect(list.map((h) => h.query)).toEqual(['刑271', '民184']);
  });

  it('超過 200 筆時裁切最舊的', async () => {
    for (let i = 0; i < 205; i++) {
      await addHistory(db, { ts: i, query: `q${i}`, pcode: 'B0000001', no: '1' });
    }
    const all = await db.getAll('history');
    expect(all).toHaveLength(200);
    expect(all.some((h) => h.query === 'q0')).toBe(false);
    expect(all.some((h) => h.query === 'q204')).toBe(true);
  });

  it('limit 參數限制回傳筆數', async () => {
    for (let i = 0; i < 30; i++) {
      await addHistory(db, { ts: i, query: `q${i}`, pcode: 'B0000001', no: '1' });
    }
    expect(await listHistory(db, 5)).toHaveLength(5);
  });
});

describe('bookmarks', () => {
  it('toggle 新增後回傳 true,再 toggle 移除後回傳 false', async () => {
    expect(await toggleBookmark(db, 'B0000001', '184')).toBe(true);
    expect(await listBookmarks(db)).toHaveLength(1);
    expect(await toggleBookmark(db, 'B0000001', '184')).toBe(false);
    expect(await listBookmarks(db)).toHaveLength(0);
  });

  it('最新加入的在前', async () => {
    // 用明確的時間戳排序,不靠真實 sleep 拉開毫秒差(那樣會 flaky,而這條
    // 測試在 CI 上是部署的關卡)。
    const now = vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(2000);
    await toggleBookmark(db, 'B0000001', '184');
    await toggleBookmark(db, 'C0000001', '271');
    expect((await listBookmarks(db)).map((b) => b.no)).toEqual(['271', '184']);
    now.mockRestore();
  });
});

describe('notes', () => {
  it('寫入後可讀出,並記錄寫入時的法規版本', async () => {
    await putNote(db, 'B0000001', '184', '# 侵權行為\n三個要件', '20260817');
    const note = await getNote(db, 'B0000001', '184');
    expect(note?.body).toBe('# 侵權行為\n三個要件');
    expect(note?.lawVersionAtWrite).toBe('20260817');
    expect(note?.updatedAt).toBeGreaterThan(0);
  });

  it('覆寫既有筆記', async () => {
    await putNote(db, 'B0000001', '184', '舊', '20260817');
    await putNote(db, 'B0000001', '184', '新', '20260817');
    expect((await getNote(db, 'B0000001', '184'))?.body).toBe('新');
    expect(await listNotes(db)).toHaveLength(1);
  });

  it('內容清空即刪除,不留空筆記', async () => {
    await putNote(db, 'B0000001', '184', '內容', '20260817');
    await putNote(db, 'B0000001', '184', '   ', '20260817');
    expect(await getNote(db, 'B0000001', '184')).toBeUndefined();
    expect(await listNotes(db)).toHaveLength(0);
  });

  it('不存在的筆記回傳 undefined', async () => {
    expect(await getNote(db, 'B0000001', '999')).toBeUndefined();
  });
});
