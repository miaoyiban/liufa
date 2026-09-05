import { memo, useEffect, useRef } from 'react';
import type { Article, Law } from '../core/types';
import type { Hit } from '../core/search';
import { formatLawDate } from '../core/date';
import { Highlight } from './Highlight';
import { NoteEditor } from './NoteEditor';
import { articleKey, type LawDb, type Note } from '../store/db';

export function articleDomId(no: string): string {
  return `article-${no}`;
}

/** 無命中時共用同一個陣列;每次 render 都給 `[]` 會讓 ArticleBlock 的 memo 失效。 */
const NO_HITS: Hit[] = [];

type Props = {
  law: Law | null;
  targetNo: string | null;
  hitsByNo: Map<string, Hit[]>;
  notes: Map<string, Note>;
  /** 已加書籤條文的 key(articleKey);用來在條號旁顯示標記 */
  bookmarks: Set<string>;
  db: LawDb | null;
  onNoteSaved: () => void;
};

export function ReaderPane({ law, targetNo, hitsByNo, notes, bookmarks, db, onNoteSaved }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!law || !targetNo) return;
    // jsdom 未實作 CSS.escape,改用屬性選擇器;條號只會是 \d+(-\d+)?,無需跳脫。
    const el = rootRef.current?.querySelector(`[id="${articleDomId(targetNo)}"]`);
    el?.scrollIntoView({ block: 'center' });
  }, [law, targetNo]);

  if (!law) {
    return <div className="status">輸入關鍵字或條號開始查詢</div>;
  }

  return (
    <div ref={rootRef} className="reader">
      <header className="reader-head">
        <h1>{law.abbr}</h1>
        <div className="reader-meta">最後修正 {formatLawDate(law.updated)}</div>
      </header>
      {law.blocks.map((b, i) =>
        b.t === 'd' ? (
          <div
            key={`d${i}`}
            className="division"
            data-level={b.level}
            style={{ paddingLeft: `${b.level * 1.2}rem` }}
          >
            {b.label}
          </div>
        ) : (
          <ArticleBlock
            key={b.no}
            pcode={law.pcode}
            lawUpdated={law.updated}
            article={b}
            hits={hitsByNo.get(b.no) ?? NO_HITS}
            note={notes.get(articleKey(law.pcode, b.no))}
            bookmarked={bookmarks.has(articleKey(law.pcode, b.no))}
            db={db}
            onNoteSaved={onNoteSaved}
            isTarget={b.no === targetNo}
          />
        )
      )}
    </div>
  );
}

// memo:存一次筆記就會重建整個 notes Map 並重新 render ReaderPane,沒有 memo
// 的話整部民法 1,439 條會全部重新調和(每次 debounce 存檔都付一次)。props 全是
// 原始值或穩定參照(article 來自 corpus、hits 空時共用 NO_HITS、onNoteSaved 已
// useCallback),因此淺比較足夠。
const ArticleBlock = memo(function ArticleBlock({
  pcode, lawUpdated, article, hits, note, bookmarked, db, onNoteSaved, isTarget,
}: {
  pcode: string; lawUpdated: string; article: Article; hits: Hit[];
  note: Note | undefined; bookmarked: boolean;
  db: LawDb | null; onNoteSaved: () => void; isTarget: boolean;
}) {
  // 命中位置是對整段 text 的偏移,分段渲染時要換算到各段的區間
  let offset = 0;
  const paragraphs = article.text.split('\n').map((line) => {
    const start = offset;
    offset += line.length + 1; // +1 補回被 split 掉的 \n
    const local = hits
      .filter((h) => h.start >= start && h.start + h.length <= start + line.length)
      .map((h) => ({ start: h.start - start, length: h.length }));
    return { line, hits: local };
  });

  return (
    <article id={articleDomId(article.no)} className={isTarget ? 'article article-target' : 'article'}>
      {/* §8.2:有筆記的條文在條號旁顯示標記;書籤同理——否則 Cmd+D 是一個
          完全看不出結果的開關,1,439 條的閱讀區裡也無從得知哪幾條有筆記。 */}
      <b className="article-no">
        {article.label}
        {bookmarked && <span className="article-flag" role="img" aria-label="已加入書籤">★</span>}
        {note && <span className="article-flag" role="img" aria-label="有筆記">✎</span>}
      </b>
      {paragraphs.map((p, i) => (
        <p key={i}>
          <Highlight text={p.line} hits={p.hits} />
        </p>
      ))}
      <NoteEditor
        pcode={pcode}
        no={article.no}
        lawUpdated={lawUpdated}
        note={note}
        db={db}
        onSaved={onNoteSaved}
      />
    </article>
  );
});
