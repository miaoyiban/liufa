// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useBookmarks, useNotes } from './useLawDb';
import { openLawDb, putNote, toggleBookmark, articleKey, type LawDb } from '../store/db';

let db: LawDb;
let n = 0;
beforeEach(async () => { db = await openLawDb(`hooks-${n++}`); });

describe('useNotes', () => {
  it('一次載入全部筆記,以 key 索引', async () => {
    await putNote(db, 'B0000001', '184', '內容', '20260817');
    const { result } = renderHook(() => useNotes(db));
    await waitFor(() =>
      expect(result.current.notes.get(articleKey('B0000001', '184'))?.body).toBe('內容')
    );
  });

  it('reload 的參照跨 render 保持穩定', async () => {
    // 這個回呼一路傳到每一條的 NoteEditor 當 prop;參照每次 render 都變的話,
    // ArticleBlock 的 memo 會完全失效,存一次筆記就重新調和整部法規。
    const { result, rerender } = renderHook(() => useNotes(db));
    const first = result.current.reload;
    rerender();
    expect(result.current.reload).toBe(first);
  });
});

describe('useBookmarks', () => {
  it('載入書籤的 key,reload 後反映最新內容', async () => {
    const { result } = renderHook(() => useBookmarks(db));
    await waitFor(() => expect(result.current.bookmarks.size).toBe(0));

    await toggleBookmark(db, 'B0000001', '184');
    result.current.reload();

    await waitFor(() =>
      expect(result.current.bookmarks.has(articleKey('B0000001', '184'))).toBe(true)
    );
  });
});
