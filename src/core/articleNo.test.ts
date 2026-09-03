import { describe, it, expect } from 'vitest';
import {
  parseArticleLabel,
  parseArticleNo,
  formatArticleNo,
  compareArticleNo,
} from './articleNo';

describe('parseArticleLabel', () => {
  it('解析一般條號', () => {
    expect(parseArticleLabel('第 184 條')).toEqual({ main: 184, sub: 0 });
  });

  it('解析「之一」條號', () => {
    expect(parseArticleLabel('第 184-1 條')).toEqual({ main: 184, sub: 1 });
  });

  it('容忍多餘空白', () => {
    expect(parseArticleLabel('  第1條 ')).toEqual({ main: 1, sub: 0 });
  });

  it('編章節標題不是條號,回傳 null', () => {
    expect(parseArticleLabel('第 一 章 法例')).toBeNull();
  });
});

describe('parseArticleNo', () => {
  it('解析正規化字串', () => {
    expect(parseArticleNo('184')).toEqual({ main: 184, sub: 0 });
    expect(parseArticleNo('184-1')).toEqual({ main: 184, sub: 1 });
  });

  it('非純條號回傳 null', () => {
    expect(parseArticleNo('過失')).toBeNull();
    expect(parseArticleNo('184a')).toBeNull();
    expect(parseArticleNo('')).toBeNull();
  });
});

describe('formatArticleNo', () => {
  it('sub 為 0 時不顯示', () => {
    expect(formatArticleNo({ main: 184, sub: 0 })).toBe('184');
    expect(formatArticleNo({ main: 184, sub: 1 })).toBe('184-1');
  });
});

describe('compareArticleNo', () => {
  it('184 < 184-1 < 185', () => {
    const nos = [
      { main: 185, sub: 0 },
      { main: 184, sub: 1 },
      { main: 184, sub: 0 },
    ];
    const sorted = [...nos].sort(compareArticleNo).map(formatArticleNo);
    expect(sorted).toEqual(['184', '184-1', '185']);
  });

  it('184-2 排在 184-1 之後', () => {
    expect(compareArticleNo({ main: 184, sub: 1 }, { main: 184, sub: 2 })).toBeLessThan(0);
  });
});
