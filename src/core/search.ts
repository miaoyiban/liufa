import type { Corpus, Law, Article } from './types';
import type { Query } from './parseQuery';
import { compareArticleNo, formatArticleNo, type ArticleNo } from './articleNo';

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

// ── 搜尋結果型別 ──

export type ArticleResult = {
  pcode: string;
  abbr: string;
  article: Article;
  hits: Hit[];
};

export type ResultGroup = {
  pcode: string;
  abbr: string;
  results: ArticleResult[];
};

export type Diagnosis = { term: string; remaining: number };

export type SearchOutcome = {
  groups: ResultGroup[];
  totalArticles: number;
  totalLaws: number;
  /** 條號查詢的跳轉目標;關鍵字查詢為 undefined */
  jumpTo?: { pcode: string; no: string };
  /** 零結果時指出造成零命中的 term */
  diagnosis?: Diagnosis;
};

/** 六法核心,依 laws.yaml 的分類順序。純數字查詢在未開啟法規時的候選範圍。 */
export const CORE_LAW_PCODES = [
  'A0000001', // 中華民國憲法
  'B0000001', // 民法
  'B0010001', // 民事訴訟法
  'C0000001', // 中華民國刑法
  'C0010001', // 刑事訴訟法
  'A0030055', // 行政程序法
];

const EMPTY: SearchOutcome = { groups: [], totalArticles: 0, totalLaws: 0 };

function articlesOf(law: Law): Article[] {
  return law.blocks.filter((b): b is Article => b.t === 'a');
}

function findArticle(law: Law, no: ArticleNo): Article | undefined {
  const key = formatArticleNo(no);
  return articlesOf(law).find((a) => a.no === key);
}

function singleResult(law: Law, article: Article): SearchOutcome {
  return {
    groups: [
      { pcode: law.pcode, abbr: law.abbr, results: [{ pcode: law.pcode, abbr: law.abbr, article, hits: [] }] },
    ],
    totalArticles: 1,
    totalLaws: 1,
    jumpTo: { pcode: law.pcode, no: article.no },
  };
}

function searchArticle(
  corpus: Corpus,
  pcode: string | null,
  no: ArticleNo,
  currentPcode: string | null
): SearchOutcome {
  const target = pcode ?? currentPcode;

  if (target) {
    const law = corpus.laws.find((l) => l.pcode === target);
    if (!law) return EMPTY;
    const article = findArticle(law, no);
    return article ? singleResult(law, article) : EMPTY;
  }

  // §5.5:未開啟任何法規 → 列出六法核心中該條號存在的候選,由使用者選擇。
  // 不猜測「最近瀏覽的法規」——猜錯時使用者會看到條號正確但法規錯誤的條文,
  // 這種錯誤在課堂上難以察覺。
  const groups: ResultGroup[] = [];
  for (const corePcode of CORE_LAW_PCODES) {
    const law = corpus.laws.find((l) => l.pcode === corePcode);
    if (!law) continue;
    const article = findArticle(law, no);
    if (!article) continue;
    groups.push({
      pcode: law.pcode,
      abbr: law.abbr,
      results: [{ pcode: law.pcode, abbr: law.abbr, article, hits: [] }],
    });
  }
  return { groups, totalArticles: groups.length, totalLaws: groups.length };
}

function countMatches(laws: Law[], terms: string[]): number {
  let n = 0;
  for (const law of laws) {
    for (const b of law.blocks) {
      if (b.t === 'a' && matchArticle(b.text, terms)) n++;
    }
  }
  return n;
}

function diagnose(laws: Law[], terms: string[]): Diagnosis | undefined {
  if (terms.length < 2) return undefined;
  for (const term of terms) {
    const rest = terms.filter((t) => t !== term);
    const remaining = countMatches(laws, rest);
    if (remaining > 0) return { term, remaining };
  }
  return undefined;
}

function searchKeyword(corpus: Corpus, pcode: string | null, terms: string[]): SearchOutcome {
  if (terms.length === 0) return EMPTY;

  const laws = pcode ? corpus.laws.filter((l) => l.pcode === pcode) : corpus.laws;
  const groups: ResultGroup[] = [];
  let totalArticles = 0;

  // corpus.laws 已依 laws.yaml 的分類順序排列,直接照順序走即為分組順序
  for (const law of laws) {
    const results: ArticleResult[] = [];
    for (const b of law.blocks) {
      if (b.t !== 'a') continue;
      const hits = matchArticle(b.text, terms);
      if (!hits) continue;
      results.push({ pcode: law.pcode, abbr: law.abbr, article: b, hits });
    }
    if (results.length === 0) continue;
    // 組內:命中次數多者優先,其次條號由小到大
    results.sort(
      (a, b) => b.hits.length - a.hits.length || compareArticleNo(a.article, b.article)
    );
    groups.push({ pcode: law.pcode, abbr: law.abbr, results });
    totalArticles += results.length;
  }

  const outcome: SearchOutcome = { groups, totalArticles, totalLaws: groups.length };
  if (totalArticles === 0) {
    const d = diagnose(laws, terms);
    if (d) outcome.diagnosis = d;
  }
  return outcome;
}

export function search(
  corpus: Corpus,
  q: Query,
  ctx: { currentPcode: string | null }
): SearchOutcome {
  switch (q.kind) {
    case 'empty':
      return EMPTY;
    case 'law': {
      const law = corpus.laws.find((l) => l.pcode === q.pcode);
      const first = law ? articlesOf(law)[0] : undefined;
      if (!law || !first) return EMPTY;
      return { ...EMPTY, jumpTo: { pcode: law.pcode, no: first.no } };
    }
    case 'article':
      return searchArticle(corpus, q.pcode, q.no, ctx.currentPcode);
    case 'keyword':
      return searchKeyword(corpus, q.pcode, q.terms);
  }
}
