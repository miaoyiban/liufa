// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoteEditor } from './NoteEditor';
import { renderMarkdown } from './markdown';
import { openLawDb, getNote, putNote, articleKey, type LawDb, type Note } from '../store/db';

// 真的渲染 Markdown,只是額外記錄有沒有被呼叫。
vi.mock('./markdown', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./markdown')>();
  return { ...actual, renderMarkdown: vi.fn(actual.renderMarkdown) };
});

let db: LawDb;
let n = 0;
beforeEach(async () => { db = await openLawDb(`note-${n++}`); });

const note = (body: string, version = '20260817'): Note => ({
  key: articleKey('B0000001', '184'),
  pcode: 'B0000001', no: '184', body, updatedAt: 1, lawVersionAtWrite: version,
});

const base = {
  pcode: 'B0000001', no: '184', lawUpdated: '20260817', onSaved: () => {},
};

describe('NoteEditor', () => {
  it('沒有筆記時顯示新增入口', () => {
    render(<NoteEditor {...base} note={undefined} db={db} />);
    expect(screen.getByRole('button', { name: /新增筆記/ })).toBeDefined();
  });

  it('既有筆記以渲染後的 HTML 呈現', () => {
    const { container } = render(<NoteEditor {...base} note={note('# 侵權行為')} db={db} />);
    expect(container.querySelector('h1')?.textContent).toBe('侵權行為');
  });

  it('點擊後進入編輯,顯示原始 Markdown', async () => {
    render(<NoteEditor {...base} note={note('# 侵權行為')} db={db} />);
    await userEvent.click(document.querySelector('.note-preview')!);
    const ta = (await screen.findByRole('textbox')) as HTMLTextAreaElement;
    expect(ta.value).toBe('# 侵權行為');
  });

  it('輸入後自動儲存,並回呼 onSaved', async () => {
    const onSaved = vi.fn();
    render(<NoteEditor {...base} onSaved={onSaved} note={undefined} db={db} />);
    await userEvent.click(screen.getByRole('button', { name: /新增筆記/ }));
    await userEvent.type(await screen.findByRole('textbox'), '**要件**');
    await waitFor(
      async () => expect((await getNote(db, 'B0000001', '184'))?.body).toBe('**要件**'),
      { timeout: 3000 }
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it('筆記寫於修法之前時顯示警示', () => {
    render(<NoteEditor {...base} note={note('舊筆記', '20240101')} db={db} />);
    expect(screen.getByText(/修正前/)).toBeDefined();
  });

  it('沒有內容時完全不做 Markdown 渲染(整部法規會掛載上千個空編輯器)', () => {
    vi.mocked(renderMarkdown).mockClear();
    render(<NoteEditor {...base} note={undefined} db={db} />);
    expect(screen.getByRole('button', { name: /新增筆記/ })).toBeDefined();
    expect(renderMarkdown).not.toHaveBeenCalled();
  });

  it('有內容時照常渲染 Markdown', () => {
    vi.mocked(renderMarkdown).mockClear();
    render(<NoteEditor {...base} note={note('# 侵權行為')} db={db} />);
    expect(renderMarkdown).toHaveBeenCalledWith('# 侵權行為');
  });

  it('渲染時不讀取資料庫(避免整部法規觸發 N 次查詢)', () => {
    const spy = vi.spyOn(db, 'get');
    render(<NoteEditor {...base} note={note('內容')} db={db} />);
    expect(spy).not.toHaveBeenCalled();
  });

  it('編輯中收到自己存檔觸發的 note prop 更新,不會被踢出編輯狀態(review round 1 #1)', async () => {
    const { rerender } = render(<NoteEditor {...base} note={undefined} db={db} />);
    await userEvent.click(screen.getByRole('button', { name: /新增筆記/ }));
    const ta = (await screen.findByRole('textbox')) as HTMLTextAreaElement;
    await userEvent.type(ta, 'AB');

    // 模擬 App 端 onSaved → reloadNotes 帶回的新 note prop(內容與目前草稿相同,
    // 但是全新的物件參照——這正是原本觸發重置 effect 的條件)。
    rerender(<NoteEditor {...base} note={note('AB')} db={db} />);

    const stillEditing = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(stillEditing).toBe(ta);
    expect(stillEditing.value).toBe('AB');

    // 繼續輸入不會被剛才的 rerender 蓋掉。
    await userEvent.type(stillEditing, 'C');
    expect(stillEditing.value).toBe('ABC');
  });

  it('卸載時補存尚未觸發 debounce 的內容(review round 1 #2)', async () => {
    const { unmount } = render(<NoteEditor {...base} note={undefined} db={db} />);
    await userEvent.click(screen.getByRole('button', { name: /新增筆記/ }));
    await userEvent.type(await screen.findByRole('textbox'), '尚未存檔');

    unmount(); // 遠早於 500ms debounce,原本的 clearTimeout 會直接丟掉這段內容

    await waitFor(
      async () => expect((await getNote(db, 'B0000001', '184'))?.body).toBe('尚未存檔'),
      { timeout: 3000 }
    );
  });

  it('資料庫無法使用時顯示原因,且不讓使用者誤以為打字會存到(review round 1 #3)', () => {
    render(<NoteEditor {...base} note={undefined} db={null} />);
    expect(screen.getByText(/筆記功能暫時無法使用/)).toBeDefined();
    expect(screen.queryByRole('button', { name: /新增筆記/ })).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('新筆記輸入後 blur,文字留在畫面上,不會塌回新增按鈕(review round 2 regression A)', async () => {
    render(<NoteEditor {...base} note={undefined} db={db} />);
    await userEvent.click(screen.getByRole('button', { name: /新增筆記/ }));
    await userEvent.type(await screen.findByRole('textbox'), 'AB');
    await userEvent.tab(); // blur

    expect(screen.queryByRole('button', { name: /新增筆記/ })).toBeNull();
    expect(document.querySelector('.note-preview')?.textContent).toContain('AB');
  });

  it('既有筆記編輯後 blur,再點回編輯不會被還沒落地的 note prop 蓋掉字元(review round 2 regression A)', async () => {
    render(<NoteEditor {...base} note={note('X')} db={db} />);
    await userEvent.click(document.querySelector('.note-preview')!);
    await userEvent.type(await screen.findByRole('textbox'), 'Y'); // X -> XY
    await userEvent.tab(); // blur,觸發立即補存(非同步進行中,尚未回頭更新 note prop)

    await userEvent.click(document.querySelector('.note-preview')!); // 補存落地前點回編輯
    const ta = (await screen.findByRole('textbox')) as HTMLTextAreaElement;
    expect(ta.value).toBe('XY'); // 不能被 props 裡還沒更新的舊 note.body("X")蓋掉

    await userEvent.type(ta, 'Z');
    await waitFor(
      async () => expect((await getNote(db, 'B0000001', '184'))?.body).toBe('XYZ'),
      { timeout: 3000 }
    );
  });

  it('切到另一部法規但條號相同(元件被 React 重用)時,草稿補存到正確的條文,不會誤寫進新條文(review round 2 regression B)', async () => {
    // 法規 B 已有自己的筆記與版本,且從未被使用者打開過。
    await putNote(db, 'LAW_B', '1', 'B的舊筆記', '20200101');

    const { rerender, unmount } = render(
      <NoteEditor pcode="LAW_A" no="1" lawUpdated="20260817" note={undefined} db={db} onSaved={() => {}} />
    );
    await userEvent.click(screen.getByRole('button', { name: /新增筆記/ }));
    await userEvent.type(await screen.findByRole('textbox'), 'A的新草稿');

    // 還沒等到 500ms debounce,使用者切去另一部法規;React 依 key={b.no} 重用
    // 同一個元件實例,pcode/lawUpdated/note 都換成法規 B 的。
    const bNote: Note = {
      key: articleKey('LAW_B', '1'), pcode: 'LAW_B', no: '1',
      body: 'B的舊筆記', updatedAt: 1, lawVersionAtWrite: '20200101',
    };
    rerender(
      <NoteEditor pcode="LAW_B" no="1" lawUpdated="20260817" note={bNote} db={db} onSaved={() => {}} />
    );
    unmount();

    await waitFor(
      async () => expect((await getNote(db, 'LAW_A', '1'))?.body).toBe('A的新草稿')
    );
    const bAfter = await getNote(db, 'LAW_B', '1');
    expect(bAfter?.body).toBe('B的舊筆記');
    expect(bAfter?.lawVersionAtWrite).toBe('20200101');
  });
});
