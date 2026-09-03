import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import type { Corpus, Article } from './types';

const PATH = 'public/corpus.json';

describe('corpus.json 真實資料驗證', () => {
  if (!existsSync(PATH)) {
    it('corpus.json 尚未建置', () => {
      throw new Error(`找不到 ${PATH},請先執行 npm run data`);
    });
    return;
  }

  const corpus = JSON.parse(readFileSync(PATH, 'utf8')) as Corpus;

  it('收錄 100 部法規', () => {
    expect(corpus.laws).toHaveLength(100);
  });

  it('記錄來源版本與建置時間', () => {
    expect(corpus.sourceUpdatedAt).toMatch(/^\d{4}\/\d{1,2}\/\d{1,2}/);
    expect(Date.parse(corpus.builtAt)).not.toBeNaN();
  });

  it('民法有 1439 條條文', () => {
    const mf = corpus.laws.find((l) => l.pcode === 'B0000001')!;
    expect(mf.abbr).toBe('民法');
    expect(mf.blocks.filter((b) => b.t === 'a')).toHaveLength(1439);
  });

  it('民法第 184 條內容正確', () => {
    const mf = corpus.laws.find((l) => l.pcode === 'B0000001')!;
    const a = mf.blocks.find((b): b is Article => b.t === 'a' && b.no === '184')!;
    expect(a.label).toBe('第 184 條');
    expect(a.text.startsWith('因故意或過失，不法侵害他人之權利者')).toBe(true);
  });

  it('刑法用的是正式名稱「中華民國刑法」,顯示名稱是「刑法」', () => {
    const c = corpus.laws.find((l) => l.pcode === 'C0000001')!;
    expect(c.name).toBe('中華民國刑法');
    expect(c.abbr).toBe('刑法');
  });

  it('帶括號後綴的法規以 abbr 顯示', () => {
    const p = corpus.laws.find((l) => l.pcode === 'D0020053')!;
    expect(p.name).toContain('（新');
    expect(p.abbr).toBe('總統副總統選舉罷免法');
  });

  it('民法保有 level 4 的編章節', () => {
    const mf = corpus.laws.find((l) => l.pcode === 'B0000001')!;
    expect(mf.blocks.some((b) => b.t === 'd' && b.level === 4)).toBe(true);
  });

  it('每部法規都有條文,且條號皆可排序', () => {
    for (const l of corpus.laws) {
      const arts = l.blocks.filter((b): b is Article => b.t === 'a');
      expect(arts.length, `${l.abbr} 沒有條文`).toBeGreaterThan(0);
      for (const a of arts) {
        expect(Number.isInteger(a.main), `${l.abbr} ${a.label}`).toBe(true);
      }
    }
  });

  it('總條文數約 11,942 條', () => {
    const n = corpus.laws.reduce(
      (s, l) => s + l.blocks.filter((b) => b.t === 'a').length, 0
    );
    expect(n).toBeGreaterThan(11000);
    expect(n).toBeLessThan(13000);
  });
});
