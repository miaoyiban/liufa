export type LawEntry = {
  pcode: string;
  abbr: string;
  aliases: string[];
  group: string;
};

export type AliasMatch = {
  pcode: string;
  rest: string;
  spaced: boolean; // 前綴後方原本是否為空白
};

export class AliasIndex {
  private readonly keys: { key: string; pcode: string }[];

  constructor(entries: LawEntry[]) {
    const keys: { key: string; pcode: string }[] = [];
    for (const e of entries) {
      for (const key of [e.abbr, ...e.aliases]) keys.push({ key, pcode: e.pcode });
    }
    // 長度由長到短——「民訴」必須先於「民」被嘗試
    keys.sort((a, b) => b.key.length - a.key.length);
    this.keys = keys;
  }

  match(input: string): AliasMatch | null {
    for (const { key, pcode } of this.keys) {
      if (!input.startsWith(key)) continue;
      const after = input.slice(key.length);
      return { pcode, rest: after.trim(), spaced: /^\s/.test(after) };
    }
    return null;
  }
}

export function assertNoAliasConflicts(entries: LawEntry[]): void {
  const seen = new Map<string, string>();
  for (const e of entries) {
    for (const key of [e.abbr, ...e.aliases]) {
      const prev = seen.get(key);
      if (prev) {
        throw new Error(`別名衝突:「${key}」同時屬於 ${prev} 與 ${e.pcode}`);
      }
      seen.set(key, e.pcode);
    }
  }
}
