import { useEffect, useMemo, useRef, useState } from 'react';
import { useCorpus } from './useCorpus';
import { AliasIndex } from '../core/alias';
import { parseQuery } from '../core/parseQuery';
import { search } from '../core/search';
import { ResultList, flatResults } from './ResultList';
import { ReaderPane } from './ReaderPane';
import { SidePanel } from './SidePanel';
import { useKeyboard } from './useKeyboard';
import { useLawDb, useNotes } from './useLawDb';
import { addHistory, toggleBookmark } from '../store/db';
import { UpdateBanner, DataVersion } from './UpdateBanner';
import type { Law } from '../core/types';
import type { Hit } from '../core/search';
import './app.css';

export type ReaderTarget = { pcode: string; no: string } | null;

// Service Worker 偵測到新版時透過此訂閱點通知目前掛載的 Workspace。
// 不自動靜默更新:只標記狀態,重新載入與否由使用者在 UpdateBanner 決定。
let notifyUpdate: ((v: boolean) => void) | null = null;
export function setUpdateAvailable(v: boolean) { notifyUpdate?.(v); }

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
  // 書籤變動後用來強制 SidePanel 重新掛載、重新讀取清單(見下方 onBookmark)。
  const [dbVersion, setDbVersion] = useState(0);
  const [updateReady, setUpdateReady] = useState(false);
  const db = useLawDb();
  const { notes, reload: reloadNotes } = useNotes(db);

  useEffect(() => {
    notifyUpdate = setUpdateReady;
    return () => { notifyUpdate = null; };
  }, []);

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
    onEnter: () => {
      readerRef.current?.focus();
      // 有實際查詢字串且已定位到條文時才留下歷史紀錄,避免空查詢或
      // 尚未跳轉時寫入沒有意義的紀錄。
      if (db && reader && query) {
        addHistory(db, { ts: Date.now(), query, pcode: reader.pcode, no: reader.no })
          .catch((err) => console.error('寫入最近查詢失敗', err));
      }
    },
    onEscape: () => {
      if (query) setQuery('');
      inputRef.current?.focus();
    },
    onDivision: jumpDivision,
    onBookmark: () => {
      if (!db || !reader) return;
      toggleBookmark(db, reader.pcode, reader.no)
        .then(() => setDbVersion((v) => v + 1))
        .catch((err) => console.error('切換書籤失敗', err));
    },
  });

  return (
    <div className="app">
      <div className="pane-left">
        <UpdateBanner visible={updateReady} onReload={() => location.reload()} />
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
          {query === '' ? (
            <SidePanel key={dbVersion} db={db} corpus={corpus} onOpen={setReader} />
          ) : (
            <>
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
            </>
          )}
        </div>
        <DataVersion sourceUpdatedAt={corpus.sourceUpdatedAt} />
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
