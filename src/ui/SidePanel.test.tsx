// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SidePanel } from './SidePanel';
import {
  openLawDb, toggleBookmark, addHistory, putNote, type LawDb,
} from '../store/db';
import type { Corpus } from '../core/types';

const corpus: Corpus = {
  sourceUpdatedAt: '2026/8/21',
  builtAt: '2026-09-03T00:00:00.000Z',
  laws: [
    { pcode: 'B0000001', name: '民法', abbr: '民法', aliases: ['民'],
      group: '民法及關係法規', updated: '20260817', history: '', blocks: [] },
  ],
};

let db: LawDb;
let n = 0;
beforeEach(async () => { db = await openLawDb(`side-${n++}`); });

describe('SidePanel', () => {
  it('沒有資料時顯示說明', async () => {
    render(<SidePanel db={db} corpus={corpus} onOpen={() => {}} />);
    expect(await screen.findByText(/還沒有書籤/)).toBeDefined();
  });

  it('讀取失敗時說明失敗,而不是謊報「還沒有資料」', async () => {
    await toggleBookmark(db, 'B0000001', '184');
    db.close(); // 連線關閉後所有讀取都會拋錯
    // 這裡預期會走到 console.error 的錯誤路徑,靜音以保持測試輸出乾淨
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<SidePanel db={db} corpus={corpus} onOpen={() => {}} />);

    expect(await screen.findByText(/讀取本機資料失敗/)).toBeDefined();
    expect(screen.queryByText(/還沒有書籤/)).toBeNull();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('列出書籤,顯示法規簡稱與條號', async () => {
    await toggleBookmark(db, 'B0000001', '184');
    render(<SidePanel db={db} corpus={corpus} onOpen={() => {}} />);
    expect(await screen.findByText('民法 184')).toBeDefined();
  });

  it('列出最近查詢', async () => {
    await addHistory(db, { ts: 1, query: '民184', pcode: 'B0000001', no: '184' });
    render(<SidePanel db={db} corpus={corpus} onOpen={() => {}} />);
    expect(await screen.findByText('民184')).toBeDefined();
  });

  it('點擊書籤回呼開啟目標', async () => {
    const onOpen = vi.fn();
    await toggleBookmark(db, 'B0000001', '184');
    render(<SidePanel db={db} corpus={corpus} onOpen={onOpen} />);
    await userEvent.click(await screen.findByText('民法 184'));
    expect(onOpen).toHaveBeenCalledWith({ pcode: 'B0000001', no: '184' });
  });

  it('列出筆記,並依更新時間新到舊排序', async () => {
    // 用 Date.now 假造時間差,避免真的 useFakeTimers 卡住 fake-indexeddb 內部的 setTimeout。
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValueOnce(1000);
    await putNote(db, 'B0000001', '184', '第一則筆記', '20260817');
    nowSpy.mockReturnValueOnce(2000);
    await putNote(db, 'B0000001', '185', '第二則筆記', '20260817');
    nowSpy.mockRestore();

    render(<SidePanel db={db} corpus={corpus} onOpen={() => {}} />);
    const items = await screen.findAllByText(/^第[一二]則筆記$/);
    expect(items.map((el) => el.textContent)).toEqual(['第二則筆記', '第一則筆記']);
  });

  it('點擊筆記回呼開啟目標', async () => {
    const onOpen = vi.fn();
    await putNote(db, 'B0000001', '184', '這是我的筆記', '20260817');
    render(<SidePanel db={db} corpus={corpus} onOpen={onOpen} />);
    await userEvent.click(await screen.findByText('這是我的筆記'));
    expect(onOpen).toHaveBeenCalledWith({ pcode: 'B0000001', no: '184' });
  });

  it('孤兒筆記(法規已不在收錄清單中)仍會顯示,標記後不可點擊導覽', async () => {
    const onOpen = vi.fn();
    // pcode 'ZZZ_GONE' 刻意不在測試用 corpus.laws 中,模擬語料已移除該部法規
    await putNote(db, 'ZZZ_GONE', '1', '這是一則孤兒筆記', '20260101');
    render(<SidePanel db={db} corpus={corpus} onOpen={onOpen} />);

    const text = await screen.findByText('這是一則孤兒筆記');
    const row = text.closest('li');
    expect(row).not.toBeNull();
    expect(row!.textContent).toMatch(/不在收錄/);

    await userEvent.click(row!);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('讀取失敗時,即使有筆記也不會顯示成「還沒有筆記」', async () => {
    await putNote(db, 'B0000001', '184', '在資料庫關閉前寫入的筆記', '20260817');
    db.close();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<SidePanel db={db} corpus={corpus} onOpen={() => {}} />);

    expect(await screen.findByText(/讀取本機資料失敗/)).toBeDefined();
    expect(screen.queryByText(/還沒有/)).toBeNull();
    logged.mockRestore();
  });

  it('提供匯出與匯入入口', async () => {
    render(<SidePanel db={db} corpus={corpus} onOpen={() => {}} />);
    expect(await screen.findByRole('button', { name: /匯出/ })).toBeDefined();
    expect(await screen.findByText(/匯入/)).toBeDefined();
  });

  it('匯入格式錯誤的檔案時顯示失敗訊息,且不影響既有書籤', async () => {
    await toggleBookmark(db, 'B0000001', '184');
    render(<SidePanel db={db} corpus={corpus} onOpen={() => {}} />);
    await screen.findByText('民法 184');

    const bad = new File(['not json'], 'bad.json', { type: 'application/json' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, bad);

    expect(await screen.findByText(/匯入失敗/)).toBeDefined();
    // 匯入失敗不應清空既有資料
    expect(screen.getByText('民法 184')).toBeDefined();
  });
});
