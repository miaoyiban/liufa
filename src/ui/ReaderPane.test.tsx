// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReaderPane, articleDomId } from './ReaderPane';
import type { Law } from '../core/types';

beforeAll(() => {
  // jsdom 未實作 scrollIntoView
  Element.prototype.scrollIntoView = vi.fn();
});

const law: Law = {
  pcode: 'B0000001', name: '民法', abbr: '民法', aliases: ['民'],
  group: '民法及關係法規', updated: '20260817', history: '1.制定',
  blocks: [
    { t: 'd', level: 0, label: '第 二 編 債' },
    { t: 'd', level: 1, label: '第 一 章 通則' },
    { t: 'a', no: '183', main: 183, sub: 0, label: '第 183 條', text: '不當得利之受領人。' },
    { t: 'a', no: '184', main: 184, sub: 0, label: '第 184 條', text: '因故意或過失。\n第二項內容。' },
    { t: 'a', no: '184-1', main: 184, sub: 1, label: '第 184-1 條', text: '之一條。' },
  ],
};

describe('articleDomId', () => {
  it('產生穩定的 DOM id', () => {
    expect(articleDomId('184-1')).toBe('article-184-1');
  });
});

describe('ReaderPane', () => {
  it('未選法規時顯示提示', () => {
    render(<ReaderPane law={null} targetNo={null} hitsByNo={new Map()} notes={new Map()} db={null} onNoteSaved={() => {}} />);
    expect(screen.getByText(/輸入關鍵字或條號/)).toBeDefined();
  });

  it('渲染整部法規的全部條文,不做虛擬捲動', () => {
    const { container } = render(<ReaderPane law={law} targetNo={null} hitsByNo={new Map()} notes={new Map()} db={null} onNoteSaved={() => {}} />);
    expect(container.querySelectorAll('article')).toHaveLength(3);
  });

  it('渲染編章節標題並保留層級', () => {
    const { container } = render(<ReaderPane law={law} targetNo={null} hitsByNo={new Map()} notes={new Map()} db={null} onNoteSaved={() => {}} />);
    const divisions = container.querySelectorAll('.division');
    expect(divisions).toHaveLength(2);
    expect(divisions[0]!.getAttribute('data-level')).toBe('0');
    expect(divisions[1]!.getAttribute('data-level')).toBe('1');
  });

  it('條文各項分段渲染', () => {
    const { container } = render(<ReaderPane law={law} targetNo="184" hitsByNo={new Map()} notes={new Map()} db={null} onNoteSaved={() => {}} />);
    const article = container.querySelector('#article-184')!;
    expect(article.querySelectorAll('p')).toHaveLength(2);
  });

  it('targetNo 變更時捲動到該條', () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { rerender } = render(<ReaderPane law={law} targetNo="183" hitsByNo={new Map()} notes={new Map()} db={null} onNoteSaved={() => {}} />);
    spy.mockClear();
    rerender(<ReaderPane law={law} targetNo="184-1" hitsByNo={new Map()} notes={new Map()} db={null} onNoteSaved={() => {}} />);
    expect(spy).toHaveBeenCalled();
  });

  it('套用命中高亮', () => {
    const hits = new Map([['184', [{ start: 1, length: 2 }]]]);
    const { container } = render(<ReaderPane law={law} targetNo="184" hitsByNo={hits} notes={new Map()} db={null} onNoteSaved={() => {}} />);
    expect(container.querySelector('#article-184 mark')?.textContent).toBe('故意');
  });

  it('顯示法規名稱與資料版本', () => {
    render(<ReaderPane law={law} targetNo={null} hitsByNo={new Map()} notes={new Map()} db={null} onNoteSaved={() => {}} />);
    expect(screen.getByText('民法')).toBeDefined();
    expect(screen.getByText(/2026-08-17/)).toBeDefined();
  });
});
