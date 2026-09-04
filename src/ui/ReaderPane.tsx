import { useEffect, useRef } from 'react';
import type { Article, Law } from '../core/types';
import type { Hit } from '../core/search';
import { Highlight } from './Highlight';

export function articleDomId(no: string): string {
  return `article-${no}`;
}

function formatUpdated(yyyymmdd: string): string {
  if (!/^\d{8}$/.test(yyyymmdd)) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

type Props = {
  law: Law | null;
  targetNo: string | null;
  hitsByNo: Map<string, Hit[]>;
};

export function ReaderPane({ law, targetNo, hitsByNo }: Props) {
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
        <div className="reader-meta">最後修正 {formatUpdated(law.updated)}</div>
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
            article={b}
            hits={hitsByNo.get(b.no) ?? []}
            isTarget={b.no === targetNo}
          />
        )
      )}
    </div>
  );
}

function ArticleBlock({
  article, hits, isTarget,
}: { article: Article; hits: Hit[]; isTarget: boolean }) {
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
      <b className="article-no">{article.label}</b>
      {paragraphs.map((p, i) => (
        <p key={i}>
          <Highlight text={p.line} hits={p.hits} />
        </p>
      ))}
    </article>
  );
}
