import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync, strToU8 } from 'fflate';
import { loadLaws } from './src/loadLaws';
import { downloadSource } from './src/download';
import { parseLaws } from './src/parseXml';
import { validate } from './src/validate';
import { assertNoAliasConflicts } from '../src/core/alias';
import type { Corpus, Law } from '../src/core/types';

const entries = loadLaws('data/laws.yaml');
assertNoAliasConflicts(entries);
console.log(`清單:${entries.length} 部`);

const xmlPath = await downloadSource('data/cache');
const { sourceUpdatedAt, laws: raws } = parseLaws(readFileSync(xmlPath, 'utf8'));
console.log(`來源:${raws.length} 部(版本 ${sourceUpdatedAt})`);

// 以 PCode 為 key 建索引。廢止的舊版法規有自己的 PCode,不會與新版撞號,
// 這正是不用名稱當 key 的理由——「總統副總統選舉罷免法」新舊兩版同名。
const byPcode = new Map(raws.map((r) => [r.pcode, r]));
validate(entries, byPcode);

const laws: Law[] = entries.map((e) => {
  const raw = byPcode.get(e.pcode)!;
  return {
    pcode: e.pcode,
    name: raw.name,
    abbr: e.abbr,
    aliases: e.aliases,
    group: e.group,
    updated: raw.updated,
    history: raw.history,
    preamble: raw.preamble || undefined,
    blocks: raw.blocks,
  };
});

const corpus: Corpus = {
  sourceUpdatedAt,
  builtAt: new Date().toISOString(),
  laws,
};

mkdirSync('public', { recursive: true });
const json = JSON.stringify(corpus);
writeFileSync('public/corpus.json', json);

const articles = laws.reduce((n, l) => n + l.blocks.filter((b) => b.t === 'a').length, 0);
const gz = gzipSync(strToU8(json), { level: 9 }).length;
console.log(`✓ ${laws.length} 部 / ${articles.toLocaleString()} 條`);
console.log(`  public/corpus.json  ${(Buffer.byteLength(json, 'utf8') / 1048576).toFixed(2)} MB`);
console.log(`  gzip                ${(gz / 1048576).toFixed(2)} MB`);
