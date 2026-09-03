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
