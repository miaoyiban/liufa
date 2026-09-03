import { useMemo, useState } from 'react';
import { useCorpus } from './useCorpus';
import { AliasIndex } from '../core/alias';
import { parseQuery } from '../core/parseQuery';
import { search } from '../core/search';
import type { Law } from '../core/types';
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

  const index = useMemo(() => new AliasIndex(corpus.laws), [corpus]);
  const outcome = useMemo(
    () => search(corpus, parseQuery(query, index), { currentPcode: reader?.pcode ?? null }),
    [corpus, query, index, reader?.pcode]
  );

  const law: Law | null = reader
    ? corpus.laws.find((l) => l.pcode === reader.pcode) ?? null
    : null;

  return (
    <div className="app">
      <div className="pane-left">
        <input
          className="search-input"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="民184 / 過失 / 民法 損害賠償"
          aria-label="搜尋法條"
        />
        <div className="result-scroll">
          {/* Task 12 填入結果清單 */}
          <div className="status">共 {outcome.totalArticles} 條命中</div>
        </div>
      </div>
      <div className="pane-right">
        {/* Task 13 填入閱讀區 */}
        {law ? <h1>{law.abbr}</h1> : <div className="status">輸入關鍵字或條號開始查詢</div>}
      </div>
    </div>
  );
}
