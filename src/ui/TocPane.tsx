import { useEffect, useMemo, useState } from 'react';
import { buildToc, tocPathTo, type TocDivision, type TocNode } from '../core/toc';
import type { Corpus, Law } from '../core/types';

type Target = { pcode: string; no: string };

type Props = {
  corpus: Corpus;
  /** 右欄目前正在讀的條文;用來決定目錄停在哪一部法規、展開到哪裡 */
  reader: Target | null;
  onOpen: (t: Target) => void;
};

/** 目錄目前的狀態:看的是哪一部法規(null = 法規清單),以及哪些區塊展開著。 */
type View = {
  pcode: string | null;
  /** 展開中的區塊,存 TocDivision.index(在 law.blocks 中的位置,整部法規唯一) */
  expanded: ReadonlySet<number>;
};

/**
 * 左欄「目錄」分頁:不打字也能從法規清單一路走到條文。
 *
 * 兩個層次共用同一個分頁——法規清單 →(選定一部)→ 該法的編章節樹。
 */
export function TocPane({ corpus, reader, onOpen }: Props) {
  const [view, setView] = useState<View>({ pcode: null, expanded: new Set() });

  // buildToc 對民法要走 1,578 個 block,而 reader 每動一次(搜尋時按方向鍵就會
  // 動)這個元件就重新 render 一次,所以按 pcode 快取,一部法規只還原一次樹。
  const tocCache = useMemo(() => new Map<string, TocNode[]>(), [corpus]);
  const tocOf = (pcode: string): TocNode[] => {
    const hit = tocCache.get(pcode);
    if (hit) return hit;
    const law = corpus.laws.find((l) => l.pcode === pcode);
    const toc = law ? buildToc(law) : [];
    tocCache.set(pcode, toc);
    return toc;
  };

  // 「開啟一部法規」的那一刻自動展開到目前正在讀的條文:從搜尋分頁切過來時,
  // 目錄應該停在正在讀的地方,而不是全部收合。
  //
  // 只在法規改變時作用。若每次 reader 一動就重算展開集合,使用者自己收起來的
  // 章節會被下一次右欄捲動硬展開回去——而且點編章節標題本身也會設定 reader,
  // 收合的那一下會立刻被自己觸發的展開抵銷,節點根本收不起來。
  useEffect(() => {
    if (!reader) return;
    setView((v) => (
      v.pcode === reader.pcode
        ? v
        : { pcode: reader.pcode, expanded: new Set(tocPathTo(tocOf(reader.pcode), reader.no)) }
    ));
    // tocOf 依賴 corpus,corpus 在本應用的生命週期內不會換掉(§不自動靜默更新)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reader?.pcode, reader?.no]);

  const openLaw = (pcode: string) => {
    setView((v) => (
      v.pcode === pcode
        ? v
        : {
          pcode,
          expanded: new Set(
            reader?.pcode === pcode ? tocPathTo(tocOf(pcode), reader.no) : []
          ),
        }
    ));
  };

  const law = view.pcode ? corpus.laws.find((l) => l.pcode === view.pcode) ?? null : null;

  if (!law) return <LawList corpus={corpus} onPick={openLaw} />;

  const toggle = (node: TocDivision) => {
    const isOpen = view.expanded.has(node.index);
    setView((v) => {
      const next = new Set(v.expanded);
      if (next.has(node.index)) next.delete(node.index); else next.add(node.index);
      return { pcode: v.pcode, expanded: next };
    });

    // 展開時順便把右欄捲到該節開頭——「標題本身也可點以捲到該節開頭」。捲動用的
    // 是既有的 targetNo 機制(設定該節的第一條),不另外造一套捲到 division 的
    // 路徑。收合時不捲:使用者要的是收起來,不是移動閱讀位置。
    if (!isOpen) {
      const first = firstArticleNo(node);
      if (first) onOpen({ pcode: law.pcode, no: first });
    }
  };

  return (
    <div className="toc">
      <button type="button" className="toc-back" onClick={() => setView({ pcode: null, expanded: new Set() })}>
        ← 返回法規清單
      </button>
      <div className="toc-title">{law.abbr}</div>
      <TocNodes
        nodes={tocOf(law.pcode)}
        depth={0}
        expanded={view.expanded}
        currentNo={reader?.pcode === law.pcode ? reader.no : null}
        onToggle={toggle}
        onOpenArticle={(no) => onOpen({ pcode: law.pcode, no })}
      />
    </div>
  );
}

function LawList({ corpus, onPick }: { corpus: Corpus; onPick: (pcode: string) => void }) {
  // group 值在 corpus 中是連續區塊,順序即分類順序(憲法/民法/…/其他),
  // 所以照著掃一遍就好——不重新排序,免得把來源刻意安排的順序打亂。
  const groups = useMemo(() => {
    const out: { group: string; laws: Law[] }[] = [];
    for (const l of corpus.laws) {
      const last = out[out.length - 1];
      if (last && last.group === l.group) last.laws.push(l);
      else out.push({ group: l.group, laws: [l] });
    }
    return out;
  }, [corpus]);

  return (
    <div className="toc">
      {groups.map((g) => (
        // key 用該分類第一部法規的 pcode:分類名稱本身若哪天在 corpus 中分成
        // 兩段不相鄰的區塊,用 group 當 key 就會撞號。
        <section key={g.laws[0]!.pcode}>
          <div className="toc-group">{g.group}</div>
          <ul className="toc-list">
            {g.laws.map((l) => (
              <li key={l.pcode}>
                <button type="button" className="toc-law" onClick={() => onPick(l.pcode)}>
                  {l.abbr}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function TocNodes({
  nodes, depth, expanded, currentNo, onToggle, onOpenArticle,
}: {
  nodes: TocNode[];
  depth: number;
  expanded: ReadonlySet<number>;
  currentNo: string | null;
  onToggle: (node: TocDivision) => void;
  onOpenArticle: (no: string) => void;
}) {
  // 縮排用 padding,不動 label 字串本身:編章節的前導空白是來源資料的一部分。
  const pad = { paddingLeft: `${0.6 + depth * 0.85}rem` };

  return (
    <ul className="toc-list">
      {nodes.map((n) => (
        <li key={n.index}>
          {n.t === 'a' ? (
            <button
              type="button"
              className={n.no === currentNo ? 'toc-article toc-current' : 'toc-article'}
              style={pad}
              aria-current={n.no === currentNo ? 'true' : undefined}
              onClick={() => onOpenArticle(n.no)}
            >
              {n.label}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="toc-division"
                style={pad}
                aria-expanded={expanded.has(n.index)}
                onClick={() => onToggle(n)}
              >
                {n.label}
              </button>
              {/* 懶展開是硬性要求:收合的節點完全不 render children。民法有
                  1,439 個條文葉節點,全展開就是重蹈 I1 的覆轍。 */}
              {expanded.has(n.index) && (
                <TocNodes
                  nodes={n.children}
                  depth={depth + 1}
                  expanded={expanded}
                  currentNo={currentNo}
                  onToggle={onToggle}
                  onOpenArticle={onOpenArticle}
                />
              )}
            </>
          )}
        </li>
      ))}
    </ul>
  );
}

/** 該區塊底下(含更深層)的第一條條文條號,用來把右欄捲到該節開頭。 */
function firstArticleNo(node: TocDivision): string | null {
  for (const c of node.children) {
    if (c.t === 'a') return c.no;
    const deeper = firstArticleNo(c);
    if (deeper) return deeper;
  }
  return null;
}
