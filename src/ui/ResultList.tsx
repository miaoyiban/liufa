import { useEffect, useRef } from 'react';
import type { ArticleResult, ResultGroup } from '../core/search';
import { Highlight } from './Highlight';

export function flatResults(groups: ResultGroup[]): ArticleResult[] {
  return groups.flatMap((g) => g.results);
}

type Props = {
  groups: ResultGroup[];
  selected: number;
  onSelect: (index: number) => void;
};

/**
 * 一次渲染的項目數上限。
 *
 * 這不是截斷:命中一條都沒有少,`flatResults`、摘要的命中數、鍵盤導覽的範圍
 * 全部維持完整清單,只有 DOM 節點數受限。單字查詢(「之」10,452 條、「人」
 * 7,260 條)全部展開是七、八萬個節點,而且依設計沒有 debounce,這個代價會
 * 付在每一次按鍵上——打「法院管轄」得先付一次 6,373 筆的渲染才輪到 129 筆。
 */
const WINDOW_SIZE = 100;

export function ResultList({ groups, selected, onSelect }: Props) {
  const selectedRef = useRef<HTMLLIElement>(null);

  // 讓鍵盤移動時選取項目始終可見(這是左欄自身的捲動,與右欄無關)
  useEffect(() => {
    if (selectedRef.current && typeof selectedRef.current.scrollIntoView === 'function') {
      selectedRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [selected]);

  // 視窗永遠延伸到目前選取的項目,否則方向鍵會走進沒有被渲染的區域。
  const limit = Math.max(WINDOW_SIZE, selected + 1);
  const total = groups.reduce((n, g) => n + g.results.length, 0);

  let index = -1;
  return (
    <ul className="results" role="listbox" aria-label="搜尋結果">
      {groups.map((g) => {
        const first = index + 1;
        index += g.results.length;
        const visible = first < limit ? g.results.slice(0, limit - first) : [];
        if (visible.length === 0) return null;
        return (
          <li key={g.pcode} className="group">
            <div className="group-title">
              {g.abbr}
              <span className="group-count">{g.results.length}</span>
            </div>
            <ul className="group-items">
              {visible.map((r, k) => {
                const i = first + k;
                const isSelected = i === selected;
                return (
                  <li
                    key={r.article.no}
                    ref={isSelected ? selectedRef : undefined}
                    role="option"
                    aria-selected={isSelected}
                    className={isSelected ? 'item item-selected' : 'item'}
                    onClick={() => onSelect(i)}
                  >
                    <div className="item-no">{r.article.label}</div>
                    <div className="item-text">
                      <Highlight text={r.article.text} hits={r.hits} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
      {total > limit && (
        <li className="results-more">
          尚有 {total - limit} 條未顯示,以方向鍵往下即可繼續
        </li>
      )}
    </ul>
  );
}
