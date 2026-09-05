import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { search } from './search';
import type { Corpus, Law, Block } from './types';
import type { Query } from './parseQuery';

function art(no: string, text: string): Block {
  const [main, sub] = no.split('-');
  return {
    t: 'a', no, main: Number(main), sub: sub ? Number(sub) : 0,
    label: `第 ${no} 條`, text,
  };
}

function law(pcode: string, abbr: string, group: string, blocks: Block[]): Law {
  return {
    pcode, name: abbr, abbr, aliases: [], group,
    updated: '20260101', history: '', blocks,
  };
}

const corpus: Corpus = {
  sourceUpdatedAt: '2026/8/21',
  builtAt: '2026-09-03T00:00:00.000Z',
  laws: [
    law('A0000001', '憲法', '憲法及關係法規', [
      art('8', '人民身體之自由應予保障。'),
      art('184', '憲法沒有這條,測試用。'),
    ]),
    law('B0000001', '民法', '民法及關係法規', [
      { t: 'd', level: 0, label: '第 二 編 債' },
      art('184', '因故意或過失，不法侵害他人之權利者,負損害賠償責任。'),
      art('184-1', '之一條測試,過失。'),
      art('185', '數人共同不法侵害他人之權利者。'),
      art('191', '過失過失過失,損害。'),
    ]),
    law('C0000001', '刑法', '刑法及關係法規', [
      art('271', '殺人者,處死刑。'),
      art('284', '因過失傷害人者。'),
    ]),
  ],
};

const noCtx = { currentPcode: null };

describe('search — 空查詢與法規查詢', () => {
  it('空查詢回傳空結果', () => {
    const out = search(corpus, { kind: 'empty' }, noCtx);
    expect(out.groups).toEqual([]);
    expect(out.totalArticles).toBe(0);
  });

  it('只輸入法規名 → 跳到該法第一條', () => {
    const out = search(corpus, { kind: 'law', pcode: 'B0000001' }, noCtx);
    expect(out.jumpTo).toEqual({ pcode: 'B0000001', no: '184' });
  });
});

describe('search — 條號查詢', () => {
  it('指定法規時直接跳轉', () => {
    const q: Query = { kind: 'article', pcode: 'B0000001', no: { main: 184, sub: 0 } };
    const out = search(corpus, q, noCtx);
    expect(out.jumpTo).toEqual({ pcode: 'B0000001', no: '184' });
    expect(out.totalArticles).toBe(1);
    expect(out.groups[0]!.results[0]!.article.no).toBe('184');
  });

  it('之一條可查', () => {
    const q: Query = { kind: 'article', pcode: 'B0000001', no: { main: 184, sub: 1 } };
    expect(search(corpus, q, noCtx).jumpTo).toEqual({ pcode: 'B0000001', no: '184-1' });
  });

  it('條號不存在時回傳空結果', () => {
    const q: Query = { kind: 'article', pcode: 'B0000001', no: { main: 9999, sub: 0 } };
    expect(search(corpus, q, noCtx).totalArticles).toBe(0);
  });

  it('§5.5 情境一:已開啟法規時,純數字在該法內查', () => {
    const q: Query = { kind: 'article', pcode: null, no: { main: 271, sub: 0 } };
    const out = search(corpus, q, { currentPcode: 'C0000001' });
    expect(out.jumpTo).toEqual({ pcode: 'C0000001', no: '271' });
  });

  it('§5.5 情境二:未開啟法規時,列出六法核心的候選', () => {
    const q: Query = { kind: 'article', pcode: null, no: { main: 184, sub: 0 } };
    const out = search(corpus, q, noCtx);
    expect(out.groups.map((g) => g.pcode)).toEqual(['A0000001', 'B0000001']);
    expect(out.jumpTo).toBeUndefined();
  });
});

describe('search — 關鍵字查詢', () => {
  it('全域搜尋,結果依法規分組', () => {
    const q: Query = { kind: 'keyword', pcode: null, terms: ['過失'] };
    const out = search(corpus, q, noCtx);
    expect(out.groups.map((g) => g.abbr)).toEqual(['民法', '刑法']);
    expect(out.totalArticles).toBe(4);
    expect(out.totalLaws).toBe(2);
  });

  it('分組順序依 corpus 中的法規順序,不依命中數', () => {
    const q: Query = { kind: 'keyword', pcode: null, terms: ['過失'] };
    const out = search(corpus, q, noCtx);
    // 刑法只有 1 條命中、民法有 3 條,但民法在前,因為分類順序在前
    expect(out.groups[0]!.abbr).toBe('民法');
  });

  it('組內排序:命中次數多者優先,其次條號由小到大', () => {
    const q: Query = { kind: 'keyword', pcode: null, terms: ['過失'] };
    const out = search(corpus, q, noCtx);
    // 191 有 3 次命中,184 與 184-1 各 1 次
    expect(out.groups[0]!.results.map((r) => r.article.no)).toEqual([
      '191', '184', '184-1',
    ]);
  });

  it('限定法規搜尋', () => {
    const q: Query = { kind: 'keyword', pcode: 'C0000001', terms: ['過失'] };
    const out = search(corpus, q, noCtx);
    expect(out.totalLaws).toBe(1);
    expect(out.groups[0]!.abbr).toBe('刑法');
  });

  it('多 term AND', () => {
    const q: Query = { kind: 'keyword', pcode: null, terms: ['過失', '損害'] };
    const out = search(corpus, q, noCtx);
    expect(out.totalArticles).toBe(2); // 民法 184 與 191
  });

  it('攜帶高亮位置', () => {
    const q: Query = { kind: 'keyword', pcode: null, terms: ['過失'] };
    const out = search(corpus, q, noCtx);
    const r = out.groups[0]!.results.find((x) => x.article.no === '191')!;
    expect(r.hits).toHaveLength(3);
  });

  it('結果不截斷', () => {
    const many = Array.from({ length: 500 }, (_, i) => art(String(i + 1), '過失'));
    const big: Corpus = { ...corpus, laws: [law('Z0000001', '測試法', '其他', many)] };
    const q: Query = { kind: 'keyword', pcode: null, terms: ['過失'] };
    expect(search(big, q, noCtx).totalArticles).toBe(500);
  });
});

describe('search — 零結果診斷', () => {
  it('指出造成零命中的 term 與移除後的命中數', () => {
    const q: Query = { kind: 'keyword', pcode: null, terms: ['過失', '緊急避難'] };
    const out = search(corpus, q, noCtx);
    expect(out.totalArticles).toBe(0);
    expect(out.diagnosis).toEqual({ term: '緊急避難', remaining: 4 });
  });

  it('單一 term 零命中時不做診斷(無可移除者)', () => {
    const q: Query = { kind: 'keyword', pcode: null, terms: ['緊急避難'] };
    const out = search(corpus, q, noCtx);
    expect(out.diagnosis).toBeUndefined();
  });

  it('全部 term 各自都零命中時不做診斷', () => {
    const q: Query = { kind: 'keyword', pcode: null, terms: ['甲甲甲', '乙乙乙'] };
    expect(search(corpus, q, noCtx).diagnosis).toBeUndefined();
  });

  it('重複的 term 依索引排除,不會報出「移除一個就有 N 條」這種做不到的數字', () => {
    // 「甲甲甲」零命中。移除其中一個之後另一個還在,命中數仍是 0,所以沒有
    // 任何單一 term 值得回報。依「值」排除會一次拿掉兩個,於是宣告
    // 「『甲甲甲』無命中,移除後有 4 條」——那 4 條是使用者照做也拿不到的。
    // §6.3:印出錯誤的數字比不印更危險。
    const q: Query = { kind: 'keyword', pcode: null, terms: ['甲甲甲', '甲甲甲', '過失'] };
    expect(search(corpus, q, noCtx).diagnosis).toBeUndefined();
  });
});

describe('search — 空結果單例不可變', () => {
  // 空結果由模組級單例提供,連 `{ ...EMPTY, jumpTo }` 的淺拷貝也共用同一個
  // groups 陣列。目前沒有人就地變動它,但真的有人 push 進去,污染會擴散到
  // 其他每一個空結果,而且完全不出聲。凍結起來讓這件事永遠不可能發生。
  it('空查詢、查無條號、法規跳轉三者共用同一個已凍結的 groups', () => {
    const empty = search(corpus, { kind: 'empty' }, noCtx);
    const missing = search(
      corpus, { kind: 'article', pcode: 'B0000001', no: { main: 9999, sub: 0 } }, noCtx
    );
    const jump = search(corpus, { kind: 'law', pcode: 'B0000001' }, noCtx);

    expect(missing.groups).toBe(empty.groups);
    expect(jump.groups).toBe(empty.groups);
    expect(Object.isFrozen(empty.groups)).toBe(true);
    expect(() => empty.groups.push({ pcode: 'X', abbr: 'X', results: [] })).toThrow();
    expect(empty.groups).toHaveLength(0);
  });
});

describe('search — 真實語料', () => {
  const PATH = 'public/corpus.json';
  // 這裡刻意不斷言耗時。牆鐘時間在 CI 的共用機器上本來就會抖動,而這條測試
  // 是部署的關卡,一次抖動就是一次部署失敗;§11 的效能數字以手動實測為準。
  // 這條測試守的是「最壞情況查詢在真實語料上仍然回得出完整結果」。
  it.skipIf(!existsSync(PATH))('最壞情況查詢在真實語料上回傳完整結果', () => {
    const real = JSON.parse(readFileSync(PATH, 'utf8')) as Corpus;
    const q: Query = { kind: 'keyword', pcode: null, terms: ['之'] };
    const out = search(real, q, noCtx);
    expect(out.totalArticles).toBeGreaterThan(5000);
    expect(out.groups.reduce((n, g) => n + g.results.length, 0)).toBe(out.totalArticles);
  });
});
