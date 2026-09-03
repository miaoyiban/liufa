import type { ReactNode } from 'react';
import type { Hit } from '../core/search';

export function Highlight({ text, hits }: { text: string; hits: Hit[] }) {
  if (hits.length === 0) return <>{text}</>;

  const parts: ReactNode[] = [];
  let pos = 0;
  hits.forEach((h, i) => {
    if (h.start < pos) return; // 重疊命中:已被前一個涵蓋,跳過
    if (h.start > pos) parts.push(text.slice(pos, h.start));
    parts.push(<mark key={i}>{text.slice(h.start, h.start + h.length)}</mark>);
    pos = h.start + h.length;
  });
  if (pos < text.length) parts.push(text.slice(pos));

  return <>{parts}</>;
}
