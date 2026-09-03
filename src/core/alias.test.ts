import { describe, it, expect } from 'vitest';
import { AliasIndex, assertNoAliasConflicts, type LawEntry } from './alias';

const entries: LawEntry[] = [
  { pcode: 'B0000001', abbr: '民法', aliases: ['民'], group: '民法及關係法規' },
  { pcode: 'B0010001', abbr: '民事訴訟法', aliases: ['民訴'], group: '民事訴訟法及關係法規' },
  { pcode: 'C0000001', abbr: '刑法', aliases: ['刑'], group: '刑法及關係法規' },
  { pcode: 'C0010001', abbr: '刑事訴訟法', aliases: ['刑訴'], group: '刑事訴訟法及關係法規' },
  { pcode: 'D0060001', abbr: '土地法', aliases: ['土'], group: '民法及關係法規' },
];

describe('AliasIndex.match', () => {
  const idx = new AliasIndex(entries);

  it('最長匹配:民訴244 不可被解析成「民」+「訴244」', () => {
    expect(idx.match('民訴244')).toEqual({
      pcode: 'B0010001',
      rest: '244',
      spaced: false,
    });
  });

  it('單字別名', () => {
    expect(idx.match('民184')).toEqual({ pcode: 'B0000001', rest: '184', spaced: false });
  });

  it('完整名稱', () => {
    expect(idx.match('民事訴訟法244')).toEqual({
      pcode: 'B0010001',
      rest: '244',
      spaced: false,
    });
  });

  it('記錄前綴後方是否為空白', () => {
    expect(idx.match('民法 過失')).toEqual({
      pcode: 'B0000001',
      rest: '過失',
      spaced: true,
    });
  });

  it('剩餘為空', () => {
    expect(idx.match('民法')).toEqual({ pcode: 'B0000001', rest: '', spaced: false });
  });

  it('無匹配時回傳 null', () => {
    expect(idx.match('過失致死')).toBeNull();
  });

  it('刑訴優先於刑', () => {
    expect(idx.match('刑訴159')?.pcode).toBe('C0010001');
    expect(idx.match('刑271')?.pcode).toBe('C0000001');
  });
});

describe('assertNoAliasConflicts', () => {
  it('無衝突時不 throw', () => {
    expect(() => assertNoAliasConflicts(entries)).not.toThrow();
  });

  it('別名與別名衝突時 throw', () => {
    const bad = [
      ...entries,
      { pcode: 'X0000001', abbr: '民用航空法', aliases: ['民'], group: '其他' },
    ];
    expect(() => assertNoAliasConflicts(bad)).toThrow(/別名衝突/);
  });

  it('別名與他法 abbr 衝突時 throw', () => {
    const bad = [
      ...entries,
      { pcode: 'X0000002', abbr: '某法', aliases: ['民法'], group: '其他' },
    ];
    expect(() => assertNoAliasConflicts(bad)).toThrow(/別名衝突/);
  });
});
