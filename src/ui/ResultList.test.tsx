// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResultList, flatResults } from './ResultList';
import type { ResultGroup } from '../core/search';
import type { Article } from '../core/types';

const article = (no: string, text: string): Article => ({
  t: 'a', no, main: Number(no), sub: 0, label: `第 ${no} 條`, text,
});

const groups: ResultGroup[] = [
  {
    pcode: 'B0000001', abbr: '民法',
    results: [
      { pcode: 'B0000001', abbr: '民法', article: article('184', '因故意或過失'), hits: [{ start: 4, length: 2 }] },
      { pcode: 'B0000001', abbr: '民法', article: article('191', '過失'), hits: [{ start: 0, length: 2 }] },
    ],
  },
  {
    pcode: 'C0000001', abbr: '刑法',
    results: [
      { pcode: 'C0000001', abbr: '刑法', article: article('284', '因過失傷害人者'), hits: [{ start: 1, length: 2 }] },
    ],
  },
];

describe('flatResults', () => {
  it('攤平為連續索引', () => {
    expect(flatResults(groups).map((r) => r.article.no)).toEqual(['184', '191', '284']);
  });
});

describe('ResultList', () => {
  it('顯示分組標題', () => {
    render(<ResultList groups={groups} selected={0} onSelect={() => {}} />);
    expect(screen.getByText('民法')).toBeDefined();
    expect(screen.getByText('刑法')).toBeDefined();
  });

  it('顯示條號與摘要,並高亮命中', () => {
    const { container } = render(<ResultList groups={groups} selected={0} onSelect={() => {}} />);
    expect(screen.getByText('第 184 條')).toBeDefined();
    expect(container.querySelectorAll('mark').length).toBeGreaterThan(0);
  });

  it('選取項目帶 aria-selected,且跨分組索引連續', () => {
    const { container } = render(<ResultList groups={groups} selected={2} onSelect={() => {}} />);
    const selected = container.querySelector('[aria-selected="true"]');
    expect(selected?.textContent).toContain('第 284 條');
  });

  it('點擊項目回呼其攤平索引', async () => {
    const onSelect = vi.fn();
    render(<ResultList groups={groups} selected={0} onSelect={onSelect} />);
    await userEvent.click(screen.getByText('第 191 條'));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('無結果時不渲染任何項目', () => {
    const { container } = render(<ResultList groups={[]} selected={0} onSelect={() => {}} />);
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(0);
  });
});

describe('ResultList 渲染視窗', () => {
  const bulk = (pcode: string, abbr: string, n: number, from = 1): ResultGroup => ({
    pcode, abbr,
    results: Array.from({ length: n }, (_, i) => ({
      pcode, abbr, article: article(String(from + i), '過失'), hits: [],
    })),
  });

  it('命中數龐大時只渲染一個視窗,但分組計數仍是完整值', () => {
    const big = [bulk('B0000001', '民法', 3000)];
    const { container } = render(<ResultList groups={big} selected={0} onSelect={() => {}} />);

    const options = container.querySelectorAll('[role="option"]');
    expect(options.length).toBeGreaterThan(0);
    expect(options.length).toBeLessThan(200);
    // 沒有被截斷,只是沒有一次全部渲染:計數與「尚有幾條」都說得出完整數字
    expect(container.querySelector('.group-count')?.textContent).toBe('3000');
    expect(container.querySelector('.results-more')?.textContent)
      .toContain(String(3000 - options.length));
  });

  it('選取落在視窗之外時,視窗延伸到選取項目(方向鍵不會走進未渲染區)', () => {
    const big = [bulk('B0000001', '民法', 3000)];
    const { container } = render(<ResultList groups={big} selected={2999} onSelect={() => {}} />);
    expect(container.querySelector('[aria-selected="true"]')?.textContent)
      .toContain('第 3000 條');
  });

  it('視窗跨分組時,後面的分組照樣渲染,索引仍然連續', () => {
    const many = [bulk('B0000001', '民法', 60), bulk('C0000001', '刑法', 60, 1000)];
    const onSelect = vi.fn();
    const { container } = render(<ResultList groups={many} selected={0} onSelect={onSelect} />);
    const options = container.querySelectorAll('[role="option"]');
    expect(options.length).toBeLessThan(120);
    // 第二組有被渲染到,且第一個項目的攤平索引接在第一組之後
    expect(container.querySelectorAll('.group-title')).toHaveLength(2);
    expect(screen.getByText('第 1000 條')).toBeDefined();
  });

  it('全部命中都在視窗內時不顯示「尚有幾條」', () => {
    const { container } = render(<ResultList groups={groups} selected={0} onSelect={() => {}} />);
    expect(container.querySelector('.results-more')).toBeNull();
  });
});
