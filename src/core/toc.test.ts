import { describe, it, expect } from 'vitest';
import { buildToc, tocPathTo, type TocDivision, type TocNode } from './toc';
import type { Block, Law } from './types';

function law(blocks: Block[]): Law {
  return {
    pcode: 'B0000001', name: '測試法', abbr: '測試法', aliases: [],
    group: '其他', updated: '20260817', history: '1.制定', blocks,
  };
}

const d = (level: number, label: string): Block => ({ t: 'd', level, label });
const a = (no: string): Block => ({
  t: 'a', no, main: Number(no), sub: 0, label: `第 ${no} 條`, text: `第${no}條內容。`,
});

/** 只看結構的輔助函式:把樹壓成 label(children) 的字串,方便一眼比對 */
function shape(nodes: TocNode[]): string {
  return nodes
    .map((n) => (n.t === 'a' ? n.label : `${n.label}[${shape(n.children)}]`))
    .join(' ');
}

describe('buildToc', () => {
  it('依 level 還原編 → 章 → 條的巢狀結構', () => {
    const toc = buildToc(law([
      d(0, '第 一 編 總則'),
      d(1, '第 一 章 法例'),
      a('1'),
      a('2'),
      d(1, '第 二 章 人'),
      a('6'),
    ]));

    expect(shape(toc)).toBe('第 一 編 總則[第 一 章 法例[第 1 條 第 2 條] 第 二 章 人[第 6 條]]');
  });

  it('條文掛在當前最深的區塊底下,不會漏掛到祖先', () => {
    const toc = buildToc(law([
      d(0, '編'),
      a('1'),          // 編底下、章之前的條文
      d(1, '章'),
      a('2'),
      d(2, '節'),
      a('3'),
    ]));

    expect(shape(toc)).toBe('編[第 1 條 章[第 2 條 節[第 3 條]]]');
  });

  it('回到較淺的層級時關閉所有更深的區塊', () => {
    const toc = buildToc(law([
      d(0, '第一編'),
      d(1, '第一章'),
      d(2, '第一節'),
      a('1'),
      d(0, '第二編'),   // 直接跳回編:章與節都要收掉
      a('2'),
    ]));

    expect(shape(toc)).toBe('第一編[第一章[第一節[第 1 條]]] 第二編[第 2 條]');
  });

  it('同一 level 的區塊互為兄弟,不會互相巢狀', () => {
    const toc = buildToc(law([d(1, '第一章'), a('1'), d(1, '第二章'), a('2')]));

    expect(shape(toc)).toBe('第一章[第 1 條] 第二章[第 2 條]');
  });

  it('完全沒有編章節的單行法:所有條文都在根', () => {
    const toc = buildToc(law([a('1'), a('2'), a('3')]));

    expect(toc).toHaveLength(3);
    expect(toc.every((n) => n.t === 'a')).toBe(true);
    expect(shape(toc)).toBe('第 1 條 第 2 條 第 3 條');
  });

  it('出現在任何區塊之前的條文掛在根,不會被之後的第一個區塊吸進去', () => {
    const toc = buildToc(law([a('1'), a('2'), d(0, '第一編'), a('3')]));

    expect(shape(toc)).toBe('第 1 條 第 2 條 第一編[第 3 條]');
  });

  it('level 跳階:編(0)直接到節(2),中間沒有章', () => {
    // 歸屬必須以 level 數值判斷,不可假設 level 逐一遞增——若用「巢狀深度」
    // 判斷,節(2)會被誤認成與編(0)同層或更淺,整棵樹就攤平了。
    const toc = buildToc(law([
      d(0, '第一編'),
      d(2, '第一節'),
      a('1'),
      d(2, '第二節'),
      a('2'),
      d(1, '第二章'),   // 跳階之後再回到中間層,節仍要正確收掉
      a('3'),
    ]));

    expect(shape(toc)).toBe('第一編[第一節[第 1 條] 第二節[第 2 條] 第二章[第 3 條]]');
  });

  it('跳階後的節仍掛在編底下,而不是被提到根', () => {
    const toc = buildToc(law([d(0, '編'), d(2, '節'), a('1')]));

    expect(toc).toHaveLength(1);
    const bian = toc[0] as TocDivision;
    expect(bian.children).toHaveLength(1);
    expect((bian.children[0] as TocDivision).level).toBe(2);
  });

  it('沒有任何 block 時回傳空陣列', () => {
    expect(buildToc(law([]))).toEqual([]);
  });

  it('節點帶得出 no 與 label(給 setReader 與顯示用),index 唯一', () => {
    const toc = buildToc(law([d(0, '編'), a('184'), a('184-1')]));
    const kids = (toc[0] as TocDivision).children;

    expect(kids.map((n) => (n.t === 'a' ? n.no : null))).toEqual(['184', '184-1']);
    expect(kids.map((n) => n.label)).toEqual(['第 184 條', '第 184-1 條']);
    // index 是在 law.blocks 中的位置:整部法規唯一,可直接當 React key 與展開狀態的識別
    expect(kids.map((n) => n.index)).toEqual([1, 2]);
  });
});

describe('tocPathTo', () => {
  const toc = buildToc(law([
    a('1'),                 // 區塊之前的條文
    d(0, '第一編'),
    d(2, '第一節'),         // 跳階
    a('2'),
    d(0, '第二編'),
    d(1, '第一章'),
    a('3'),
  ]));

  it('回傳從根到該條文所經過的每一個區塊 index', () => {
    // 第 3 條在 第二編(index 4)→ 第一章(index 5) 之下
    expect(tocPathTo(toc, '3')).toEqual([4, 5]);
  });

  it('跳階的路徑也完整回傳,不會漏掉中間的節', () => {
    expect(tocPathTo(toc, '2')).toEqual([1, 2]);
  });

  it('掛在根的條文回傳空路徑(不需要展開任何東西)', () => {
    expect(tocPathTo(toc, '1')).toEqual([]);
  });

  it('找不到該條文時回傳空陣列', () => {
    expect(tocPathTo(toc, '999')).toEqual([]);
  });
});
