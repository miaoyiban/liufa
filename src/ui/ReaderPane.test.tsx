// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReaderPane, articleDomId } from './ReaderPane';
import { articleKey } from '../store/db';
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
    render(<ReaderPane law={null} targetNo={null} hitsByNo={new Map()} notes={new Map()} bookmarks={new Set()} db={null} onNoteSaved={() => {}} />);
    expect(screen.getByText(/輸入關鍵字或條號/)).toBeDefined();
  });

  it('渲染整部法規的全部條文,不做虛擬捲動', () => {
    const { container } = render(<ReaderPane law={law} targetNo={null} hitsByNo={new Map()} notes={new Map()} bookmarks={new Set()} db={null} onNoteSaved={() => {}} />);
    expect(container.querySelectorAll('article')).toHaveLength(3);
  });

  it('渲染編章節標題並保留層級', () => {
    const { container } = render(<ReaderPane law={law} targetNo={null} hitsByNo={new Map()} notes={new Map()} bookmarks={new Set()} db={null} onNoteSaved={() => {}} />);
    const divisions = container.querySelectorAll('.division');
    expect(divisions).toHaveLength(2);
    expect(divisions[0]!.getAttribute('data-level')).toBe('0');
    expect(divisions[1]!.getAttribute('data-level')).toBe('1');
  });

  it('條文各項分段渲染', () => {
    const { container } = render(<ReaderPane law={law} targetNo="184" hitsByNo={new Map()} notes={new Map()} bookmarks={new Set()} db={null} onNoteSaved={() => {}} />);
    const article = container.querySelector('#article-184')!;
    expect(article.querySelectorAll('p')).toHaveLength(2);
  });

  it('targetNo 變更時捲動到該條(而不是捲到別條)', () => {
    // 只斷言「有呼叫」會讓捲到錯誤條文的實作照樣通過,所以記下呼叫對象。
    const scrolled: Element[] = [];
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) {
      scrolled.push(this);
    });
    const { container, rerender } = render(<ReaderPane law={law} targetNo="183" hitsByNo={new Map()} notes={new Map()} bookmarks={new Set()} db={null} onNoteSaved={() => {}} />);
    scrolled.length = 0;
    rerender(<ReaderPane law={law} targetNo="184-1" hitsByNo={new Map()} notes={new Map()} bookmarks={new Set()} db={null} onNoteSaved={() => {}} />);
    expect(scrolled).toEqual([container.querySelector('#article-184-1')]);
  });

  it('套用命中高亮', () => {
    const hits = new Map([['184', [{ start: 1, length: 2 }]]]);
    const { container } = render(<ReaderPane law={law} targetNo="184" hitsByNo={hits} notes={new Map()} bookmarks={new Set()} db={null} onNoteSaved={() => {}} />);
    expect(container.querySelector('#article-184 mark')?.textContent).toBe('故意');
  });

  it('有筆記與有書籤的條文在條號旁顯示標記(§8.2)', () => {
    const notes = new Map([[articleKey('B0000001', '184'), {
      key: articleKey('B0000001', '184'), pcode: 'B0000001', no: '184',
      body: '筆記', updatedAt: 1, lawVersionAtWrite: '20260817',
    }]]);
    const bookmarks = new Set([articleKey('B0000001', '183')]);
    const { container } = render(
      <ReaderPane law={law} targetNo={null} hitsByNo={new Map()} notes={notes} bookmarks={bookmarks} db={null} onNoteSaved={() => {}} />
    );

    const flag = (no: string, label: string) =>
      container.querySelector(`#article-${no} .article-no [aria-label="${label}"]`);
    expect(flag('184', '有筆記')).not.toBeNull();
    expect(flag('183', '已加入書籤')).not.toBeNull();
    // 沒有筆記/書籤的條文不掛標記
    expect(flag('183', '有筆記')).toBeNull();
    expect(flag('184', '已加入書籤')).toBeNull();
    expect(flag('184-1', '有筆記')).toBeNull();
    expect(flag('184-1', '已加入書籤')).toBeNull();
  });

  it('顯示法規名稱與資料版本', () => {
    render(<ReaderPane law={law} targetNo={null} hitsByNo={new Map()} notes={new Map()} bookmarks={new Set()} db={null} onNoteSaved={() => {}} />);
    expect(screen.getByText('民法')).toBeDefined();
    expect(screen.getByText(/2026-08-17/)).toBeDefined();
  });
});
