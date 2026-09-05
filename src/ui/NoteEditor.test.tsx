// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoteEditor } from './NoteEditor';
import { openLawDb, getNote, articleKey, type LawDb, type Note } from '../store/db';

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

  it('渲染時不讀取資料庫(避免整部法規觸發 N 次查詢)', () => {
    const spy = vi.spyOn(db, 'get');
    render(<NoteEditor {...base} note={note('內容')} db={db} />);
    expect(spy).not.toHaveBeenCalled();
  });
});
