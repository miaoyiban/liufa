import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { LawEntry } from '../../src/core/alias';

type YamlGroup = {
  group: string;
  laws: { pcode: string; abbr: string; aliases?: string[] }[];
};

export function loadLaws(yamlPath: string): LawEntry[] {
  const groups = parse(readFileSync(yamlPath, 'utf8')) as YamlGroup[];
  const out: LawEntry[] = [];
  for (const g of groups) {
    for (const l of g.laws) {
      out.push({
        pcode: l.pcode,
        abbr: l.abbr,
        aliases: l.aliases ?? [],
        group: g.group,
      });
    }
  }
  return out;
}
