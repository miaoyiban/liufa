import sax from 'sax';
import type { Block } from '../../src/core/types';
import { parseArticleLabel, formatArticleNo } from '../../src/core/articleNo';

export type RawLaw = {
  pcode: string;
  name: string;
  category: string;
  updated: string;
  discarded: boolean;
  history: string;
  preamble: string;
  blocks: Block[];
  badArticleLabels: string[];
};

export type ParsedSource = { sourceUpdatedAt: string; laws: RawLaw[] };

const FIELDS = new Set([
  '法規名稱', '法規網址', '法規類別', '最新異動日期', '廢止註記',
  '沿革內容', '前言', '編章節', '條號', '條文內容',
]);

function emptyLaw(): RawLaw {
  return {
    pcode: '', name: '', category: '', updated: '', discarded: false,
    history: '', preamble: '', blocks: [], badArticleLabels: [],
  };
}

export function parseLaws(xml: string): ParsedSource {
  // trim / normalize 皆須為 false:編章節的層級完全靠前導空白編碼
  const parser = sax.parser(true, { trim: false, normalize: false });

  const laws: RawLaw[] = [];
  let sourceUpdatedAt = '';
  let cur: RawLaw | null = null;
  let field: string | null = null;
  let buf = '';
  let artLabel = '';
  let artText = '';

  parser.onerror = (e) => {
    throw new Error(`XML 解析錯誤:${e.message}`);
  };

  parser.onopentag = (node) => {
    const name = node.name;
    if (name === 'LAWS') {
      const attrs = node.attributes as Record<string, string>;
      sourceUpdatedAt = attrs.UpdateDate ?? '';
    } else if (name === '法規') {
      cur = emptyLaw();
    } else if (name === '條文') {
      artLabel = '';
      artText = '';
    } else if (FIELDS.has(name)) {
      field = name;
      buf = '';
    }
  };

  parser.ontext = (t) => { if (field !== null) buf += t; };
  parser.oncdata = (t) => { if (field !== null) buf += t; };

  parser.onclosetag = (name) => {
    if (name === '法規') {
      if (cur) laws.push(cur);
      cur = null;
      return;
    }
    if (name === '條文') {
      if (cur) {
        const no = parseArticleLabel(artLabel);
        if (no) {
          cur.blocks.push({
            t: 'a',
            no: formatArticleNo(no),
            main: no.main,
            sub: no.sub,
            label: artLabel,
            text: artText,
          });
        } else {
          cur.badArticleLabels.push(artLabel);
        }
      }
      return;
    }
    if (field === null || cur === null) return;

    const raw = buf.replace(/\r/g, '');
    switch (name) {
      case '法規名稱': cur.name = raw.trim(); break;
      case '法規網址': cur.pcode = /pcode=(\w+)/i.exec(raw)?.[1] ?? ''; break;
      case '法規類別': cur.category = raw.trim(); break;
      case '最新異動日期': cur.updated = raw.trim(); break;
      case '廢止註記': cur.discarded = raw.trim() === '廢'; break;
      case '沿革內容': cur.history = raw.trim(); break;
      case '前言': cur.preamble = raw.trim(); break;
      case '編章節': {
        // 前導空白每 3 格一階,不可先 trim
        const lead = raw.length - raw.replace(/^ +/, '').length;
        cur.blocks.push({ t: 'd', level: Math.floor(lead / 3), label: raw.trim() });
        break;
      }
      case '條號': artLabel = raw.trim(); break;
      case '條文內容': artText = raw.trim(); break;
    }
    field = null;
    buf = '';
  };

  parser.write(xml).close();
  return { sourceUpdatedAt, laws };
}
