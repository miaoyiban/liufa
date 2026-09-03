// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Highlight } from './Highlight';

describe('Highlight', () => {
  it('無命中時原樣輸出', () => {
    const { container } = render(<Highlight text="因故意或過失" hits={[]} />);
    expect(container.textContent).toBe('因故意或過失');
    expect(container.querySelectorAll('mark')).toHaveLength(0);
  });

  it('包裹單一命中', () => {
    render(<Highlight text="因故意或過失" hits={[{ start: 4, length: 2 }]} />);
    expect(screen.getByText('過失').tagName).toBe('MARK');
  });

  it('包裹多處命中且完整保留原文', () => {
    const { container } = render(
      <Highlight text="過失,過失" hits={[{ start: 0, length: 2 }, { start: 3, length: 2 }]} />
    );
    expect(container.querySelectorAll('mark')).toHaveLength(2);
    expect(container.textContent).toBe('過失,過失');
  });

  it('重疊命中不重複包裹,文字不遺失', () => {
    const { container } = render(
      <Highlight text="損害賠償" hits={[{ start: 0, length: 2 }, { start: 1, length: 2 }]} />
    );
    expect(container.textContent).toBe('損害賠償');
  });
});
