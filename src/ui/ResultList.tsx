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

export function ResultList({ groups, selected, onSelect }: Props) {
  const selectedRef = useRef<HTMLLIElement>(null);

  // 讓鍵盤移動時選取項目始終可見(這是左欄自身的捲動,與右欄無關)
  useEffect(() => {
    if (selectedRef.current && typeof selectedRef.current.scrollIntoView === 'function') {
      selectedRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [selected]);

  let index = -1;
  return (
    <ul className="results" role="listbox" aria-label="搜尋結果">
      {groups.map((g) => (
        <li key={g.pcode} className="group">
          <div className="group-title">
            {g.abbr}
            <span className="group-count">{g.results.length}</span>
          </div>
          <ul className="group-items">
            {g.results.map((r) => {
              index += 1;
              const i = index;
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
      ))}
    </ul>
  );
}
