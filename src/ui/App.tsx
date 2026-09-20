import { useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useCorpus } from './useCorpus';
import { AliasIndex } from '../core/alias';
import { parseQuery } from '../core/parseQuery';
import { search } from '../core/search';
import { ResultList, flatResults } from './ResultList';
import { ReaderPane } from './ReaderPane';
import { SidePanel } from './SidePanel';
import { TocPane } from './TocPane';
import { useKeyboard } from './useKeyboard';
import { useBookmarks, useLawDb, useNotes } from './useLawDb';
import { addHistory, toggleBookmark } from '../store/db';
import { UpdateBanner, DataVersion } from './UpdateBanner';
import type { Law } from '../core/types';
import type { Hit } from '../core/search';
import './app.css';

export type ReaderTarget = { pcode: string; no: string } | null;

/**
 * `[`/`]` 只跳編、章(level ≤ 1),不跳節、款、目——這些層級太密集(民法
 * 1,578 個 block 裡 139 個 division,節/款密集處相鄰 division 常只隔一兩條,
 * 按起來就像逐條跳,不是逐章節跳)。輸入每個 `.division` 節點的 level,回傳
 * 應該納入跳轉目標的索引。
 */
export function divisionJumpTargets(levels: number[]): number[] {
  const targets: number[] = [];
  levels.forEach((level, i) => {
    if (level <= 1) targets.push(i);
  });
  return targets;
}

// Service Worker 偵測到新版時透過此訂閱點通知目前掛載的 Workspace。
// 不自動靜默更新:只標記狀態,重新載入與否由使用者在 UpdateBanner 決定。
let notifyUpdate: ((v: boolean) => void) | null = null;
export function setUpdateAvailable(v: boolean) { notifyUpdate?.(v); }

// main.tsx 把「送出 skip-waiting 訊息、啟用等待中的新 Service Worker」的函式
// 放進這裡。UpdateBanner 按下重新載入時呼叫的正是這個函式,而不是單純的
// location.reload()——單純重新整理不會啟用新的 worker,拿到的仍是舊 worker
// 快取的舊版內容,使用者按了按鈕卻什麼都沒變。
let performUpdate: (() => void) | null = null;
export function setUpdateHandler(fn: (() => void) | null) { performUpdate = fn; }

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

/** 左欄分頁:搜尋與目錄並存,不是「查詢框空的時候才出現目錄」。 */
type Tab = 'search' | 'toc';

function Workspace({ corpus }: { corpus: import('../core/types').Corpus }) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('search');
  // 收合只是視野調整,不留存:重開一律是展開的,不會有人下次打開發現左欄不見
  // 了,卻想不起來是自己上次收的。
  const [collapsed, setCollapsed] = useState(false);
  const [reader, setReader] = useState<ReaderTarget>(null);
  const [selected, setSelected] = useState(0);
  // 書籤變動後用來強制 SidePanel 重新掛載、重新讀取清單(見下方 onBookmark)。
  const [dbVersion, setDbVersion] = useState(0);
  const [updateReady, setUpdateReady] = useState(false);
  // Cmd+D 的結果回報。書籤是個開關,不說一聲的話使用者無從得知自己剛剛是
  // 加入還是移除,db/reader 不存在時更是按了完全沒有反應。
  const [notice, setNotice] = useState('');
  const db = useLawDb();
  const { notes, reload: reloadNotes } = useNotes(db);
  const { bookmarks, reload: reloadBookmarks } = useBookmarks(db);

  useEffect(() => {
    notifyUpdate = setUpdateReady;
    return () => { notifyUpdate = null; };
  }, []);

  // 閱讀脈絡的法規只在查詢字串變動的那一刻快照一次,不即時跟著 reader 走。
  // 即時讀 reader 會構成單向塌縮:outcome 讀 reader → 下方的 effect 又從
  // outcome 寫 reader,於是「未開啟法規時列出六法候選」(§5.5 情境二)在第一次
  // 重新算 outcome 時就被自己的第一筆結果改判成「已開啟法規」,候選清單塌成
  // 一組,方向鍵再也走不到其餘候選,摘要還會宣告錯誤的命中數。
  // 快照後的語意才是 §5.5 情境一 原本要的:「使用者開始打這個查詢時正在讀的法規」。
  const [ctxPcode, setCtxPcode] = useState<string | null>(null);
  useEffect(() => {
    setCtxPcode(reader?.pcode ?? null);
    // 只在 query 變動時取樣;把 reader 放進 deps 就等於恢復上述的塌縮。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const index = useMemo(() => new AliasIndex(corpus.laws), [corpus]);
  const outcome = useMemo(
    () => search(corpus, parseQuery(query, index), { currentPcode: ctxPcode }),
    [corpus, query, index, ctxPcode]
  );

  const flat = useMemo(() => flatResults(outcome.groups), [outcome]);

  useEffect(() => { setSelected(0); }, [query]);

  // C1:候選不只一部法規時,絕不能把搜尋結果的第一筆自動寫進 reader——那正是
  // 「系統替使用者猜法規」,猜錯時使用者看到條號正確但法規錯誤的條文,課堂上
  // 難以察覺(同一原則見 src/core/search.ts)。只有候選收斂到唯一一部法規時
  // 才沒有猜的問題,可以放心確認為 reader、成為下一次查詢的脈絡(§5.5 情境一)。
  // 依賴只放 outcome:使用者移動選取(見下方 selectAndFollow)不會讓 outcome
  // 重新計算,不會誤觸這裡——兩種寫入 reader 的路徑因此不會互相干擾。
  useEffect(() => {
    if (outcome.totalLaws === 1) {
      const r = outcome.groups[0]?.results[0];
      if (r) setReader({ pcode: r.pcode, no: r.article.no });
    }
  }, [outcome]);

  // 候選不只一部法規時,右欄仍要「預覽」目前選取的候選(對應左欄預設反白的
  // 第一筆),但這個預覽只用來顯示,不寫回 reader、不會成為下一次查詢的
  // 脈絡——這正是不讓右欄預覽污染 ctxPcode 的關鍵。已經有 reader(不論是唯一
  // 候選自動確認、條號/法規查詢的明確跳轉,還是使用者主動選取的結果)時,
  // 顯示 reader 本身,不被這裡的預覽蓋過。
  const previewTarget = flat[selected];
  const displayTarget: ReaderTarget = reader
    ?? (previewTarget ? { pcode: previewTarget.pcode, no: previewTarget.article.no } : null);

  const law: Law | null = displayTarget
    ? corpus.laws.find((l) => l.pcode === displayTarget.pcode) ?? null
    : null;

  const hitsByNo = useMemo(() => {
    const m = new Map<string, Hit[]>();
    if (!displayTarget) return m;
    for (const g of outcome.groups) {
      if (g.pcode !== displayTarget.pcode) continue;
      for (const r of g.results) m.set(r.article.no, r.hits);
    }
    return m;
  }, [outcome, displayTarget]);

  const inputRef = useRef<HTMLInputElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);

  // §7.2「焦點預設永遠在搜尋框,開啟即可打字」在收合狀態下會斷掉:搜尋框位在
  // hidden 的子樹裡,focus() 對它完全無效,接著打的字靜默消失——正是 §7.2 當初
  // 修掉的那個 bug。所以凡是要把焦點交回搜尋框的路徑,收合時都先展開。
  //
  // 用 flushSync 而不是交給 React 自己排程:useKeyboard 掛的是原生 window
  // 監聽器且刻意不 preventDefault,靠的是「這個字元本身會落進剛聚焦的搜尋框」。
  // 展開若慢一個 tick,focus() 執行時搜尋框還在 hidden 裡,第一個字照樣掉。
  const focusSearch = () => {
    if (collapsed) flushSync(() => setCollapsed(false));
    inputRef.current?.focus();
  };

  // 使用者主動選取(方向鍵移動或點擊清單項目)才讓右欄跟隨並成為之後查詢的
  // 脈絡——即使候選不只一部,這是使用者自己選的,不是系統拿第一筆亂猜。
  // 右欄自行捲動時「不」回頭改變選取,否則往下讀兩頁鄰近條文,左欄選取會
  // 一路跳動。
  const selectAndFollow = (i: number) => {
    setSelected(i);
    const r = flat[i];
    if (r) setReader({ pcode: r.pcode, no: r.article.no });
  };

  // 條號查詢的直接跳轉
  useEffect(() => {
    if (outcome.jumpTo) setReader(outcome.jumpTo);
  }, [outcome.jumpTo?.pcode, outcome.jumpTo?.no]);

  const jumpDivision = (dir: -1 | 1) => {
    const divisions = readerRef.current?.querySelectorAll('.division');
    if (!divisions?.length) return;
    const top = readerRef.current!.scrollTop;
    const list = [...divisions] as HTMLElement[];
    const levels = list.map((d) => Number(d.dataset.level ?? '0'));
    const targets = divisionJumpTargets(levels)
      .map((i) => list[i])
      .filter((d): d is HTMLElement => d !== undefined);
    if (!targets.length) return;
    const next = dir === 1
      ? targets.find((d) => d.offsetTop > top + 4)
      : [...targets].reverse().find((d) => d.offsetTop < top - 4);
    next?.scrollIntoView({ block: 'start' });
  };

  useKeyboard({
    // 目錄分頁沒有「候選清單」這回事,方向鍵無處可移。count 給 0 讓
    // useKeyboard 直接放行方向鍵,否則按上下會移動一個看不見的搜尋選取,
    // 右欄卻莫名其妙地跳條文。其餘鍵位在兩個分頁下的意義相同,維持原樣:
    // `[`/`]` 跳右欄的編章、Cmd+D 對右欄顯示中的條文加書籤(從目錄點開一條
    // 後正想做的事)、Escape 與可列印字元把焦點交回搜尋框。
    count: tab === 'search' ? flat.length : 0,
    selected,
    onMove: selectAndFollow,
    onEnter: () => {
      readerRef.current?.focus();
      // 這裡**刻意沒有** setReader。Enter 的定義只有一件事:焦點移至右欄,
      // 進入閱讀(§7.2)。它不決定脈絡法規,一次也不。
      //
      // 理由:Enter 不帶任何「使用者指的是四部候選裡的哪一部」的資訊。民法
      // 排第一只是因為 search.ts 依分類順序回傳。在這裡寫 reader,等於讓系統
      // 拿按鍵當掩護替使用者猜法規;猜完會經由 ctxPcode 靜默收窄之後的每一個
      // 查詢(且 Escape 清不掉 reader),下一個純數字查詢就少報候選,摘要卻
      // 照樣理直氣壯——那正是 C1 的病灶。這條路曾經被加回來過一次,別再加。
      //
      // reader 的合法來源只有兩類,都不在這個 handler 裡(§5.5.1):
      //   - 唯一候選自動確認:上方 totalLaws === 1 的 effect,以及條號/法規
      //     查詢的 jumpTo——此時沒有可猜之處
      //   - 使用者主動選取:方向鍵/點擊清單(selectAndFollow)、目錄分頁點條文、
      //     側欄點書籤或最近查詢
      //
      // 下面的 addHistory 與 onBookmark 仍讀 displayTarget(可能是預覽):它們
      // 是對「畫面上顯示的這一條」動作,不涉及脈絡,不受上述限制。
      //
      // 有實際查詢字串且已定位到條文時才留下歷史紀錄,避免空查詢或
      // 尚未跳轉時寫入沒有意義的紀錄。在目錄分頁按 Enter 也不寫:使用者是在
      // 逐層點目錄,不是在查詢,把左欄殘留的查詢字串記成「最近查詢」是謊報。
      if (db && displayTarget && query && tab === 'search') {
        addHistory(db, { ts: Date.now(), query, pcode: displayTarget.pcode, no: displayTarget.no })
          .catch((err) => console.error('寫入最近查詢失敗', err));
      }
    },
    onEscape: () => {
      if (query) setQuery('');
      focusSearch();
    },
    onDivision: jumpDivision,
    onPrintable: focusSearch,
    onBookmark: () => {
      if (!db) {
        setNotice('書籤功能暫時無法使用(尚未連上本機資料庫)');
        return;
      }
      // Cmd+D 對「目前顯示中」的條文生效——即使候選不只一部、使用者還沒按
      // 方向鍵,右欄顯示的仍是 displayTarget(預覽),不是只認已確認的 reader。
      if (!displayTarget) {
        setNotice('尚未開啟任何條文,無法加入書籤');
        return;
      }
      const where = `${law?.abbr ?? displayTarget.pcode} ${displayTarget.no}`;
      toggleBookmark(db, displayTarget.pcode, displayTarget.no)
        .then((added) => {
          setNotice(added ? `已加入書籤:${where}` : `已移除書籤:${where}`);
          reloadBookmarks();
          setDbVersion((v) => v + 1);
        })
        .catch((err) => {
          console.error('切換書籤失敗', err);
          setNotice('書籤儲存失敗,請稍後再試');
        });
    },
  });

  return (
    <div className={collapsed ? 'app app-collapsed' : 'app'}>
      <div className="pane-left">
        {/* 收合鈕本身留在 hidden 的容器外面,不然收起來就再也按不到了。
            收合後它撐滿整條窄軌,成為一個很難按不中的展開目標。 */}
        <button
          type="button"
          className="pane-toggle"
          aria-expanded={!collapsed}
          aria-controls="pane-body"
          aria-label={collapsed ? '展開側欄' : '收合側欄'}
          title={collapsed ? '展開側欄' : '收合側欄'}
          onClick={() => setCollapsed((c) => !c)}
        >
          {/* 漢堡圖示畫成 inline SVG,不用 ☰(U+2630):那個字元在各平台字型裡
              大小落差很大,有些字型根本沒有,會掉成豆腐框。
              圖示本身 aria-hidden,按鈕的可及名稱完全來自上面的 aria-label。 */}
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
            <path
              d="M2 4h12M2 8h12M2 12h12"
              fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
            />
          </svg>
        </button>
        {/* 收合用 hidden 而不是不渲染:目錄展開到第幾編、搜尋結果、捲動位置
            都留在原地(理由同下方「兩個分頁都保持掛載」)。 */}
        <div className="pane-body" id="pane-body" hidden={collapsed}>
          <UpdateBanner visible={updateReady} onReload={() => performUpdate?.()} />
          {/* 搜尋框不屬於任何一個分頁,兩個分頁下都在。§7.2「焦點預設永遠在
              搜尋框,開啟即可打字」靠的就是它隨時可聚焦——把它藏進搜尋分頁,
              在目錄分頁打字就會再次靜默消失(那正是 §7.2 修掉的 bug)。
              反過來,在目錄分頁打字代表使用者要查詢,順手切回搜尋分頁。 */}
          <input
            ref={inputRef}
            className="search-input"
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setTab('search'); }}
            placeholder="民184 / 過失 / 民法 損害賠償"
            aria-label="搜尋法條"
          />
          {notice && <div className="notice" role="status">{notice}</div>}
          <div className="tabs" role="tablist">
            <button
              type="button" role="tab" id="tab-search" aria-controls="panel-search"
              aria-selected={tab === 'search'}
              className={tab === 'search' ? 'tab tab-active' : 'tab'}
              onClick={() => setTab('search')}
            >
              搜尋
            </button>
            <button
              type="button" role="tab" id="tab-toc" aria-controls="panel-toc"
              aria-selected={tab === 'toc'}
              className={tab === 'toc' ? 'tab tab-active' : 'tab'}
              onClick={() => setTab('toc')}
            >
              目錄
            </button>
          </div>
          {/* 兩個分頁都保持掛載、用 hidden 切換顯示,各自的狀態才留得住:切到
              目錄再切回搜尋,查詢與結果還在;切回目錄,展開到哪裡也還在。 */}
          <div
            className="result-scroll" role="tabpanel" id="panel-search"
            aria-labelledby="tab-search" hidden={tab !== 'search'}
          >
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
                <ResultList groups={outcome.groups} selected={selected} onSelect={selectAndFollow} />
              </>
            )}
          </div>
          <div
            className="result-scroll" role="tabpanel" id="panel-toc"
            aria-labelledby="tab-toc" hidden={tab !== 'toc'}
          >
            {/* 點目錄設定 reader 是明確的使用者意圖,和方向鍵選取候選同一類,
                因此直接走 setReader——它會成為下一次查詢的脈絡法規(§5.5 情境一)。 */}
            <TocPane corpus={corpus} reader={reader} onOpen={setReader} />
          </div>
          <DataVersion sourceUpdatedAt={corpus.sourceUpdatedAt} />
        </div>
      </div>
      <div className="pane-right" ref={readerRef} tabIndex={-1}>
        <ReaderPane
          law={law}
          targetNo={displayTarget?.no ?? null}
          hitsByNo={hitsByNo}
          notes={notes}
          bookmarks={bookmarks}
          db={db}
          onNoteSaved={reloadNotes}
        />
      </div>
    </div>
  );
}
