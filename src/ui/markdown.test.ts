// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderMarkdown, staleNoteWarning } from './markdown';
import type { Note } from '../store/db';

const note = (over: Partial<Note> = {}): Note => ({
  key: 'B0000001:184', pcode: 'B0000001', no: '184',
  body: '筆記', updatedAt: 1, lawVersionAtWrite: '20260817', ...over,
});

describe('renderMarkdown', () => {
  it('渲染標題與清單', () => {
    const html = renderMarkdown('# 侵權行為\n\n- 故意\n- 過失');
    expect(html).toContain('<h1>侵權行為</h1>');
    expect(html).toContain('<li>故意</li>');
  });

  it('渲染粗體與行內程式碼', () => {
    expect(renderMarkdown('**要件**')).toContain('<strong>要件</strong>');
  });

  it('移除 script 標籤', () => {
    const html = renderMarkdown('安全<script>alert(1)</script>');
    expect(html).not.toContain('<script');
    expect(html).toContain('安全');
  });

  it('移除事件屬性', () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain('onerror');
  });

  it('移除 javascript: 連結', () => {
    const html = renderMarkdown('[點我](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
  });
});

describe('staleNoteWarning', () => {
  it('版本相同時不警示', () => {
    expect(staleNoteWarning(note(), '20260817')).toBeNull();
  });

  it('法規已修正時警示,並以可讀日期呈現', () => {
    const msg = staleNoteWarning(note({ lawVersionAtWrite: '20240101' }), '20260817');
    expect(msg).toContain('2026-08-17');
    expect(msg).toContain('修正前');
  });

  it('沒有筆記時不警示', () => {
    expect(staleNoteWarning(undefined, '20260817')).toBeNull();
  });

  it('舊備份沒有版本資訊時不警示(無從判斷)', () => {
    expect(staleNoteWarning(note({ lawVersionAtWrite: '' }), '20260817')).toBeNull();
  });
});
