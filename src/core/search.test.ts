import { describe, it, expect } from 'vitest';
import { findHits, matchArticle } from './search';

describe('findHits', () => {
  it('找出單一出現位置', () => {
    expect(findHits('因故意或過失', '過失')).toEqual([{ start: 4, length: 2 }]);
  });

  it('找出全部出現位置', () => {
    expect(findHits('過失,過失,過失', '過失')).toEqual([
      { start: 0, length: 2 },
      { start: 3, length: 2 },
      { start: 6, length: 2 },
    ]);
  });

  it('不重疊掃描:aaa 中找 aa 只算一次', () => {
    expect(findHits('aaa', 'aa')).toEqual([{ start: 0, length: 2 }]);
  });

  it('沒有命中時回傳空陣列', () => {
    expect(findHits('因故意或過失', '故意過失')).toEqual([]);
  });
});

describe('matchArticle', () => {
  const text = '因故意或過失，不法侵害他人之權利者，負損害賠償責任。';

  it('單一 term 命中', () => {
    expect(matchArticle(text, ['過失'])).toEqual([{ start: 4, length: 2 }]);
  });

  it('多 term 全部命中才算(AND)', () => {
    const hits = matchArticle(text, ['過失', '賠償']);
    expect(hits).not.toBeNull();
    expect(hits).toHaveLength(2);
  });

  it('任一 term 未命中即回傳 null', () => {
    expect(matchArticle(text, ['過失', '緊急避難'])).toBeNull();
  });

  it('命中位置依 start 由小到大排序', () => {
    const hits = matchArticle(text, ['賠償', '故意'])!;
    expect(hits.map((h) => h.start)).toEqual([1, 21]);
  });

  it('空 term 陣列回傳 null', () => {
    expect(matchArticle(text, [])).toBeNull();
  });
});
