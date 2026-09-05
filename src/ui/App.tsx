import { useEffect, useMemo, useRef, useState } from 'react';
import { useCorpus } from './useCorpus';
import { AliasIndex } from '../core/alias';
import { parseQuery } from '../core/parseQuery';
import { search } from '../core/search';
import { ResultList, flatResults } from './ResultList';
import { ReaderPane } from './ReaderPane';
import { useKeyboard } from './useKeyboard';
import { useLawDb, useNotes } from './useLawDb';
import type { Law } from '../core/types';
import type { Hit } from '../core/search';
import './app.css';

export type ReaderTarget = { pcode: string; no: string } | null;

export function App() {
  const status = useCorpus();

  if (status.state === 'loading') {
    return <div className="status">載入法規資料中…</div>;
  }
  if (status.state === 'error') {
    return (
      <div className="status status-error">
        法規資料載入失敗:{status.message}
        <br />
        請確認已執行 <code>npm run data</code>。
      </div>
    );
  }
  return <Workspace corpus={status.corpus} />;
}

function Workspace({ corpus }: { corpus: import('../core/types').Corpus }) {
  const [query, setQuery] = useState('');
  const [reader, setReader] = useState<ReaderTarget>(null);
  const [selected, setSelected] = useState(0);
  const db = useLawDb();
  const { notes, reload: reloadNotes } = useNotes(db);

  const index = useMemo(() => new AliasIndex(corpus.laws), [corpus]);
  const outcome = useMemo(
    () => search(corpus, parseQuery(query, index), { currentPcode: reader?.pcode ?? null }),
    [corpus, query, index, reader?.pcode]
  );

  const flat = useMemo(() => flatResults(outcome.groups), [outcome]);

  useEffect(() => { setSelected(0); }, [query]);

  const law: Law | null = reader
    ? corpus.laws.find((l) => l.pcode === reader.pcode) ?? null
    : null;

  const hitsByNo = useMemo(() => {
    const m = new Map<string, Hit[]>();
    if (!reader) return m;
    for (const g of outcome.groups) {
      if (g.pcode !== reader.pcode) continue;
      for (const r of g.results) m.set(r.article.no, r.hits);
    }
    return m;
  }, [outcome, reader]);

  const inputRef = useRef<HTMLInputElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);

  // 單向同步:選取變動 → 右欄跟隨。右欄自行捲動時「不」回頭改變選取,
  // 否則往下讀兩頁鄰近條文,左欄選取會一路跳動。
  useEffect(() => {
    const r = flat[selected];
    if (r) setReader({ pcode: r.pcode, no: r.article.no });
  }, [flat, selected]);

  // 條號查詢的直接跳轉
  useEffect(() => {
    if (outcome.jumpTo) setReader(outcome.jumpTo);
  }, [outcome.jumpTo?.pcode, outcome.jumpTo?.no]);

  const jumpDivision = (dir: -1 | 1) => {
    const divisions = readerRef.current?.querySelectorAll('.division');
    if (!divisions?.length) return;
    const top = readerRef.current!.scrollTop;
    const list = [...divisions] as HTMLElement[];
    const next = dir === 1
      ? list.find((d) => d.offsetTop > top + 4)
      : [...list].reverse().find((d) => d.offsetTop < top - 4);
    next?.scrollIntoView({ block: 'start' });
  };

  useKeyboard({
    count: flat.length,
    selected,
    onMove: setSelected,
    onEnter: () => readerRef.current?.focus(),
    onEscape: () => {
      if (query) setQuery('');
      inputRef.current?.focus();
    },
    onDivision: jumpDivision,
    onBookmark: () => { /* Task 16 接上書籤 */ },
  });

  return (
    <div className="app">
      <div className="pane-left">
        <input
          ref={inputRef}
          className="search-input"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="民184 / 過失 / 民法 損害賠償"
          aria-label="搜尋法條"
        />
        <div className="result-scroll">
          {outcome.totalArticles > 0 && (
            <div className="summary">
              共 {outcome.totalArticles} 條命中,分布於 {outcome.totalLaws} 部法規
            </div>
          )}
          {outcome.diagnosis && (
            <div className="diagnosis">
              「{outcome.diagnosis.term}」無命中,移除後有 {outcome.diagnosis.remaining} 條
            </div>
          )}
          <ResultList groups={outcome.groups} selected={selected} onSelect={setSelected} />
        </div>
      </div>
      <div className="pane-right" ref={readerRef} tabIndex={-1}>
        <ReaderPane
          law={law}
          targetNo={reader?.no ?? null}
          hitsByNo={hitsByNo}
          notes={notes}
          db={db}
          onNoteSaved={reloadNotes}
        />
      </div>
    </div>
  );
}
