export type ArticleNo = { main: number; sub: number };

const LABEL_RE = /^第\s*(\d+)(?:\s*-\s*(\d+))?\s*條$/;
const PLAIN_RE = /^(\d+)(?:-(\d+))?$/;

export function parseArticleLabel(label: string): ArticleNo | null {
  const m = LABEL_RE.exec(label.trim());
  if (!m) return null;
  return { main: Number(m[1]), sub: m[2] ? Number(m[2]) : 0 };
}

export function parseArticleNo(s: string): ArticleNo | null {
  const m = PLAIN_RE.exec(s);
  if (!m) return null;
  return { main: Number(m[1]), sub: m[2] ? Number(m[2]) : 0 };
}

export function formatArticleNo(n: ArticleNo): string {
  return n.sub === 0 ? String(n.main) : `${n.main}-${n.sub}`;
}

export function compareArticleNo(a: ArticleNo, b: ArticleNo): number {
  return a.main - b.main || a.sub - b.sub;
}
