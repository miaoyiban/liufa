import type { Law } from './types';

/**
 * 導覽目錄的樹節點。`t` 沿用 Block 的辨別欄位('d' 區塊 / 'a' 條文),讓
 * UI 用同一套直覺區分兩種節點。
 *
 * `index` 是該節點在 `law.blocks` 中的位置:整部法規唯一且穩定,直接拿來當
 * React key 與「哪些節點展開了」的識別,不必另外造 id,也不會因為同名章節
 * (例如民法有多個「第 一 章 通則」)而互相混淆。
 */
export type TocDivision = {
  t: 'd';
  index: number;
  level: number;
  label: string;
  children: TocNode[];
};

export type TocArticle = {
  t: 'a';
  index: number;
  /** 正規化條號,直接交給 setReader */
  no: string;
  /** 顯示用原文,如「第 184 條」 */
  label: string;
};

export type TocNode = TocDivision | TocArticle;

/**
 * 把扁平的 `law.blocks` 依 level 還原成巢狀樹。
 *
 * 歸屬一律以 **level 數值** 判斷,不是巢狀深度:有 59 部法規的層級會跳階
 * (最常見的是編直接到節,中間沒有章),用深度判斷會把跳階處的樹攤平。
 *
 * 條文掛在當前最深的區塊底下;出現在任何區塊之前的條文——以及完全沒有編章節
 * 的單行法的全部條文——直接掛在根。
 */
export function buildToc(law: Law): TocNode[] {
  const roots: TocNode[] = [];
  // 目前開啟中的區塊,由淺到深。level 嚴格遞增(見下方 pop 條件)。
  const open: TocDivision[] = [];

  const push = (node: TocNode) => {
    const parent = open[open.length - 1];
    (parent ? parent.children : roots).push(node);
  };

  law.blocks.forEach((b, index) => {
    if (b.t === 'd') {
      // 收掉所有「不比新區塊淺」的區塊:同層的變兄弟,更深的結束。
      while (open.length > 0 && open[open.length - 1]!.level >= b.level) open.pop();
      const node: TocDivision = { t: 'd', index, level: b.level, label: b.label, children: [] };
      push(node);
      open.push(node);
    } else {
      push({ t: 'a', index, no: b.no, label: b.label });
    }
  });

  return roots;
}

/**
 * 找出某條文所在的路徑,回傳沿途每一個區塊的 index。
 *
 * 給「開啟一部法規時自動展開到目前正在讀的條文」用:把回傳的 index 全部標成
 * 展開即可。條文掛在根時回傳空陣列(不需要展開任何東西),找不到亦然。
 */
export function tocPathTo(nodes: TocNode[], no: string): number[] {
  return search(nodes, no) ?? [];
}

/**
 * 回傳路徑,找不到則回傳 null——不能用空陣列代表「找不到」,因為空陣列同時
 * 也是「條文就掛在根、不必展開任何區塊」這個合法答案。
 */
function search(nodes: TocNode[], no: string): number[] | null {
  for (const n of nodes) {
    if (n.t === 'a') {
      if (n.no === no) return [];
      continue;
    }
    const rest = search(n.children, no);
    if (rest) return [n.index, ...rest];
  }
  return null;
}
