import { describe, it, expect } from 'vitest';
import { validate } from './validate';
import type { RawLaw } from './parseXml';
import type { LawEntry } from '../../src/core/alias';

const entry = (pcode: string, abbr: string): LawEntry => ({
  pcode, abbr, aliases: [], group: '測試',
});

const raw = (over: Partial<RawLaw> = {}): RawLaw => ({
  pcode: 'B0000001', name: '民法', category: '', updated: '20260817',
  discarded: false, history: '', preamble: '',
  blocks: [{ t: 'a', no: '1', main: 1, sub: 0, label: '第 1 條', text: '內容' }],
  badArticleLabels: [],
  ...over,
});

describe('validate', () => {
  it('一切正常時不 throw', () => {
    const map = new Map([['B0000001', raw()]]);
    expect(() => validate([entry('B0000001', '民法')], map)).not.toThrow();
  });

  it('PCode 不存在時 throw', () => {
    expect(() => validate([entry('X9999999', '不存在法')], new Map())).toThrow(
      /X9999999.*不存在/s
    );
  });

  it('法規已廢止時 throw', () => {
    const map = new Map([['B0000001', raw({ discarded: true })]]);
    expect(() => validate([entry('B0000001', '民法')], map)).toThrow(/已廢止/);
  });

  it('有無法解析的條號時 throw', () => {
    const map = new Map([['B0000001', raw({ badArticleLabels: ['1', '2'] })]]);
    expect(() => validate([entry('B0000001', '民法')], map)).toThrow(/無法解析的條號/);
  });

  it('沒有任何條文時 throw', () => {
    const map = new Map([['B0000001', raw({ blocks: [] })]]);
    expect(() => validate([entry('B0000001', '民法')], map)).toThrow(/沒有任何條文/);
  });

  it('一次列出全部問題,而非只報第一個', () => {
    const map = new Map([['B0000001', raw({ discarded: true })]]);
    const err = (() => {
      try {
        validate([entry('B0000001', '民法'), entry('X9999999', '不存在法')], map);
      } catch (e) {
        return (e as Error).message;
      }
    })();
    expect(err).toMatch(/已廢止/);
    expect(err).toMatch(/X9999999/);
    expect(err).toMatch(/2 項/);
  });
});
