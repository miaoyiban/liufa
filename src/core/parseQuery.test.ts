import { describe, it, expect } from 'vitest';
import { AliasIndex, type LawEntry } from './alias';
import { parseQuery } from './parseQuery';

const entries: LawEntry[] = [
  { pcode: 'B0000001', abbr: '民法', aliases: ['民'], group: '民法及關係法規' },
  { pcode: 'B0010001', abbr: '民事訴訟法', aliases: ['民訴'], group: '民事訴訟法及關係法規' },
  { pcode: 'C0000001', abbr: '刑法', aliases: ['刑'], group: '刑法及關係法規' },
  { pcode: 'D0060001', abbr: '土地法', aliases: ['土'], group: '民法及關係法規' },
];
const idx = new AliasIndex(entries);
const q = (s: string) => parseQuery(s, idx);

describe('parseQuery — 空查詢', () => {
  it('空字串', () => {
    expect(q('')).toEqual({ kind: 'empty' });
    expect(q('   ')).toEqual({ kind: 'empty' });
  });
});

describe('parseQuery — 只輸入法規名', () => {
  it('開啟該法規', () => {
    expect(q('民法')).toEqual({ kind: 'law', pcode: 'B0000001' });
  });
});

describe('parseQuery — 條號查詢', () => {
  const 民184 = { kind: 'article', pcode: 'B0000001', no: { main: 184, sub: 0 } };

  it('民184 / 民法184 / 民法 184 三種寫法等價', () => {
    expect(q('民184')).toEqual(民184);
    expect(q('民法184')).toEqual(民184);
    expect(q('民法 184')).toEqual(民184);
  });

  it('之一條的三種寫法等價', () => {
    const expected = { kind: 'article', pcode: 'B0000001', no: { main: 184, sub: 1 } };
    expect(q('民184-1')).toEqual(expected);
    expect(q('民法184之1')).toEqual(expected);
    expect(q('民§184-1')).toEqual(expected);
  });

  it('全形數字', () => {
    expect(q('民法１８４')).toEqual(民184);
  });

  it('「第 184 條」完整寫法', () => {
    expect(q('民法第184條')).toEqual(民184);
  });

  it('最長匹配:民訴244 是民事訴訟法', () => {
    expect(q('民訴244')).toEqual({
      kind: 'article',
      pcode: 'B0010001',
      no: { main: 244, sub: 0 },
    });
  });

  it('純數字:pcode 為 null,由呼叫端依 §5.5 解析', () => {
    expect(q('184')).toEqual({ kind: 'article', pcode: null, no: { main: 184, sub: 0 } });
  });
});

describe('parseQuery — 關鍵字查詢', () => {
  it('全域單一關鍵字', () => {
    expect(q('過失')).toEqual({ kind: 'keyword', pcode: null, terms: ['過失'] });
  });

  it('多關鍵字 AND', () => {
    expect(q('過失 傷害')).toEqual({ kind: 'keyword', pcode: null, terms: ['過失', '傷害'] });
  });

  it('限定法規:前綴後有空白', () => {
    expect(q('民法 過失')).toEqual({
      kind: 'keyword',
      pcode: 'B0000001',
      terms: ['過失'],
    });
  });
});

describe('parseQuery — bug guard(修正一):正規化不可套用在關鍵字上', () => {
  it('「第三人」不可被剝成「三人」', () => {
    expect(q('第三人')).toEqual({ kind: 'keyword', pcode: null, terms: ['第三人'] });
  });

  it('「條文」不可被剝成空字串', () => {
    expect(q('條文')).toEqual({ kind: 'keyword', pcode: null, terms: ['條文'] });
  });
});

describe('parseQuery — bug guard(修正二):前綴只在三種情況成立', () => {
  it('「民事責任」不可被剝成 民法 + 「事責任」', () => {
    expect(q('民事責任')).toEqual({ kind: 'keyword', pcode: null, terms: ['民事責任'] });
  });

  it('「土地登記」不可被剝成 土地法 + 「地登記」', () => {
    expect(q('土地登記')).toEqual({ kind: 'keyword', pcode: null, terms: ['土地登記'] });
  });

  it('「刑事政策」不可被剝成 刑法 + 「事政策」', () => {
    expect(q('刑事政策')).toEqual({ kind: 'keyword', pcode: null, terms: ['刑事政策'] });
  });
});
