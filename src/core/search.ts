export type Hit = { start: number; length: number };

export function findHits(text: string, term: string): Hit[] {
  const hits: Hit[] = [];
  if (term === '') return hits;
  let i = text.indexOf(term);
  while (i >= 0) {
    hits.push({ start: i, length: term.length });
    i = text.indexOf(term, i + term.length);
  }
  return hits;
}

/** 全部 term 都出現才回傳命中位置(AND);任一未命中回傳 null。 */
export function matchArticle(text: string, terms: string[]): Hit[] | null {
  if (terms.length === 0) return null;
  const all: Hit[] = [];
  for (const term of terms) {
    const hits = findHits(text, term);
    if (hits.length === 0) return null;
    all.push(...hits);
  }
  all.sort((a, b) => a.start - b.start);
  return all;
}
