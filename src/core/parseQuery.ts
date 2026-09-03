import type { AliasIndex } from './alias';
import { parseArticleNo, type ArticleNo } from './articleNo';

export type Query =
  | { kind: 'empty' }
  | { kind: 'law'; pcode: string }
  | { kind: 'article'; pcode: string | null; no: ArticleNo }
  | { kind: 'keyword'; pcode: string | null; terms: string[] };

const FULLWIDTH_DIGIT = /[０-９]/g;

/**
 * 把字串轉成條號候選形式。只能用在「已剝離法規前綴後的剩餘字串」或
 * 「整串輸入」的條號判定上,絕不可拿轉換結果當關鍵字——剝除「第」「條」
 * 會把「第三人」變成「三人」。
 */
export function toArticleNoCandidate(s: string): string {
  return s
    .replace(FULLWIDTH_DIGIT, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[§第條]/g, '')
    .replace(/之/g, '-')
    .replace(/\s+/g, '');
}

function splitTerms(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

export function parseQuery(raw: string, index: AliasIndex): Query {
  const input = raw.replace(/　/g, ' ').trim();
  if (!input) return { kind: 'empty' };

  const m = index.match(input);
  if (m) {
    // 前綴只在三種情況下成立,否則整串當關鍵字
    if (m.rest === '') return { kind: 'law', pcode: m.pcode };

    const no = parseArticleNo(toArticleNoCandidate(m.rest));
    if (no) return { kind: 'article', pcode: m.pcode, no };

    if (m.spaced) return { kind: 'keyword', pcode: m.pcode, terms: splitTerms(m.rest) };
  }

  const no = parseArticleNo(toArticleNoCandidate(input));
  if (no) return { kind: 'article', pcode: null, no };

  // 關鍵字一律使用未經剝除的原文
  return { kind: 'keyword', pcode: null, terms: splitTerms(input) };
}
