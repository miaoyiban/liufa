/**
 * 筆記工具列的文字操作。純邏輯:輸入「目前的文字 + 選取範圍」,輸出「新的
 * 文字 + 新的選取範圍」,不碰 DOM、不碰 React。
 *
 * 游標位置和文字一樣是輸出的一部分。加粗之後如果選取沒跟著移動,使用者
 * 接著打的字會落在 ** 外面;移除前綴之後如果游標沒跟著退,它會停在被刪掉
 * 的字元上。這類事情只有把選取一起算出來才會對。
 */

export type Edit = { text: string; selStart: number; selEnd: number };

export type MarkdownAction =
  | 'bold' | 'italic' | 'heading' | 'bullet' | 'ordered' | 'quote' | 'link';

export function applyMarkdownAction(action: MarkdownAction, cur: Edit): Edit {
  switch (action) {
    case 'bold': return wrap('**', cur);
    case 'italic': return wrap('*', cur);
    case 'link': return link(cur);
    default: return prefix(action, cur);
  }
}

// ── 行內包裹(粗體、斜體)──────────────────────────────────────────

/**
 * 標記是否恰好貼在選取範圍外側。這是「剛加粗、重新選取該詞、再按一次」
 * 的情況 —— 使用者看到的是同一個詞,預期同一顆按鈕能關掉它。
 */
function wrappedOutside(text: string, s: number, e: number, m: string): boolean {
  if (s < m.length || e + m.length > text.length) return false;
  if (text.slice(s - m.length, s) !== m || text.slice(e, e + m.length) !== m) return false;
  // 單星要排除「這其實是 ** 的內側」:在 **過失** 裡選取 過失 按斜體,
  // 若誤判成解除斜體,會把粗體拆掉 —— 使用者按的是斜體,粗體不該消失。
  if (m === '*' && (text[s - 2] === '*' || text[e + 1] === '*')) return false;
  return true;
}

function wrap(m: string, { text, selStart: s, selEnd: e }: Edit): Edit {
  const sel = text.slice(s, e);

  // 標記在選取範圍內:整段連標記一起選起來時,解除包裹
  if (sel.length >= m.length * 2 && sel.startsWith(m) && sel.endsWith(m)) {
    const inner = sel.slice(m.length, sel.length - m.length);
    return { text: text.slice(0, s) + inner + text.slice(e), selStart: s, selEnd: s + inner.length };
  }

  if (wrappedOutside(text, s, e, m)) {
    return {
      text: text.slice(0, s - m.length) + sel + text.slice(e + m.length),
      selStart: s - m.length,
      selEnd: e - m.length,
    };
  }

  return {
    text: text.slice(0, s) + m + sel + m + text.slice(e),
    selStart: s + m.length,
    selEnd: e + m.length,
  };
}

// ── 行前綴(標題、清單、編號、引用)────────────────────────────────

/** 清單與編號互換時要先脫掉舊前綴,否則會疊成「1. - 行為」 */
const LIST_PREFIX = /^(?:[-*+] |\d+\. )/;
const len = (m: RegExpMatchArray | null) => m?.[0].length ?? 0;

type PrefixSpec = {
  /** 第 n 行(自 0 起)要加的前綴 */
  make: (n: number) => string;
  /** 這一行既有的「同類」前綴長度;0 代表沒有。用來判斷該加還是該移除 */
  match: (line: string) => number;
  /** 加前綴時要先脫掉的既有前綴長度。預設同 match */
  strip?: (line: string) => number;
};

const PREFIX: Record<'heading' | 'bullet' | 'ordered' | 'quote', PrefixSpec> = {
  heading: { make: () => '## ', match: (l) => (l.startsWith('## ') ? 3 : 0) },
  quote: { make: () => '> ', match: (l) => (l.startsWith('> ') ? 2 : 0) },
  bullet: {
    make: () => '- ',
    match: (l) => (l.startsWith('- ') ? 2 : 0),
    strip: (l) => len(l.match(LIST_PREFIX)),
  },
  ordered: {
    make: (n) => `${n + 1}. `,
    match: (l) => len(l.match(/^\d+\. /)),
    strip: (l) => len(l.match(LIST_PREFIX)),
  },
};

function prefix(kind: keyof typeof PREFIX, { text, selStart: s, selEnd: e }: Edit): Edit {
  const spec = PREFIX[kind];
  const strip = spec.strip ?? spec.match;

  // 選取涵蓋的整行範圍:從起始行的行首,到結束行的行尾
  const from = text.lastIndexOf('\n', s - 1) + 1;
  const nl = text.indexOf('\n', e);
  const to = nl === -1 ? text.length : nl;

  const lines = text.slice(from, to).split('\n');
  // 全部都已經有前綴才是「再按一次關掉」;只有部分有的時候是補齊,
  // 否則在混雜的清單上按一下會把已經標好的那幾行拆掉。
  const off = lines.every((l) => spec.match(l) > 0);

  let firstDelta = 0;
  let totalDelta = 0;
  const out = lines.map((line, n) => {
    const next = off
      ? line.slice(spec.match(line))
      : spec.make(n) + line.slice(strip(line));
    const d = next.length - line.length;
    if (n === 0) firstDelta = d;
    totalDelta += d;
    return next;
  });

  // 選取起點怎麼走,取決於使用者圈的是「這幾行」還是「這段文字」:
  //   多行且從行首開始 → 留在行首,把新前綴一起圈住。否則按第二次時選取
  //     已經不涵蓋完整的行,清單→編號→關掉這串連續操作就接不下去。
  //   單行選取或純游標 → 跟著位移。選的是一個詞,就讓那個詞還在選取裡;
  //     是游標,就讓它停在原本那個字元前面,而不是被插入的前綴上。
  const wholeLines = out.length > 1 && s === from;
  const newStart = wholeLines ? from : Math.max(from, s + firstDelta);
  return {
    text: text.slice(0, from) + out.join('\n') + text.slice(to),
    selStart: newStart,
    selEnd: Math.max(newStart, e + totalDelta),
  };
}

// ── 連結 ──────────────────────────────────────────────────────────

/**
 * 有選取時把它當連結文字,游標停進網址的括號 —— 接著要打的就是網址。
 * 沒選取時反過來,游標停在方括號內,先打文字。
 */
function link({ text, selStart: s, selEnd: e }: Edit): Edit {
  const sel = text.slice(s, e);
  const inserted = `[${sel}]()`;
  const caret = sel ? s + inserted.length - 1 : s + 1;
  return {
    text: text.slice(0, s) + inserted + text.slice(e),
    selStart: caret,
    selEnd: caret,
  };
}

// ── 最小改動區間 ──────────────────────────────────────────────────

/**
 * 找出 a → b 之間實際改動的最小區間:把 a 的 [start, endA) 換成 insert
 * 就會得到 b。
 *
 * 用途是保住 textarea 的原生 undo:直接設 value 會把 undo stack 清掉,
 * 使用者按 Cmd+Z 救不回工具列做的修改。只有「選起改動的那一段、再用
 * insertText 覆蓋」才會被瀏覽器記進 undo,而那需要知道改了哪一段。
 */
export function diffRange(a: string, b: string): { start: number; endA: number; insert: string } {
  const max = Math.min(a.length, b.length);
  let start = 0;
  while (start < max && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  return { start, endA, insert: b.slice(start, endB) };
}
