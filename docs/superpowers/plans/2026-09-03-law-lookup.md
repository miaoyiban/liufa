# 小六法即時查詢工具 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打造一個完全離線、雙欄版面的小六法即時查詢工具——輸入的同時出結果,`民184` 三鍵抵達條文,並可從該條自由往上下捲動閱讀前後條文。

**Architecture:** 建置期把全國法規資料庫的開放資料 XML 轉成單一 `corpus.json`(100 部法規,gzip 1.3 MB),整包預載進瀏覽器。搜尋是主執行緒上的 brute-force 子字串比對(最壞 7.5 ms),閱讀區把整部法規全渲染成真實 DOM(民法 1439 條 30 ms 可互動)。核心邏輯集中在零框架依賴的 `src/core/`,UI 只是消費者。

**Tech Stack:** TypeScript · React 19 · Vite 7 · Vitest · `sax`(XML 串流解析)· `fflate`(解壓)· `yaml` · `idb`(IndexedDB)· `marked` + `DOMPurify`(筆記渲染)· `vite-plugin-pwa`(離線)

**Spec:** `docs/superpowers/specs/2026-09-03-law-lookup-design.md`

## Global Constraints

- **`src/core/` 不得 import 任何 UI 框架**(React、DOM API 皆不可)。這是日後擴充手機版 UI 的邊界,也是測試邊界。
- **資料來源固定**:`https://sendlaw.moj.gov.tw/PublicData/GetFile.ashx?DType=XML&AuData=CF`
- **收錄 100 部法規**,清單見 spec 附錄 A,以 PCode 為唯一 key。
- **建置為 fail-fast**:PCode 不存在、法規已廢止、別名衝突、條號無法解析——任一項發生即中止建置並列出原因。絕不安靜產出缺法的 bundle。
- **搜尋結果不截斷**。全部命中都保留。
- **資料不自動靜默更新**。偵測到新版只提示,由使用者決定何時重新載入。
- **`編章節` 的前導空白絕對不可 trim**,層級靠它編碼(每階 3 格)。
- Node.js ≥ 20(建置腳本使用內建 `fetch`)。

---

## 對 Spec 的兩處修正

實作規劃時發現 spec §5.2 的解析流程有一個會產生錯誤結果的缺陷,本計畫採用修正後的規則(spec 已同步更新):

**修正一:正規化不可在剝離法規前綴之前對整串套用。**
spec 原本寫「1. 正規化(剝除 `§`、`第`、`條`)→ 2. 剝離法規前綴」。若對整串輸入剝除「第」「條」,關鍵字查詢會壞掉——搜尋「第三人」會被改寫成「三人」。正確順序是:先剝法規前綴,再**只對剩餘字串**嘗試條號正規化;若不是條號,關鍵字要用**未經剝除的原文**。

**修正二:法規前綴只在三種情況下才成立。**
若無條件剝離最長匹配的別名,單字別名會造成災難:`民事責任` 會被剝成「民法」+ 關鍵字「事責任」,`土地登記` 會被剝成「土地法」+ 關鍵字「地登記」。前綴只在以下三種情況成立:

1. 剝離後**剩餘為空**(`民法` → 開啟民法)
2. 剩餘**是條號**(`民184` → 民法第 184 條)
3. 前綴後面**原本就有空白**(`民法 過失` → 在民法內搜尋)

其餘情況(`民事責任`、`土地登記`)整串當關鍵字處理。

---

## File Structure

```
law/
  package.json
  tsconfig.json
  vite.config.ts
  index.html
  data/
    laws.yaml                  # 100 部清單(spec 附錄 A)
    build.ts                   # 建置入口:下載 → 解析 → 驗證 → 輸出
    src/
      loadLaws.ts              #   讀取並攤平 laws.yaml
      download.ts              #   下載 + 解壓,含本機快取
      parseXml.ts              #   sax 串流解析 XML → RawLaw[]
      validate.ts              #   fail-fast 驗證
  src/
    core/                      # 零框架依賴
      types.ts                 #   Block / Law / Corpus
      articleNo.ts             #   條號正規化與排序
      alias.ts                 #   最長匹配別名索引
      parseQuery.ts            #   查詢意圖判定
      search.ts                #   brute-force 搜尋 + 分組排序
    store/
      db.ts                    # IndexedDB:history / bookmarks / notes
      transfer.ts              # 匯出 / 匯入 JSON
    ui/
      App.tsx                  # 版面 + 全域狀態
      SearchPane.tsx           # 左欄:輸入框 + 結果 / 書籤 / 歷史
      ResultList.tsx           # 左欄結果清單(分組 + 選取)
      ReaderPane.tsx           # 右欄:全渲染 + 定位 + sticky 標題
      NoteEditor.tsx           # 筆記 Markdown 編輯/預覽
      Highlight.tsx            # 命中高亮
      useCorpus.ts             # corpus 載入 + 版本檢查
      useKeyboard.ts           # 鍵盤操作
  public/
    corpus.json                # 建置產物(git 忽略)
```

**責任邊界**:`core/` 是純函式,輸入 corpus 與查詢字串、輸出結果物件,不碰 DOM 也不碰 IndexedDB。`store/` 只管持久化,不知道搜尋的存在。`ui/` 是唯一把兩者接起來的地方。

---

### Task 1: 專案骨架與條號正規化

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`
- Create: `src/core/types.ts`, `src/core/articleNo.ts`
- Test: `src/core/articleNo.test.ts`

**Interfaces:**
- Consumes: 無(第一個任務)
- Produces:
  - `type ArticleNo = { main: number; sub: number }`
  - `parseArticleLabel(label: string): ArticleNo | null` — 解析 XML 原文標籤 `"第 184-1 條"`
  - `parseArticleNo(s: string): ArticleNo | null` — 解析正規化字串 `"184-1"`
  - `formatArticleNo(n: ArticleNo): string` — `{main:184,sub:1}` → `"184-1"`
  - `compareArticleNo(a: ArticleNo, b: ArticleNo): number`
  - `types.ts` 匯出 `Division` / `Article` / `Block` / `Law` / `Corpus`

- [ ] **Step 1: 建立專案骨架**

建立 `package.json`:

```json
{
  "name": "law-lookup",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "data": "tsx data/build.ts"
  },
  "dependencies": {
    "dompurify": "^3.2.4",
    "idb": "^8.0.1",
    "marked": "^15.0.6",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/sax": "^1.2.7",
    "@vitejs/plugin-react": "^4.3.4",
    "fake-indexeddb": "^6.0.0",
    "fflate": "^0.8.2",
    "jsdom": "^26.0.0",
    "sax": "^1.4.1",
    "tsx": "^4.19.2",
    "typescript": "^5.7.0",
    "vite": "^7.0.0",
    "vite-plugin-pwa": "^0.21.1",
    "vitest": "^3.0.0",
    "yaml": "^2.7.0"
  }
}
```

建立 `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noEmit": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "data"]
}
```

建立 `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { globals: true },
});
```

建立 `index.html`:

```html
<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>小六法</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

然後執行 `npm install`。

- [ ] **Step 2: 寫下失敗的測試**

建立 `src/core/articleNo.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  parseArticleLabel,
  parseArticleNo,
  formatArticleNo,
  compareArticleNo,
} from './articleNo';

describe('parseArticleLabel', () => {
  it('解析一般條號', () => {
    expect(parseArticleLabel('第 184 條')).toEqual({ main: 184, sub: 0 });
  });

  it('解析「之一」條號', () => {
    expect(parseArticleLabel('第 184-1 條')).toEqual({ main: 184, sub: 1 });
  });

  it('容忍多餘空白', () => {
    expect(parseArticleLabel('  第1條 ')).toEqual({ main: 1, sub: 0 });
  });

  it('編章節標題不是條號,回傳 null', () => {
    expect(parseArticleLabel('第 一 章 法例')).toBeNull();
  });
});

describe('parseArticleNo', () => {
  it('解析正規化字串', () => {
    expect(parseArticleNo('184')).toEqual({ main: 184, sub: 0 });
    expect(parseArticleNo('184-1')).toEqual({ main: 184, sub: 1 });
  });

  it('非純條號回傳 null', () => {
    expect(parseArticleNo('過失')).toBeNull();
    expect(parseArticleNo('184a')).toBeNull();
    expect(parseArticleNo('')).toBeNull();
  });
});

describe('formatArticleNo', () => {
  it('sub 為 0 時不顯示', () => {
    expect(formatArticleNo({ main: 184, sub: 0 })).toBe('184');
    expect(formatArticleNo({ main: 184, sub: 1 })).toBe('184-1');
  });
});

describe('compareArticleNo', () => {
  it('184 < 184-1 < 185', () => {
    const nos = [
      { main: 185, sub: 0 },
      { main: 184, sub: 1 },
      { main: 184, sub: 0 },
    ];
    const sorted = [...nos].sort(compareArticleNo).map(formatArticleNo);
    expect(sorted).toEqual(['184', '184-1', '185']);
  });

  it('184-2 排在 184-1 之後', () => {
    expect(compareArticleNo({ main: 184, sub: 1 }, { main: 184, sub: 2 })).toBeLessThan(0);
  });
});
```

- [ ] **Step 3: 執行測試,確認失敗**

Run: `npx vitest run src/core/articleNo.test.ts`
Expected: FAIL — `Failed to resolve import "./articleNo"`

- [ ] **Step 4: 寫下型別定義**

建立 `src/core/types.ts`:

```ts
// level 觀測範圍 0-4(編/章/節/款/目)。民法、民事訴訟法、公司法確實用到 level 4,
// 因此不可寫成 0|1|2|3 的聯集型別。
export type Division = { t: 'd'; level: number; label: string };

export type Article = {
  t: 'a';
  no: string;      // 正規化條號,如 "184" 或 "184-1"
  main: number;
  sub: number;     // 無「之」號時為 0
  label: string;   // 顯示用原文,如 "第 184 條"
  text: string;    // 條文內容,各項以 \n 分隔
};

export type Block = Division | Article;

export type Law = {
  pcode: string;
  name: string;       // 來源原始名稱
  abbr: string;       // 顯示名稱,取自 laws.yaml
  aliases: string[];
  group: string;
  updated: string;    // "20260817"
  history: string;
  preamble?: string;
  blocks: Block[];    // 依原始文件順序
};

export type Corpus = {
  sourceUpdatedAt: string;
  builtAt: string;
  laws: Law[];
};
```

- [ ] **Step 5: 實作條號模組**

建立 `src/core/articleNo.ts`:

```ts
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
```

- [ ] **Step 6: 執行測試,確認通過**

Run: `npx vitest run src/core/articleNo.test.ts`
Expected: PASS(13 個測試)

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json vite.config.ts index.html src/core/
git commit -m "feat: 專案骨架與條號正規化

條號必須解析成 {main, sub} 才能正確排序——字串排序下
184-1 會排到 185 之後,而正確順序是 184 < 184-1 < 185。"
```

---

### Task 2: 法規清單與別名最長匹配

**Files:**
- Create: `data/laws.yaml`(內容取自 spec 附錄 A)
- Create: `data/src/loadLaws.ts`, `src/core/alias.ts`
- Test: `src/core/alias.test.ts`, `data/src/loadLaws.test.ts`

**Interfaces:**
- Consumes: 無
- Produces:
  - `type LawEntry = { pcode: string; abbr: string; aliases: string[]; group: string }`
  - `class AliasIndex` — `new AliasIndex(entries: LawEntry[])`,方法 `match(input: string): { pcode: string; rest: string; spaced: boolean } | null`
  - `assertNoAliasConflicts(entries: LawEntry[]): void` — 衝突時 throw
  - `loadLaws(yamlPath: string): LawEntry[]`

- [ ] **Step 1: 建立 laws.yaml**

把 spec `docs/superpowers/specs/2026-09-03-law-lookup-design.md` 附錄 A 的 YAML 內容(100 部,178 個別名)完整複製到 `data/laws.yaml`。結構為:

```yaml
- group: 憲法及關係法規
  laws:
    - { pcode: A0000001, abbr: 憲法, aliases: [憲] }
    - { pcode: A0000002, abbr: 憲法增修條文, aliases: [增修, 憲增] }
    # ...
- group: 民法及關係法規
  laws:
    - { pcode: B0000001, abbr: 民法, aliases: [民] }
    # ...
```

複製後執行 `node -e "console.log(require('yaml').parse(require('fs').readFileSync('data/laws.yaml','utf8')).reduce((n,g)=>n+g.laws.length,0))"`,必須輸出 `100`。

- [ ] **Step 2: 寫下失敗的測試**

建立 `src/core/alias.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AliasIndex, assertNoAliasConflicts, type LawEntry } from './alias';

const entries: LawEntry[] = [
  { pcode: 'B0000001', abbr: '民法', aliases: ['民'], group: '民法及關係法規' },
  { pcode: 'B0010001', abbr: '民事訴訟法', aliases: ['民訴'], group: '民事訴訟法及關係法規' },
  { pcode: 'C0000001', abbr: '刑法', aliases: ['刑'], group: '刑法及關係法規' },
  { pcode: 'C0010001', abbr: '刑事訴訟法', aliases: ['刑訴'], group: '刑事訴訟法及關係法規' },
  { pcode: 'D0060001', abbr: '土地法', aliases: ['土'], group: '民法及關係法規' },
];

describe('AliasIndex.match', () => {
  const idx = new AliasIndex(entries);

  it('最長匹配:民訴244 不可被解析成「民」+「訴244」', () => {
    expect(idx.match('民訴244')).toEqual({
      pcode: 'B0010001',
      rest: '244',
      spaced: false,
    });
  });

  it('單字別名', () => {
    expect(idx.match('民184')).toEqual({ pcode: 'B0000001', rest: '184', spaced: false });
  });

  it('完整名稱', () => {
    expect(idx.match('民事訴訟法244')).toEqual({
      pcode: 'B0010001',
      rest: '244',
      spaced: false,
    });
  });

  it('記錄前綴後方是否為空白', () => {
    expect(idx.match('民法 過失')).toEqual({
      pcode: 'B0000001',
      rest: '過失',
      spaced: true,
    });
  });

  it('剩餘為空', () => {
    expect(idx.match('民法')).toEqual({ pcode: 'B0000001', rest: '', spaced: false });
  });

  it('無匹配時回傳 null', () => {
    expect(idx.match('過失致死')).toBeNull();
  });

  it('刑訴優先於刑', () => {
    expect(idx.match('刑訴159')?.pcode).toBe('C0010001');
    expect(idx.match('刑271')?.pcode).toBe('C0000001');
  });
});

describe('assertNoAliasConflicts', () => {
  it('無衝突時不 throw', () => {
    expect(() => assertNoAliasConflicts(entries)).not.toThrow();
  });

  it('別名與別名衝突時 throw', () => {
    const bad = [
      ...entries,
      { pcode: 'X0000001', abbr: '民用航空法', aliases: ['民'], group: '其他' },
    ];
    expect(() => assertNoAliasConflicts(bad)).toThrow(/別名衝突/);
  });

  it('別名與他法 abbr 衝突時 throw', () => {
    const bad = [
      ...entries,
      { pcode: 'X0000002', abbr: '某法', aliases: ['民法'], group: '其他' },
    ];
    expect(() => assertNoAliasConflicts(bad)).toThrow(/別名衝突/);
  });
});
```

建立 `data/src/loadLaws.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { loadLaws } from './loadLaws';
import { assertNoAliasConflicts } from '../../src/core/alias';

describe('loadLaws', () => {
  const laws = loadLaws('data/laws.yaml');

  it('讀到 100 部法規', () => {
    expect(laws).toHaveLength(100);
  });

  it('每部都有 pcode、abbr、group', () => {
    for (const l of laws) {
      expect(l.pcode).toMatch(/^[A-Z]\d{7}$/);
      expect(l.abbr.length).toBeGreaterThan(0);
      expect(l.group.length).toBeGreaterThan(0);
    }
  });

  it('pcode 不重複', () => {
    expect(new Set(laws.map((l) => l.pcode)).size).toBe(100);
  });

  it('真實清單的別名無衝突', () => {
    expect(() => assertNoAliasConflicts(laws)).not.toThrow();
  });

  it('民法與刑法的別名正確', () => {
    expect(laws.find((l) => l.pcode === 'B0000001')?.aliases).toContain('民');
    expect(laws.find((l) => l.pcode === 'C0000001')?.abbr).toBe('刑法');
  });
});
```

- [ ] **Step 3: 執行測試,確認失敗**

Run: `npx vitest run src/core/alias.test.ts data/src/loadLaws.test.ts`
Expected: FAIL — 無法解析 `./alias` 與 `./loadLaws`

- [ ] **Step 4: 實作別名索引**

建立 `src/core/alias.ts`:

```ts
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
```

- [ ] **Step 5: 實作 laws.yaml 載入**

建立 `data/src/loadLaws.ts`:

```ts
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
```

- [ ] **Step 6: 執行測試,確認通過**

Run: `npx vitest run src/core/alias.test.ts data/src/loadLaws.test.ts`
Expected: PASS(15 個測試)

- [ ] **Step 7: Commit**

```bash
git add data/laws.yaml data/src/loadLaws.ts data/src/loadLaws.test.ts src/core/alias.ts src/core/alias.test.ts
git commit -m "feat: 法規清單與別名最長匹配

別名必須依長度由長到短嘗試。若採最短匹配,「民訴244」會被
解析成「民法」加殘餘字串「訴244」,查詢直接失敗。"
```

---

### Task 3: 查詢意圖判定

**Files:**
- Create: `src/core/parseQuery.ts`
- Test: `src/core/parseQuery.test.ts`

**Interfaces:**
- Consumes: `AliasIndex`(Task 2)、`parseArticleNo` / `ArticleNo`(Task 1)
- Produces:
  - `type Query = { kind:'empty' } | { kind:'law'; pcode:string } | { kind:'article'; pcode:string|null; no:ArticleNo } | { kind:'keyword'; pcode:string|null; terms:string[] }`
  - `parseQuery(raw: string, index: AliasIndex): Query`
  - `toArticleNoCandidate(s: string): string`

本任務實作「對 Spec 的兩處修正」所述的規則。兩個 bug guard 測試(`第三人`、`民事責任`)是這個任務的重點,不可省略。

- [ ] **Step 1: 寫下失敗的測試**

建立 `src/core/parseQuery.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AliasIndex, type LawEntry } from './alias';
import { parseQuery } from './parseQuery';

const entries: LawEntry[] = [
  { pcode: 'B0000001', abbr: '民法', aliases: ['民'], group: '民法及關係法規' },
  { pcode: 'B0010001', abbr: '民事訴訟法', aliases: ['民訴'], group: '民事訴訟法及關係法規' },
  { pcode: 'C0000001', abbr: '刑法', aliases: ['刑'], group: '刑法及關係法規' },
  { pcode: 'D0060001', abbr: '土地法', aliases: ['土'], group: '民法及關係法規' },
];
const idx = new AliasIndex(entries);
const q = (s: string) => parseQuery(s, idx);

describe('parseQuery — 空查詢', () => {
  it('空字串', () => {
    expect(q('')).toEqual({ kind: 'empty' });
    expect(q('   ')).toEqual({ kind: 'empty' });
  });
});

describe('parseQuery — 只輸入法規名', () => {
  it('開啟該法規', () => {
    expect(q('民法')).toEqual({ kind: 'law', pcode: 'B0000001' });
  });
});

describe('parseQuery — 條號查詢', () => {
  const民184 = { kind: 'article', pcode: 'B0000001', no: { main: 184, sub: 0 } };

  it('民184 / 民法184 / 民法 184 三種寫法等價', () => {
    expect(q('民184')).toEqual(民184);
    expect(q('民法184')).toEqual(民184);
    expect(q('民法 184')).toEqual(民184);
  });

  it('之一條的三種寫法等價', () => {
    const expected = { kind: 'article', pcode: 'B0000001', no: { main: 184, sub: 1 } };
    expect(q('民184-1')).toEqual(expected);
    expect(q('民法184之1')).toEqual(expected);
    expect(q('民§184-1')).toEqual(expected);
  });

  it('全形數字', () => {
    expect(q('民法１８４')).toEqual(民184);
  });

  it('「第 184 條」完整寫法', () => {
    expect(q('民法第184條')).toEqual(民184);
  });

  it('最長匹配:民訴244 是民事訴訟法', () => {
    expect(q('民訴244')).toEqual({
      kind: 'article',
      pcode: 'B0010001',
      no: { main: 244, sub: 0 },
    });
  });

  it('純數字:pcode 為 null,由呼叫端依 §5.5 解析', () => {
    expect(q('184')).toEqual({ kind: 'article', pcode: null, no: { main: 184, sub: 0 } });
  });
});

describe('parseQuery — 關鍵字查詢', () => {
  it('全域單一關鍵字', () => {
    expect(q('過失')).toEqual({ kind: 'keyword', pcode: null, terms: ['過失'] });
  });

  it('多關鍵字 AND', () => {
    expect(q('過失 傷害')).toEqual({ kind: 'keyword', pcode: null, terms: ['過失', '傷害'] });
  });

  it('限定法規:前綴後有空白', () => {
    expect(q('民法 過失')).toEqual({
      kind: 'keyword',
      pcode: 'B0000001',
      terms: ['過失'],
    });
  });
});

describe('parseQuery — bug guard(修正一):正規化不可套用在關鍵字上', () => {
  it('「第三人」不可被剝成「三人」', () => {
    expect(q('第三人')).toEqual({ kind: 'keyword', pcode: null, terms: ['第三人'] });
  });

  it('「條文」不可被剝成空字串', () => {
    expect(q('條文')).toEqual({ kind: 'keyword', pcode: null, terms: ['條文'] });
  });
});

describe('parseQuery — bug guard(修正二):前綴只在三種情況成立', () => {
  it('「民事責任」不可被剝成 民法 + 「事責任」', () => {
    expect(q('民事責任')).toEqual({ kind: 'keyword', pcode: null, terms: ['民事責任'] });
  });

  it('「土地登記」不可被剝成 土地法 + 「地登記」', () => {
    expect(q('土地登記')).toEqual({ kind: 'keyword', pcode: null, terms: ['土地登記'] });
  });

  it('「刑事政策」不可被剝成 刑法 + 「事政策」', () => {
    expect(q('刑事政策')).toEqual({ kind: 'keyword', pcode: null, terms: ['刑事政策'] });
  });
});
```

- [ ] **Step 2: 執行測試,確認失敗**

Run: `npx vitest run src/core/parseQuery.test.ts`
Expected: FAIL — 無法解析 `./parseQuery`

- [ ] **Step 3: 實作查詢解析**

建立 `src/core/parseQuery.ts`:

```ts
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
```

- [ ] **Step 4: 執行測試,確認通過**

Run: `npx vitest run src/core/parseQuery.test.ts`
Expected: PASS(18 個測試)

- [ ] **Step 5: Commit**

```bash
git add src/core/parseQuery.ts src/core/parseQuery.test.ts
git commit -m "feat: 查詢意圖判定

修正 spec §5.2 兩處缺陷:
- 條號正規化不可對整串套用,否則搜尋「第三人」會變成「三人」
- 法規前綴只在「剩餘為空 / 剩餘是條號 / 後接空白」三種情況成立,
  否則「民事責任」會被剝成民法加關鍵字「事責任」"
```

---

### Task 4: 資料管線 — 下載與解壓

**Files:**
- Create: `data/src/download.ts`
- Test: `data/src/download.test.ts`

**Interfaces:**
- Consumes: 無
- Produces:
  - `SOURCE_URL: string`
  - `extractXml(zip: Uint8Array): string` — 純函式,解壓並去除 UTF-8 BOM
  - `downloadSource(cacheDir: string): Promise<string>` — 回傳 XML 檔路徑,24 小時內走本機快取

網路下載本身不寫測試(不穩定且慢)。解壓與去 BOM 的邏輯抽成純函式 `extractXml` 來測。

- [ ] **Step 1: 寫下失敗的測試**

建立 `data/src/download.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { extractXml, SOURCE_URL } from './download';

describe('extractXml', () => {
  it('從壓縮檔取出 XML 內容', () => {
    const zip = zipSync({ 'FalV.xml': strToU8('<LAWS></LAWS>') });
    expect(extractXml(zip)).toBe('<LAWS></LAWS>');
  });

  it('去除 UTF-8 BOM(來源檔帶 BOM)', () => {
    const zip = zipSync({ 'FalV.xml': strToU8('﻿<LAWS></LAWS>') });
    expect(extractXml(zip)).toBe('<LAWS></LAWS>');
  });

  it('忽略同壓縮檔內的其他檔案', () => {
    const zip = zipSync({
      'manifest.csv': strToU8('name,schema'),
      'schema.csv': strToU8('name,title'),
      'FalV.xml': strToU8('<LAWS/>'),
    });
    expect(extractXml(zip)).toBe('<LAWS/>');
  });

  it('找不到 xml 時拋出可讀的錯誤', () => {
    const zip = zipSync({ 'readme.txt': strToU8('hi') });
    expect(() => extractXml(zip)).toThrow(/找不到 \.xml/);
  });
});

describe('SOURCE_URL', () => {
  it('指向法務部開放資料的中文法律檔', () => {
    expect(SOURCE_URL).toBe(
      'https://sendlaw.moj.gov.tw/PublicData/GetFile.ashx?DType=XML&AuData=CF'
    );
  });
});
```

- [ ] **Step 2: 執行測試,確認失敗**

Run: `npx vitest run data/src/download.test.ts`
Expected: FAIL — 無法解析 `./download`

- [ ] **Step 3: 實作下載模組**

建立 `data/src/download.ts`:

```ts
import { mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';

export const SOURCE_URL =
  'https://sendlaw.moj.gov.tw/PublicData/GetFile.ashx?DType=XML&AuData=CF';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function extractXml(zip: Uint8Array): string {
  const files = unzipSync(zip);
  const name = Object.keys(files).find((n) => n.toLowerCase().endsWith('.xml'));
  if (!name) {
    throw new Error(`壓縮檔中找不到 .xml,內含:${Object.keys(files).join('、')}`);
  }
  const text = new TextDecoder('utf-8').decode(files[name]!);
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export async function downloadSource(cacheDir: string): Promise<string> {
  mkdirSync(cacheDir, { recursive: true });
  const xmlPath = join(cacheDir, 'FalV.xml');

  if (existsSync(xmlPath) && Date.now() - statSync(xmlPath).mtimeMs < CACHE_TTL_MS) {
    console.log(`使用快取:${xmlPath}`);
    return xmlPath;
  }

  console.log(`下載 ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`下載失敗:HTTP ${res.status} ${res.statusText}`);

  const zip = new Uint8Array(await res.arrayBuffer());
  console.log(`  壓縮檔 ${(zip.length / 1048576).toFixed(1)} MB`);
  const xml = extractXml(zip);
  writeFileSync(xmlPath, xml, 'utf8');
  console.log(`  解壓後 ${(xml.length / 1048576).toFixed(1)} MB → ${xmlPath}`);
  return xmlPath;
}
```

- [ ] **Step 4: 執行測試,確認通過**

Run: `npx vitest run data/src/download.test.ts`
Expected: PASS(5 個測試)

- [ ] **Step 5: 實際跑一次下載,確認來源可用**

Run: `npx tsx -e "import('./data/src/download.ts').then(m => m.downloadSource('data/cache'))"`
Expected: 印出壓縮檔約 6 MB、解壓後約 25 MB,並在 `data/cache/FalV.xml` 產生檔案。

- [ ] **Step 6: Commit**

```bash
git add data/src/download.ts data/src/download.test.ts
git commit -m "feat: 資料來源下載與解壓

來源檔帶 UTF-8 BOM,必須去除,否則第一個 XML 標籤解析會失敗。"
```

---

### Task 5: 資料管線 — XML 串流解析

**Files:**
- Create: `data/src/parseXml.ts`
- Test: `data/src/parseXml.test.ts`

**Interfaces:**
- Consumes: `parseArticleLabel` / `formatArticleNo`(Task 1)、`Block`(Task 1)
- Produces:
  - `type RawLaw = { pcode; name; category; updated; discarded; history; preamble; blocks: Block[]; badArticleLabels: string[] }`
  - `type ParsedSource = { sourceUpdatedAt: string; laws: RawLaw[] }`
  - `parseLaws(xml: string): ParsedSource`

**為什麼用 `sax` 而不是 DOM 或 `fast-xml-parser`:** `編章節` 與 `條文` 是**同層的兄弟節點**,語意完全依賴文件順序。多數 XML→物件的轉換器會把同名標籤收攏成陣列,不同標籤之間的相對順序就此遺失,閱讀區的章節結構會全毀。sax 是事件式的,順序天生保留。另外它也不會對文字做 trim——而 `編章節` 的層級完全靠前導空白編碼。

- [ ] **Step 1: 寫下失敗的測試**

建立 `data/src/parseXml.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseLaws } from './parseXml';
import type { Article, Division } from '../../src/core/types';

// 這份 fixture 刻意涵蓋 spec §3.3 的全部六個陷阱
const FIXTURE = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<LAWS UpdateDate="2026/8/21 上午 12:00:00">',
  '  <法規>',
  '    <法規名稱>中華民國刑法</法規名稱>',
  '    <法規網址>https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=C0000001</法規網址>',
  '    <法規類別>刑事</法規類別>',
  '    <最新異動日期>20260513</最新異動日期>',
  '    <廢止註記></廢止註記>',
  '    <沿革內容><![CDATA[1.中華民國二十四年一月一日制定]]></沿革內容>',
  '    <前言><![CDATA[]]></前言>',
  '    <法規內容>',
  '      <編章節>第 一 編 總則</編章節>',
  '      <編章節>   第 一 章 法例</編章節>',
  '      <編章節>      第 一 節 適用範圍</編章節>',
  '      <編章節>         第 一 款 通則</編章節>',
  '      <編章節>            第 一 目 細目</編章節>',
  '      <條文>',
  '        <條號>第 1 條</條號>',
  '        <條文內容><![CDATA[行為之處罰，以行為時之法律有明文規定者為限。\r',
  '拘束人身自由之保安處分，亦同。]]></條文內容>',
  '      </條文>',
  '      <條文>',
  '        <條號>第 185-3 條</條號>',
  '        <條文內容><![CDATA[駕駛動力交通工具而有下列情形之一者。]]></條文內容>',
  '      </條文>',
  '    </法規內容>',
  '  </法規>',
  '  <法規>',
  '    <法規名稱>總統副總統選舉罷免法（舊 36.03.31 制定）</法規名稱>',
  '    <法規網址>https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=D0020001</法規網址>',
  '    <法規類別>選舉</法規類別>',
  '    <最新異動日期>19470331</最新異動日期>',
  '    <廢止註記>廢</廢止註記>',
  '    <沿革內容><![CDATA[]]></沿革內容>',
  '    <法規內容>',
  '      <條文><條號>1</條號><條文內容><![CDATA[裸數字條號]]></條文內容></條文>',
  '    </法規內容>',
  '  </法規>',
  '</LAWS>',
].join('\n');

describe('parseLaws', () => {
  const parsed = parseLaws(FIXTURE);

  it('取出來源版本', () => {
    expect(parsed.sourceUpdatedAt).toBe('2026/8/21 上午 12:00:00');
  });

  it('解析出兩部法規', () => {
    expect(parsed.laws).toHaveLength(2);
  });

  it('陷阱 6:PCode 從法規網址取出', () => {
    expect(parsed.laws[0]!.pcode).toBe('C0000001');
  });

  it('陷阱 3:保留來源的正式名稱', () => {
    expect(parsed.laws[0]!.name).toBe('中華民國刑法');
  });

  it('陷阱 5:標記廢止', () => {
    expect(parsed.laws[0]!.discarded).toBe(false);
    expect(parsed.laws[1]!.discarded).toBe(true);
  });

  it('陷阱 1:編章節與條文保持文件順序', () => {
    const kinds = parsed.laws[0]!.blocks.map((b) => b.t);
    expect(kinds).toEqual(['d', 'd', 'd', 'd', 'd', 'a', 'a']);
  });

  it('陷阱 1:層級由前導空白推算,每階 3 格,支援到 level 4', () => {
    const levels = parsed.laws[0]!.blocks
      .filter((b): b is Division => b.t === 'd')
      .map((b) => b.level);
    expect(levels).toEqual([0, 1, 2, 3, 4]);
  });

  it('編章節標籤本身已 trim', () => {
    const first = parsed.laws[0]!.blocks[1] as Division;
    expect(first.label).toBe('第 一 章 法例');
  });

  it('陷阱 2:條號正規化', () => {
    const arts = parsed.laws[0]!.blocks.filter((b): b is Article => b.t === 'a');
    expect(arts[0]).toMatchObject({ no: '1', main: 1, sub: 0, label: '第 1 條' });
    expect(arts[1]).toMatchObject({ no: '185-3', main: 185, sub: 3, label: '第 185-3 條' });
  });

  it('CDATA 內容取出,CR 已移除,項以 \\n 分隔', () => {
    const art = parsed.laws[0]!.blocks.find((b): b is Article => b.t === 'a')!;
    expect(art.text).toBe(
      '行為之處罰，以行為時之法律有明文規定者為限。\n拘束人身自由之保安處分，亦同。'
    );
  });

  it('沿革內容取出', () => {
    expect(parsed.laws[0]!.history).toBe('1.中華民國二十四年一月一日制定');
  });

  it('無法解析的條號被收集起來,不靜默丟棄', () => {
    expect(parsed.laws[1]!.badArticleLabels).toEqual(['1']);
    expect(parsed.laws[1]!.blocks.filter((b) => b.t === 'a')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 執行測試,確認失敗**

Run: `npx vitest run data/src/parseXml.test.ts`
Expected: FAIL — 無法解析 `./parseXml`

- [ ] **Step 3: 實作 sax 解析器**

建立 `data/src/parseXml.ts`:

```ts
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
```

- [ ] **Step 4: 執行測試,確認通過**

Run: `npx vitest run data/src/parseXml.test.ts`
Expected: PASS(12 個測試)

- [ ] **Step 5: 對真實檔案跑一次,確認規模正確**

Run:
```bash
npx tsx -e "
import {readFileSync} from 'node:fs';
import {parseLaws} from './data/src/parseXml.ts';
const p = parseLaws(readFileSync('data/cache/FalV.xml','utf8'));
const live = p.laws.filter(l => !l.discarded);
console.log('來源版本', p.sourceUpdatedAt);
console.log('法規總數', p.laws.length, '現行', live.length);
const mf = p.laws.find(l => l.pcode === 'B0000001');
console.log('民法條文數', mf.blocks.filter(b => b.t === 'a').length);
console.log('民法184', mf.blocks.find(b => b.t === 'a' && b.no === '184').text.slice(0, 10));
"
```
Expected:
```
來源版本 2026/8/21 上午 12:00:00
法規總數 1346 現行 1024
民法條文數 1439
民法184 因故意或過失，不法
```

- [ ] **Step 6: Commit**

```bash
git add data/src/parseXml.ts data/src/parseXml.test.ts
git commit -m "feat: XML 串流解析

用 sax 而非 XML→物件轉換器:編章節與條文是同層兄弟節點,語意
完全依賴文件順序,而多數轉換器會把同名標籤收攏成陣列、丟失
跨標籤的相對順序。sax 也不 trim 文字,而層級靠前導空白編碼。"
```

---

### Task 6: 資料管線 — 驗證與建置輸出

**Files:**
- Create: `data/src/validate.ts`, `data/build.ts`
- Modify: `.gitignore`
- Test: `data/src/validate.test.ts`, `src/core/corpus.test.ts`

**Interfaces:**
- Consumes: `loadLaws`(Task 2)、`downloadSource`(Task 4)、`parseLaws` / `RawLaw`(Task 5)、`assertNoAliasConflicts`(Task 2)、`Corpus` / `Law`(Task 1)
- Produces:
  - `validate(entries: LawEntry[], byPcode: Map<string, RawLaw>): void` — 有問題時 throw,訊息列出全部問題
  - 建置產物 `public/corpus.json`

- [ ] **Step 1: 寫下失敗的測試**

建立 `data/src/validate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validate } from './validate';
import type { RawLaw } from './parseXml';
import type { LawEntry } from '../../src/core/alias';

const entry = (pcode: string, abbr: string): LawEntry => ({
  pcode, abbr, aliases: [], group: '測試',
});

const raw = (over: Partial<RawLaw> = {}): RawLaw => ({
  pcode: 'B0000001', name: '民法', category: '', updated: '20260817',
  discarded: false, history: '', preamble: '',
  blocks: [{ t: 'a', no: '1', main: 1, sub: 0, label: '第 1 條', text: '內容' }],
  badArticleLabels: [],
  ...over,
});

describe('validate', () => {
  it('一切正常時不 throw', () => {
    const map = new Map([['B0000001', raw()]]);
    expect(() => validate([entry('B0000001', '民法')], map)).not.toThrow();
  });

  it('PCode 不存在時 throw', () => {
    expect(() => validate([entry('X9999999', '不存在法')], new Map())).toThrow(
      /X9999999.*不存在/s
    );
  });

  it('法規已廢止時 throw', () => {
    const map = new Map([['B0000001', raw({ discarded: true })]]);
    expect(() => validate([entry('B0000001', '民法')], map)).toThrow(/已廢止/);
  });

  it('有無法解析的條號時 throw', () => {
    const map = new Map([['B0000001', raw({ badArticleLabels: ['1', '2'] })]]);
    expect(() => validate([entry('B0000001', '民法')], map)).toThrow(/無法解析的條號/);
  });

  it('沒有任何條文時 throw', () => {
    const map = new Map([['B0000001', raw({ blocks: [] })]]);
    expect(() => validate([entry('B0000001', '民法')], map)).toThrow(/沒有任何條文/);
  });

  it('一次列出全部問題,而非只報第一個', () => {
    const map = new Map([['B0000001', raw({ discarded: true })]]);
    const err = (() => {
      try {
        validate([entry('B0000001', '民法'), entry('X9999999', '不存在法')], map);
      } catch (e) {
        return (e as Error).message;
      }
    })();
    expect(err).toMatch(/已廢止/);
    expect(err).toMatch(/X9999999/);
    expect(err).toMatch(/2 項/);
  });
});
```

建立 `src/core/corpus.test.ts` — 這是**整份計畫最重要的測試**,它是法規改版或來源格式變動時唯一的防線:

```ts
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import type { Corpus, Article } from './types';

const PATH = 'public/corpus.json';

describe('corpus.json 真實資料驗證', () => {
  if (!existsSync(PATH)) {
    it('corpus.json 尚未建置', () => {
      throw new Error(`找不到 ${PATH},請先執行 npm run data`);
    });
    return;
  }

  const corpus = JSON.parse(readFileSync(PATH, 'utf8')) as Corpus;

  it('收錄 100 部法規', () => {
    expect(corpus.laws).toHaveLength(100);
  });

  it('記錄來源版本與建置時間', () => {
    expect(corpus.sourceUpdatedAt).toMatch(/^\d{4}\/\d{1,2}\/\d{1,2}/);
    expect(Date.parse(corpus.builtAt)).not.toBeNaN();
  });

  it('民法有 1439 條條文', () => {
    const mf = corpus.laws.find((l) => l.pcode === 'B0000001')!;
    expect(mf.abbr).toBe('民法');
    expect(mf.blocks.filter((b) => b.t === 'a')).toHaveLength(1439);
  });

  it('民法第 184 條內容正確', () => {
    const mf = corpus.laws.find((l) => l.pcode === 'B0000001')!;
    const a = mf.blocks.find((b): b is Article => b.t === 'a' && b.no === '184')!;
    expect(a.label).toBe('第 184 條');
    expect(a.text.startsWith('因故意或過失，不法侵害他人之權利者')).toBe(true);
  });

  it('刑法用的是正式名稱「中華民國刑法」,顯示名稱是「刑法」', () => {
    const c = corpus.laws.find((l) => l.pcode === 'C0000001')!;
    expect(c.name).toBe('中華民國刑法');
    expect(c.abbr).toBe('刑法');
  });

  it('帶括號後綴的法規以 abbr 顯示', () => {
    const p = corpus.laws.find((l) => l.pcode === 'D0020053')!;
    expect(p.name).toContain('（新');
    expect(p.abbr).toBe('總統副總統選舉罷免法');
  });

  it('民法保有 level 4 的編章節', () => {
    const mf = corpus.laws.find((l) => l.pcode === 'B0000001')!;
    expect(mf.blocks.some((b) => b.t === 'd' && b.level === 4)).toBe(true);
  });

  it('每部法規都有條文,且條號皆可排序', () => {
    for (const l of corpus.laws) {
      const arts = l.blocks.filter((b): b is Article => b.t === 'a');
      expect(arts.length, `${l.abbr} 沒有條文`).toBeGreaterThan(0);
      for (const a of arts) {
        expect(Number.isInteger(a.main), `${l.abbr} ${a.label}`).toBe(true);
      }
    }
  });

  it('總條文數約 11,942 條', () => {
    const n = corpus.laws.reduce(
      (s, l) => s + l.blocks.filter((b) => b.t === 'a').length, 0
    );
    expect(n).toBeGreaterThan(11000);
    expect(n).toBeLessThan(13000);
  });
});
```

- [ ] **Step 2: 執行測試,確認失敗**

Run: `npx vitest run data/src/validate.test.ts src/core/corpus.test.ts`
Expected: FAIL — 無法解析 `./validate`,且 `corpus.json` 不存在

- [ ] **Step 3: 實作驗證模組**

建立 `data/src/validate.ts`:

```ts
import type { LawEntry } from '../../src/core/alias';
import type { RawLaw } from './parseXml';

/**
 * fail-fast 驗證。安靜產出一份缺法的 bundle,比建置失敗危險得多——
 * 使用者會以為自己查過了。
 */
export function validate(entries: LawEntry[], byPcode: Map<string, RawLaw>): void {
  const errors: string[] = [];

  for (const e of entries) {
    const raw = byPcode.get(e.pcode);
    if (!raw) {
      errors.push(`${e.abbr}:PCode ${e.pcode} 在來源中不存在`);
      continue;
    }
    if (raw.discarded) {
      errors.push(`${e.abbr}(${e.pcode}):已廢止`);
      continue;
    }
    if (raw.badArticleLabels.length > 0) {
      const sample = raw.badArticleLabels.slice(0, 5).join('、');
      errors.push(
        `${e.abbr}(${e.pcode}):有 ${raw.badArticleLabels.length} 個無法解析的條號:${sample}`
      );
    }
    if (!raw.blocks.some((b) => b.t === 'a')) {
      errors.push(`${e.abbr}(${e.pcode}):沒有任何條文`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`建置驗證失敗(${errors.length} 項):\n  - ${errors.join('\n  - ')}`);
  }
}
```

- [ ] **Step 4: 實作建置入口**

建立 `data/build.ts`:

```ts
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
console.log(`  public/corpus.json  ${(json.length / 1048576).toFixed(2)} MB`);
console.log(`  gzip                ${(gz / 1048576).toFixed(2)} MB`);
```

- [ ] **Step 5: 忽略建置產物**

在 `.gitignore` 加入一行:

```
public/corpus.json
```

- [ ] **Step 6: 執行建置**

Run: `npm run data`
Expected:
```
清單:100 部
來源:1346 部(版本 2026/8/21 上午 12:00:00)
✓ 100 部 / 11,942 條
  public/corpus.json  5.3x MB
  gzip                1.3x MB
```

- [ ] **Step 7: 執行測試,確認通過**

Run: `npx vitest run data/src/validate.test.ts src/core/corpus.test.ts`
Expected: PASS(15 個測試)

- [ ] **Step 8: Commit**

```bash
git add data/src/validate.ts data/src/validate.test.ts data/build.ts .gitignore src/core/corpus.test.ts
git commit -m "feat: 建置驗證與 corpus 輸出

corpus.test.ts 是法規改版或來源格式變動時的唯一防線:它對真實
資料斷言 100 部全在、民法 1439 條、第 184 條開頭文字、level 4
編章節仍在。這些在來源出問題時會第一時間失敗。"
```

---

### Task 7: 搜尋引擎 — 命中比對與高亮位置

**Files:**
- Create: `src/core/search.ts`
- Test: `src/core/search.test.ts`

**Interfaces:**
- Consumes: 無(純字串處理)
- Produces:
  - `type Hit = { start: number; length: number }`
  - `findHits(text: string, term: string): Hit[]` — 找出單一 term 的全部出現位置
  - `matchArticle(text: string, terms: string[]): Hit[] | null` — 全部 term 都出現才回傳(AND),否則 `null`

高亮位置在比對當下就一併收集,左欄摘要與右欄閱讀區共用同一份資料,不做第二次掃描。

- [ ] **Step 1: 寫下失敗的測試**

建立 `src/core/search.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { findHits, matchArticle } from './search';

describe('findHits', () => {
  it('找出單一出現位置', () => {
    expect(findHits('因故意或過失', '過失')).toEqual([{ start: 4, length: 2 }]);
  });

  it('找出全部出現位置', () => {
    expect(findHits('過失,過失,過失', '過失')).toEqual([
      { start: 0, length: 2 },
      { start: 3, length: 2 },
      { start: 6, length: 2 },
    ]);
  });

  it('不重疊掃描:aaa 中找 aa 只算一次', () => {
    expect(findHits('aaa', 'aa')).toEqual([{ start: 0, length: 2 }]);
  });

  it('沒有命中時回傳空陣列', () => {
    expect(findHits('因故意或過失', '故意過失')).toEqual([]);
  });
});

describe('matchArticle', () => {
  const text = '因故意或過失，不法侵害他人之權利者，負損害賠償責任。';

  it('單一 term 命中', () => {
    expect(matchArticle(text, ['過失'])).toEqual([{ start: 4, length: 2 }]);
  });

  it('多 term 全部命中才算(AND)', () => {
    const hits = matchArticle(text, ['過失', '賠償']);
    expect(hits).not.toBeNull();
    expect(hits).toHaveLength(2);
  });

  it('任一 term 未命中即回傳 null', () => {
    expect(matchArticle(text, ['過失', '緊急避難'])).toBeNull();
  });

  it('命中位置依 start 由小到大排序', () => {
    const hits = matchArticle(text, ['賠償', '故意'])!;
    expect(hits.map((h) => h.start)).toEqual([1, 19]);
  });

  it('空 term 陣列回傳 null', () => {
    expect(matchArticle(text, [])).toBeNull();
  });
});
```

- [ ] **Step 2: 執行測試,確認失敗**

Run: `npx vitest run src/core/search.test.ts`
Expected: FAIL — 無法解析 `./search`

- [ ] **Step 3: 實作比對函式**

建立 `src/core/search.ts`:

```ts
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
```

- [ ] **Step 4: 執行測試,確認通過**

Run: `npx vitest run src/core/search.test.ts`
Expected: PASS(10 個測試)

- [ ] **Step 5: Commit**

```bash
git add src/core/search.ts src/core/search.test.ts
git commit -m "feat: 命中比對與高亮位置收集"
```

---

### Task 8: 搜尋引擎 — 分組排序、條號查詢與零結果診斷

**Files:**
- Modify: `src/core/search.ts`(在 Task 7 的基礎上新增)
- Test: `src/core/searchOutcome.test.ts`

**Interfaces:**
- Consumes: `findHits` / `matchArticle`(Task 7)、`Query`(Task 3)、`Corpus` / `Law` / `Article`(Task 1)、`compareArticleNo` / `formatArticleNo`(Task 1)
- Produces:
  - `type ArticleResult = { pcode: string; abbr: string; article: Article; hits: Hit[] }`
  - `type ResultGroup = { pcode: string; abbr: string; results: ArticleResult[] }`
  - `type Diagnosis = { term: string; remaining: number }`
  - `type SearchOutcome = { groups: ResultGroup[]; totalArticles: number; totalLaws: number; jumpTo?: { pcode: string; no: string }; diagnosis?: Diagnosis }`
  - `CORE_LAW_PCODES: string[]`
  - `search(corpus: Corpus, q: Query, ctx: { currentPcode: string | null }): SearchOutcome`

- [ ] **Step 1: 寫下失敗的測試**

建立 `src/core/searchOutcome.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { search, CORE_LAW_PCODES } from './search';
import type { Corpus, Law, Block } from './types';
import type { Query } from './parseQuery';

function art(no: string, text: string): Block {
  const [main, sub] = no.split('-');
  return {
    t: 'a', no, main: Number(main), sub: sub ? Number(sub) : 0,
    label: `第 ${no} 條`, text,
  };
}

function law(pcode: string, abbr: string, group: string, blocks: Block[]): Law {
  return {
    pcode, name: abbr, abbr, aliases: [], group,
    updated: '20260101', history: '', blocks,
  };
}

const corpus: Corpus = {
  sourceUpdatedAt: '2026/8/21',
  builtAt: '2026-09-03T00:00:00.000Z',
  laws: [
    law('A0000001', '憲法', '憲法及關係法規', [
      art('8', '人民身體之自由應予保障。'),
      art('184', '憲法沒有這條,測試用。'),
    ]),
    law('B0000001', '民法', '民法及關係法規', [
      { t: 'd', level: 0, label: '第 二 編 債' },
      art('184', '因故意或過失，不法侵害他人之權利者,負損害賠償責任。'),
      art('184-1', '之一條測試,過失。'),
      art('185', '數人共同不法侵害他人之權利者。'),
      art('191', '過失過失過失,損害。'),
    ]),
    law('C0000001', '刑法', '刑法及關係法規', [
      art('271', '殺人者,處死刑。'),
      art('284', '因過失傷害人者。'),
    ]),
  ],
};

const noCtx = { currentPcode: null };

describe('search — 空查詢與法規查詢', () => {
  it('空查詢回傳空結果', () => {
    const out = search(corpus, { kind: 'empty' }, noCtx);
    expect(out.groups).toEqual([]);
    expect(out.totalArticles).toBe(0);
  });

  it('只輸入法規名 → 跳到該法第一條', () => {
    const out = search(corpus, { kind: 'law', pcode: 'B0000001' }, noCtx);
    expect(out.jumpTo).toEqual({ pcode: 'B0000001', no: '184' });
  });
});

describe('search — 條號查詢', () => {
  it('指定法規時直接跳轉', () => {
    const q: Query = { kind: 'article', pcode: 'B0000001', no: { main: 184, sub: 0 } };
    const out = search(corpus, q, noCtx);
    expect(out.jumpTo).toEqual({ pcode: 'B0000001', no: '184' });
    expect(out.totalArticles).toBe(1);
    expect(out.groups[0]!.results[0]!.article.no).toBe('184');
  });

  it('之一條可查', () => {
    const q: Query = { kind: 'article', pcode: 'B0000001', no: { main: 184, sub: 1 } };
    expect(search(corpus, q, noCtx).jumpTo).toEqual({ pcode: 'B0000001', no: '184-1' });
  });

  it('條號不存在時回傳空結果', () => {
    const q: Query = { kind: 'article', pcode: 'B0000001', no: { main: 9999, sub: 0 } };
    expect(search(corpus, q, noCtx).totalArticles).toBe(0);
  });

  it('§5.5 情境一:已開啟法規時,純數字在該法內查', () => {
    const q: Query = { kind: 'article', pcode: null, no: { main: 271, sub: 0 } };
    const out = search(corpus, q, { currentPcode: 'C0000001' });
    expect(out.jumpTo).toEqual({ pcode: 'C0000001', no: '271' });
  });

  it('§5.5 情境二:未開啟法規時,列出六法核心的候選', () => {
    const q: Query = { kind: 'article', pcode: null, no: { main: 184, sub: 0 } };
    const out = search(corpus, q, noCtx);
    expect(out.groups.map((g) => g.pcode)).toEqual(['A0000001', 'B0000001']);
    expect(out.jumpTo).toBeUndefined();
  });

  it('CORE_LAW_PCODES 為六法核心,依分類順序', () => {
    expect(CORE_LAW_PCODES).toEqual([
      'A0000001', 'B0000001', 'B0010001', 'C0000001', 'C0010001', 'A0030055',
    ]);
  });
});

describe('search — 關鍵字查詢', () => {
  it('全域搜尋,結果依法規分組', () => {
    const q: Query = { kind: 'keyword', pcode: null, terms: ['過失'] };
    const out = search(corpus, q, noCtx);
    expect(out.groups.map((g) => g.abbr)).toEqual(['民法', '刑法']);
    expect(out.totalArticles).toBe(4);
    expect(out.totalLaws).toBe(2);
  });

  it('分組順序依 corpus 中的法規順序,不依命中數', () => {
    const q: Query = { kind: 'keyword', pcode: null, terms: ['過失'] };
    const out = search(corpus, q, noCtx);
    // 刑法只有 1 條命中、民法有 3 條,但民法在前,因為分類順序在前
    expect(out.groups[0]!.abbr).toBe('民法');
  });

  it('組內排序:命中次數多者優先,其次條號由小到大', () => {
    const q: Query = { kind: 'keyword', pcode: null, terms: ['過失'] };
    const out = search(corpus, q, noCtx);
    // 191 有 3 次命中,184 與 184-1 各 1 次
    expect(out.groups[0]!.results.map((r) => r.article.no)).toEqual([
      '191', '184', '184-1',
    ]);
  });

  it('限定法規搜尋', () => {
    const q: Query = { kind: 'keyword', pcode: 'C0000001', terms: ['過失'] };
    const out = search(corpus, q, noCtx);
    expect(out.totalLaws).toBe(1);
    expect(out.groups[0]!.abbr).toBe('刑法');
  });

  it('多 term AND', () => {
    const q: Query = { kind: 'keyword', pcode: null, terms: ['過失', '損害'] };
    const out = search(corpus, q, noCtx);
    expect(out.totalArticles).toBe(2); // 民法 184 與 191
  });

  it('攜帶高亮位置', () => {
    const q: Query = { kind: 'keyword', pcode: null, terms: ['過失'] };
    const out = search(corpus, q, noCtx);
    const r = out.groups[0]!.results.find((x) => x.article.no === '191')!;
    expect(r.hits).toHaveLength(3);
  });

  it('結果不截斷', () => {
    const many = Array.from({ length: 500 }, (_, i) => art(String(i + 1), '過失'));
    const big: Corpus = { ...corpus, laws: [law('Z0000001', '測試法', '其他', many)] };
    const q: Query = { kind: 'keyword', pcode: null, terms: ['過失'] };
    expect(search(big, q, noCtx).totalArticles).toBe(500);
  });
});

describe('search — 零結果診斷', () => {
  it('指出造成零命中的 term 與移除後的命中數', () => {
    const q: Query = { kind: 'keyword', pcode: null, terms: ['過失', '緊急避難'] };
    const out = search(corpus, q, noCtx);
    expect(out.totalArticles).toBe(0);
    expect(out.diagnosis).toEqual({ term: '緊急避難', remaining: 4 });
  });

  it('單一 term 零命中時不做診斷(無可移除者)', () => {
    const q: Query = { kind: 'keyword', pcode: null, terms: ['緊急避難'] };
    const out = search(corpus, q, noCtx);
    expect(out.diagnosis).toBeUndefined();
  });

  it('全部 term 各自都零命中時不做診斷', () => {
    const q: Query = { kind: 'keyword', pcode: null, terms: ['甲甲甲', '乙乙乙'] };
    expect(search(corpus, q, noCtx).diagnosis).toBeUndefined();
  });
});

describe('search — 真實語料效能', () => {
  const PATH = 'public/corpus.json';
  it.skipIf(!existsSync(PATH))('最壞情況查詢在 100 ms 內完成', () => {
    const real = JSON.parse(readFileSync(PATH, 'utf8')) as Corpus;
    const q: Query = { kind: 'keyword', pcode: null, terms: ['之'] };
    search(real, q, noCtx); // 暖機
    const t0 = performance.now();
    const out = search(real, q, noCtx);
    const ms = performance.now() - t0;
    expect(out.totalArticles).toBeGreaterThan(5000);
    expect(ms).toBeLessThan(100);
  });
});
```

- [ ] **Step 2: 執行測試,確認失敗**

Run: `npx vitest run src/core/searchOutcome.test.ts`
Expected: FAIL — `search` 與 `CORE_LAW_PCODES` 尚未匯出

- [ ] **Step 3: 實作搜尋主體**

在 `src/core/search.ts` 檔尾追加:

```ts
import type { Corpus, Law, Article } from './types';
import type { Query } from './parseQuery';
import { compareArticleNo, formatArticleNo, type ArticleNo } from './articleNo';

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
```

- [ ] **Step 4: 執行測試,確認通過**

Run: `npx vitest run src/core/searchOutcome.test.ts`
Expected: PASS(19 個測試;若已執行過 `npm run data`,效能測試亦通過)

- [ ] **Step 5: 執行全部測試**

Run: `npm test`
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/search.ts src/core/searchOutcome.test.ts
git commit -m "feat: 分組排序、條號查詢與零結果診斷

結果依法規分組而非扁平相關性排序——使用者想知道「民法裡有哪幾條」,
不是「全部命中的第 7 名」。不做 BM25:它偏好短文件,與本場景的
排序意圖不符。結果一律不截斷,查法條時不知道有沒有漏掉是危險的。"
```

---

### Task 9: 個人資料層(IndexedDB)

**Files:**
- Create: `src/store/db.ts`
- Test: `src/store/db.test.ts`

**Interfaces:**
- Consumes: 無
- Produces:
  - `articleKey(pcode: string, no: string): string` — `${pcode}:${no}`
  - `type HistoryEntry = { id?: number; ts: number; query: string; pcode: string; no: string }`
  - `type Bookmark = { key: string; pcode: string; no: string; ts: number }`
  - `type Note = { key: string; pcode: string; no: string; body: string; updatedAt: number; lawVersionAtWrite: string }`
  - `type LawDb = IDBPDatabase<LawDbSchema>`
  - `openLawDb(name?: string): Promise<LawDb>`
  - `addHistory(db, e: Omit<HistoryEntry, 'id'>): Promise<void>`
  - `listHistory(db, limit?: number): Promise<HistoryEntry[]>`
  - `toggleBookmark(db, pcode: string, no: string): Promise<boolean>`
  - `listBookmarks(db): Promise<Bookmark[]>`
  - `getNote(db, pcode: string, no: string): Promise<Note | undefined>`
  - `putNote(db, pcode: string, no: string, body: string, lawVersionAtWrite: string): Promise<void>`
  - `listNotes(db): Promise<Note[]>`

- [ ] **Step 1: 寫下失敗的測試**

建立 `src/store/db.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  openLawDb, articleKey, addHistory, listHistory,
  toggleBookmark, listBookmarks, getNote, putNote, listNotes,
  type LawDb,
} from './db';

let db: LawDb;
let n = 0;

beforeEach(async () => {
  db = await openLawDb(`test-${n++}`);
});

describe('articleKey', () => {
  it('組成 pcode:no', () => {
    expect(articleKey('B0000001', '184-1')).toBe('B0000001:184-1');
  });
});

describe('history', () => {
  it('新增後可讀出,最新在前', async () => {
    await addHistory(db, { ts: 1, query: '民184', pcode: 'B0000001', no: '184' });
    await addHistory(db, { ts: 2, query: '刑271', pcode: 'C0000001', no: '271' });
    const list = await listHistory(db);
    expect(list.map((h) => h.query)).toEqual(['刑271', '民184']);
  });

  it('超過 200 筆時裁切最舊的', async () => {
    for (let i = 0; i < 205; i++) {
      await addHistory(db, { ts: i, query: `q${i}`, pcode: 'B0000001', no: '1' });
    }
    const all = await db.getAll('history');
    expect(all).toHaveLength(200);
    expect(all.some((h) => h.query === 'q0')).toBe(false);
    expect(all.some((h) => h.query === 'q204')).toBe(true);
  });

  it('limit 參數限制回傳筆數', async () => {
    for (let i = 0; i < 30; i++) {
      await addHistory(db, { ts: i, query: `q${i}`, pcode: 'B0000001', no: '1' });
    }
    expect(await listHistory(db, 5)).toHaveLength(5);
  });
});

describe('bookmarks', () => {
  it('toggle 新增後回傳 true,再 toggle 移除後回傳 false', async () => {
    expect(await toggleBookmark(db, 'B0000001', '184')).toBe(true);
    expect(await listBookmarks(db)).toHaveLength(1);
    expect(await toggleBookmark(db, 'B0000001', '184')).toBe(false);
    expect(await listBookmarks(db)).toHaveLength(0);
  });

  it('最新加入的在前', async () => {
    await toggleBookmark(db, 'B0000001', '184');
    await new Promise((r) => setTimeout(r, 2));
    await toggleBookmark(db, 'C0000001', '271');
    expect((await listBookmarks(db)).map((b) => b.no)).toEqual(['271', '184']);
  });
});

describe('notes', () => {
  it('寫入後可讀出,並記錄寫入時的法規版本', async () => {
    await putNote(db, 'B0000001', '184', '# 侵權行為\n三個要件', '20260817');
    const note = await getNote(db, 'B0000001', '184');
    expect(note?.body).toBe('# 侵權行為\n三個要件');
    expect(note?.lawVersionAtWrite).toBe('20260817');
    expect(note?.updatedAt).toBeGreaterThan(0);
  });

  it('覆寫既有筆記', async () => {
    await putNote(db, 'B0000001', '184', '舊', '20260817');
    await putNote(db, 'B0000001', '184', '新', '20260817');
    expect((await getNote(db, 'B0000001', '184'))?.body).toBe('新');
    expect(await listNotes(db)).toHaveLength(1);
  });

  it('內容清空即刪除,不留空筆記', async () => {
    await putNote(db, 'B0000001', '184', '內容', '20260817');
    await putNote(db, 'B0000001', '184', '   ', '20260817');
    expect(await getNote(db, 'B0000001', '184')).toBeUndefined();
    expect(await listNotes(db)).toHaveLength(0);
  });

  it('不存在的筆記回傳 undefined', async () => {
    expect(await getNote(db, 'B0000001', '999')).toBeUndefined();
  });
});
```

- [ ] **Step 2: 執行測試,確認失敗**

Run: `npx vitest run src/store/db.test.ts`
Expected: FAIL — 無法解析 `./db`

- [ ] **Step 3: 實作 IndexedDB 層**

建立 `src/store/db.ts`:

```ts
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type HistoryEntry = {
  id?: number;
  ts: number;
  query: string;
  pcode: string;
  no: string;
};

export type Bookmark = { key: string; pcode: string; no: string; ts: number };

export type Note = {
  key: string;
  pcode: string;
  no: string;
  body: string;              // 原始 Markdown
  updatedAt: number;
  lawVersionAtWrite: string; // 寫入當下該法的「最新異動日期」
};

interface LawDbSchema extends DBSchema {
  history: { key: number; value: HistoryEntry; indexes: { 'by-ts': number } };
  bookmarks: { key: string; value: Bookmark; indexes: { 'by-ts': number } };
  notes: { key: string; value: Note };
}

export type LawDb = IDBPDatabase<LawDbSchema>;

const HISTORY_LIMIT = 200;

export function articleKey(pcode: string, no: string): string {
  return `${pcode}:${no}`;
}

export async function openLawDb(name = 'law-lookup'): Promise<LawDb> {
  return openDB<LawDbSchema>(name, 1, {
    upgrade(db) {
      const history = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
      history.createIndex('by-ts', 'ts');
      const bookmarks = db.createObjectStore('bookmarks', { keyPath: 'key' });
      bookmarks.createIndex('by-ts', 'ts');
      db.createObjectStore('notes', { keyPath: 'key' });
    },
  });
}

export async function addHistory(db: LawDb, e: Omit<HistoryEntry, 'id'>): Promise<void> {
  await db.add('history', e as HistoryEntry);
  const tx = db.transaction('history', 'readwrite');
  const keys = await tx.store.index('by-ts').getAllKeys();
  const excess = keys.length - HISTORY_LIMIT;
  for (let i = 0; i < excess; i++) await tx.store.delete(keys[i]!);
  await tx.done;
}

export async function listHistory(db: LawDb, limit = 20): Promise<HistoryEntry[]> {
  const all = await db.getAllFromIndex('history', 'by-ts');
  return all.reverse().slice(0, limit);
}

export async function toggleBookmark(db: LawDb, pcode: string, no: string): Promise<boolean> {
  const key = articleKey(pcode, no);
  if (await db.get('bookmarks', key)) {
    await db.delete('bookmarks', key);
    return false;
  }
  await db.put('bookmarks', { key, pcode, no, ts: Date.now() });
  return true;
}

export async function listBookmarks(db: LawDb): Promise<Bookmark[]> {
  return (await db.getAllFromIndex('bookmarks', 'by-ts')).reverse();
}

export async function getNote(db: LawDb, pcode: string, no: string): Promise<Note | undefined> {
  return db.get('notes', articleKey(pcode, no));
}

export async function putNote(
  db: LawDb, pcode: string, no: string, body: string, lawVersionAtWrite: string
): Promise<void> {
  const key = articleKey(pcode, no);
  if (body.trim() === '') {
    await db.delete('notes', key);
    return;
  }
  await db.put('notes', { key, pcode, no, body, updatedAt: Date.now(), lawVersionAtWrite });
}

export async function listNotes(db: LawDb): Promise<Note[]> {
  return db.getAll('notes');
}
```

- [ ] **Step 4: 執行測試,確認通過**

Run: `npx vitest run src/store/db.test.ts`
Expected: PASS(10 個測試)

- [ ] **Step 5: Commit**

```bash
git add src/store/db.ts src/store/db.test.ts
git commit -m "feat: IndexedDB 個人資料層

筆記記錄寫入當下的法規版本(lawVersionAtWrite),供日後偵測
「筆記寫於修法之前」。"
```

---

### Task 10: 匯出與匯入

**Files:**
- Create: `src/store/transfer.ts`
- Test: `src/store/transfer.test.ts`

**Interfaces:**
- Consumes: `LawDb` 與各 store 型別(Task 9)
- Produces:
  - `type Backup = { version: 1; exportedAt: string; history: HistoryEntry[]; bookmarks: Bookmark[]; notes: Note[] }`
  - `exportAll(db: LawDb): Promise<Backup>`
  - `importAll(db: LawDb, data: unknown): Promise<{ history: number; bookmarks: number; notes: number }>`

匯入的輸入是**外部檔案**,型別完全不可信,必須逐欄驗證後才寫入。

- [ ] **Step 1: 寫下失敗的測試**

建立 `src/store/transfer.test.ts`:

```ts
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { openLawDb, putNote, toggleBookmark, addHistory, listNotes, listBookmarks, type LawDb } from './db';
import { exportAll, importAll } from './transfer';

let db: LawDb;
let n = 0;
beforeEach(async () => { db = await openLawDb(`transfer-${n++}`); });

describe('exportAll', () => {
  it('匯出三個 store 的完整內容', async () => {
    await putNote(db, 'B0000001', '184', '# 筆記', '20260817');
    await toggleBookmark(db, 'C0000001', '271');
    await addHistory(db, { ts: 1, query: '民184', pcode: 'B0000001', no: '184' });

    const backup = await exportAll(db);
    expect(backup.version).toBe(1);
    expect(Date.parse(backup.exportedAt)).not.toBeNaN();
    expect(backup.notes).toHaveLength(1);
    expect(backup.bookmarks).toHaveLength(1);
    expect(backup.history).toHaveLength(1);
  });
});

describe('importAll', () => {
  it('匯入後可讀出', async () => {
    const backup = {
      version: 1,
      exportedAt: '2026-09-03T00:00:00.000Z',
      history: [{ ts: 1, query: '民184', pcode: 'B0000001', no: '184' }],
      bookmarks: [{ key: 'C0000001:271', pcode: 'C0000001', no: '271', ts: 1 }],
      notes: [{
        key: 'B0000001:184', pcode: 'B0000001', no: '184',
        body: '# 筆記', updatedAt: 1, lawVersionAtWrite: '20260817',
      }],
    };
    const counts = await importAll(db, backup);
    expect(counts).toEqual({ history: 1, bookmarks: 1, notes: 1 });
    expect(await listNotes(db)).toHaveLength(1);
    expect(await listBookmarks(db)).toHaveLength(1);
  });

  it('匯出再匯入可還原', async () => {
    await putNote(db, 'B0000001', '184', '原始筆記', '20260817');
    const backup = await exportAll(db);
    const db2 = await openLawDb(`transfer-restore-${n++}`);
    await importAll(db2, backup);
    expect((await listNotes(db2))[0]?.body).toBe('原始筆記');
  });

  it('拒絕非物件輸入', async () => {
    await expect(importAll(db, null)).rejects.toThrow(/格式不正確/);
    await expect(importAll(db, '字串')).rejects.toThrow(/格式不正確/);
  });

  it('拒絕不支援的版本', async () => {
    await expect(
      importAll(db, { version: 99, history: [], bookmarks: [], notes: [] })
    ).rejects.toThrow(/不支援的備份版本/);
  });

  it('跳過欄位不合法的紀錄,不整批失敗', async () => {
    const counts = await importAll(db, {
      version: 1,
      history: [],
      bookmarks: [{ key: 'ok', pcode: 'B0000001', no: '1', ts: 1 }, { pcode: 123 }],
      notes: [{ nope: true }],
    });
    expect(counts.bookmarks).toBe(1);
    expect(counts.notes).toBe(0);
  });
});
```

- [ ] **Step 2: 執行測試,確認失敗**

Run: `npx vitest run src/store/transfer.test.ts`
Expected: FAIL — 無法解析 `./transfer`

- [ ] **Step 3: 實作匯出匯入**

建立 `src/store/transfer.ts`:

```ts
import { articleKey, type Bookmark, type HistoryEntry, type LawDb, type Note } from './db';

export type Backup = {
  version: 1;
  exportedAt: string;
  history: HistoryEntry[];
  bookmarks: Bookmark[];
  notes: Note[];
};

export async function exportAll(db: LawDb): Promise<Backup> {
  const [history, bookmarks, notes] = await Promise.all([
    db.getAll('history'),
    db.getAll('bookmarks'),
    db.getAll('notes'),
  ]);
  return { version: 1, exportedAt: new Date().toISOString(), history, bookmarks, notes };
}

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function asHistory(v: unknown): Omit<HistoryEntry, 'id'> | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!isNum(o.ts) || !isStr(o.query) || !isStr(o.pcode) || !isStr(o.no)) return null;
  return { ts: o.ts, query: o.query, pcode: o.pcode, no: o.no };
}

function asBookmark(v: unknown): Bookmark | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!isStr(o.pcode) || !isStr(o.no) || !isNum(o.ts)) return null;
  return { key: articleKey(o.pcode, o.no), pcode: o.pcode, no: o.no, ts: o.ts };
}

function asNote(v: unknown): Note | null {
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!isStr(o.pcode) || !isStr(o.no) || !isStr(o.body)) return null;
  return {
    key: articleKey(o.pcode, o.no),
    pcode: o.pcode,
    no: o.no,
    body: o.body,
    updatedAt: isNum(o.updatedAt) ? o.updatedAt : Date.now(),
    lawVersionAtWrite: isStr(o.lawVersionAtWrite) ? o.lawVersionAtWrite : '',
  };
}

/**
 * 匯入外部備份檔。輸入來自使用者選擇的檔案,型別完全不可信,
 * 因此逐欄驗證;個別紀錄不合法就跳過,不讓整批匯入失敗。
 */
export async function importAll(
  db: LawDb,
  data: unknown
): Promise<{ history: number; bookmarks: number; notes: number }> {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('備份檔格式不正確:預期為物件');
  }
  const o = data as Record<string, unknown>;
  if (o.version !== 1) {
    throw new Error(`不支援的備份版本:${String(o.version)}`);
  }

  const counts = { history: 0, bookmarks: 0, notes: 0 };

  for (const raw of Array.isArray(o.history) ? o.history : []) {
    const e = asHistory(raw);
    if (!e) continue;
    await db.add('history', e as HistoryEntry);
    counts.history++;
  }
  for (const raw of Array.isArray(o.bookmarks) ? o.bookmarks : []) {
    const b = asBookmark(raw);
    if (!b) continue;
    await db.put('bookmarks', b);
    counts.bookmarks++;
  }
  for (const raw of Array.isArray(o.notes) ? o.notes : []) {
    const note = asNote(raw);
    if (!note) continue;
    await db.put('notes', note);
    counts.notes++;
  }
  return counts;
}
```

- [ ] **Step 4: 執行測試,確認通過**

Run: `npx vitest run src/store/transfer.test.ts`
Expected: PASS(7 個測試)

- [ ] **Step 5: Commit**

```bash
git add src/store/transfer.ts src/store/transfer.test.ts
git commit -m "feat: 備份匯出與匯入

匯入的來源是使用者選擇的外部檔案,型別完全不可信,因此逐欄驗證。
個別紀錄不合法只跳過該筆,不讓整批匯入失敗。"
```

---

### Task 11: UI 骨架與 corpus 載入

**Files:**
- Modify: `package.json`(新增測試用依賴)
- Create: `src/main.tsx`, `src/ui/App.tsx`, `src/ui/useCorpus.ts`, `src/ui/app.css`
- Test: `src/ui/useCorpus.test.tsx`

**Interfaces:**
- Consumes: `Corpus`(Task 1)
- Produces:
  - `type CorpusStatus = { state:'loading' } | { state:'ready'; corpus: Corpus } | { state:'error'; message: string }`
  - `useCorpus(url?: string): CorpusStatus`
  - `<App />` — 雙欄骨架,左欄 340 px

- [ ] **Step 1: 新增測試依賴**

在 `package.json` 的 `devDependencies` 加入:

```json
"@testing-library/react": "^16.1.0",
"@testing-library/user-event": "^14.5.2"
```

執行 `npm install`。

- [ ] **Step 2: 寫下失敗的測試**

建立 `src/ui/useCorpus.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCorpus } from './useCorpus';
import type { Corpus } from '../core/types';

const corpus: Corpus = {
  sourceUpdatedAt: '2026/8/21',
  builtAt: '2026-09-03T00:00:00.000Z',
  laws: [],
};

afterEach(() => vi.unstubAllGlobals());

describe('useCorpus', () => {
  it('初始為 loading', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { result } = renderHook(() => useCorpus());
    expect(result.current.state).toBe('loading');
  });

  it('載入成功後回傳 corpus', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => corpus })));
    const { result } = renderHook(() => useCorpus());
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current).toEqual({ state: 'ready', corpus });
  });

  it('HTTP 錯誤時回傳可讀訊息', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, statusText: 'Not Found' })));
    const { result } = renderHook(() => useCorpus());
    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current).toMatchObject({ state: 'error', message: expect.stringContaining('404') });
  });

  it('網路失敗時回傳可讀訊息', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const { result } = renderHook(() => useCorpus());
    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current).toMatchObject({ state: 'error', message: expect.stringContaining('offline') });
  });
});
```

- [ ] **Step 3: 執行測試,確認失敗**

Run: `npx vitest run src/ui/useCorpus.test.tsx`
Expected: FAIL — 無法解析 `./useCorpus`

- [ ] **Step 4: 實作 corpus 載入**

建立 `src/ui/useCorpus.ts`:

```ts
import { useEffect, useState } from 'react';
import type { Corpus } from '../core/types';

export type CorpusStatus =
  | { state: 'loading' }
  | { state: 'ready'; corpus: Corpus }
  | { state: 'error'; message: string };

export function useCorpus(url = '/corpus.json'): CorpusStatus {
  const [status, setStatus] = useState<CorpusStatus>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        const corpus = (await res.json()) as Corpus;
        if (!cancelled) setStatus({ state: 'ready', corpus });
      } catch (e) {
        if (!cancelled) setStatus({ state: 'error', message: (e as Error).message });
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  return status;
}
```

- [ ] **Step 5: 建立 App 骨架與樣式**

建立 `src/ui/app.css`:

```css
:root {
  --bg: #fff;
  --fg: #1a1a1a;
  --muted: #666;
  --line: #e3e3e3;
  --accent: #0066cc;
  --sel: #e8f1fb;
  --mark: #fff1a8;
  --pane: 340px;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font: 15px/1.75 system-ui, -apple-system, "Noto Sans TC", sans-serif;
  color: var(--fg);
  background: var(--bg);
}

.app { display: grid; grid-template-columns: var(--pane) 1fr; height: 100vh; }

.pane-left {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--line);
  min-width: 0;
}

.pane-right { overflow-y: auto; padding: 2rem 2.5rem 60vh; }

.search-input {
  width: 100%;
  padding: 0.9rem 1rem;
  border: 0;
  border-bottom: 1px solid var(--line);
  font: inherit;
  font-size: 1.05rem;
  outline: none;
}

.result-scroll { flex: 1; overflow-y: auto; }

.status { padding: 2rem; color: var(--muted); }
.status-error { color: #c00; }

mark { background: var(--mark); color: inherit; }
```

建立 `src/ui/App.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { useCorpus } from './useCorpus';
import { AliasIndex } from '../core/alias';
import { parseQuery } from '../core/parseQuery';
import { search } from '../core/search';
import type { Law } from '../core/types';
import './app.css';

export type ReaderTarget = { pcode: string; no: string } | null;

export function App() {
  const status = useCorpus();

  if (status.state === 'loading') {
    return <div className="status">載入法規資料中…</div>;
  }
  if (status.state === 'error') {
    return (
      <div className="status status-error">
        法規資料載入失敗:{status.message}
        <br />
        請確認已執行 <code>npm run data</code>。
      </div>
    );
  }
  return <Workspace corpus={status.corpus} />;
}

function Workspace({ corpus }: { corpus: import('../core/types').Corpus }) {
  const [query, setQuery] = useState('');
  const [reader, setReader] = useState<ReaderTarget>(null);

  const index = useMemo(() => new AliasIndex(corpus.laws), [corpus]);
  const outcome = useMemo(
    () => search(corpus, parseQuery(query, index), { currentPcode: reader?.pcode ?? null }),
    [corpus, query, index, reader?.pcode]
  );

  const law: Law | null = reader
    ? corpus.laws.find((l) => l.pcode === reader.pcode) ?? null
    : null;

  return (
    <div className="app">
      <div className="pane-left">
        <input
          className="search-input"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="民184 / 過失 / 民法 損害賠償"
          aria-label="搜尋法條"
        />
        <div className="result-scroll">
          {/* Task 12 填入結果清單 */}
          <div className="status">共 {outcome.totalArticles} 條命中</div>
        </div>
      </div>
      <div className="pane-right">
        {/* Task 13 填入閱讀區 */}
        {law ? <h1>{law.abbr}</h1> : <div className="status">輸入關鍵字或條號開始查詢</div>}
      </div>
    </div>
  );
}
```

建立 `src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 6: 執行測試,確認通過**

Run: `npx vitest run src/ui/useCorpus.test.tsx`
Expected: PASS(4 個測試)

- [ ] **Step 7: 手動確認畫面**

Run: `npm run dev`,開啟瀏覽器。
Expected: 出現雙欄版面,左欄有搜尋框且已聚焦;輸入「過失」後左欄顯示命中數。

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/main.tsx src/ui/
git commit -m "feat: UI 骨架與 corpus 載入"
```

---

### Task 12: 左欄結果清單與高亮

**Files:**
- Create: `src/ui/Highlight.tsx`, `src/ui/ResultList.tsx`
- Modify: `src/ui/App.tsx`, `src/ui/app.css`
- Test: `src/ui/Highlight.test.tsx`, `src/ui/ResultList.test.tsx`

**Interfaces:**
- Consumes: `Hit` / `ResultGroup` / `ArticleResult` / `SearchOutcome`(Tasks 7-8)
- Produces:
  - `<Highlight text={string} hits={Hit[]} />`
  - `<ResultList groups={ResultGroup[]} selected={number} onSelect={(i:number)=>void} />`
  - `flatResults(groups: ResultGroup[]): ArticleResult[]` — 由 `ResultList.tsx` 匯出,供 App 與鍵盤模組共用

- [ ] **Step 1: 寫下失敗的測試**

建立 `src/ui/Highlight.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Highlight } from './Highlight';

describe('Highlight', () => {
  it('無命中時原樣輸出', () => {
    const { container } = render(<Highlight text="因故意或過失" hits={[]} />);
    expect(container.textContent).toBe('因故意或過失');
    expect(container.querySelectorAll('mark')).toHaveLength(0);
  });

  it('包裹單一命中', () => {
    render(<Highlight text="因故意或過失" hits={[{ start: 4, length: 2 }]} />);
    expect(screen.getByText('過失').tagName).toBe('MARK');
  });

  it('包裹多處命中且完整保留原文', () => {
    const { container } = render(
      <Highlight text="過失,過失" hits={[{ start: 0, length: 2 }, { start: 3, length: 2 }]} />
    );
    expect(container.querySelectorAll('mark')).toHaveLength(2);
    expect(container.textContent).toBe('過失,過失');
  });

  it('重疊命中不重複包裹,文字不遺失', () => {
    const { container } = render(
      <Highlight text="損害賠償" hits={[{ start: 0, length: 2 }, { start: 1, length: 2 }]} />
    );
    expect(container.textContent).toBe('損害賠償');
  });
});
```

建立 `src/ui/ResultList.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResultList, flatResults } from './ResultList';
import type { ResultGroup } from '../core/search';
import type { Article } from '../core/types';

const article = (no: string, text: string): Article => ({
  t: 'a', no, main: Number(no), sub: 0, label: `第 ${no} 條`, text,
});

const groups: ResultGroup[] = [
  {
    pcode: 'B0000001', abbr: '民法',
    results: [
      { pcode: 'B0000001', abbr: '民法', article: article('184', '因故意或過失'), hits: [{ start: 4, length: 2 }] },
      { pcode: 'B0000001', abbr: '民法', article: article('191', '過失'), hits: [{ start: 0, length: 2 }] },
    ],
  },
  {
    pcode: 'C0000001', abbr: '刑法',
    results: [
      { pcode: 'C0000001', abbr: '刑法', article: article('284', '因過失傷害人者'), hits: [{ start: 1, length: 2 }] },
    ],
  },
];

describe('flatResults', () => {
  it('攤平為連續索引', () => {
    expect(flatResults(groups).map((r) => r.article.no)).toEqual(['184', '191', '284']);
  });
});

describe('ResultList', () => {
  it('顯示分組標題', () => {
    render(<ResultList groups={groups} selected={0} onSelect={() => {}} />);
    expect(screen.getByText('民法')).toBeDefined();
    expect(screen.getByText('刑法')).toBeDefined();
  });

  it('顯示條號與摘要,並高亮命中', () => {
    const { container } = render(<ResultList groups={groups} selected={0} onSelect={() => {}} />);
    expect(screen.getByText('第 184 條')).toBeDefined();
    expect(container.querySelectorAll('mark').length).toBeGreaterThan(0);
  });

  it('選取項目帶 aria-selected,且跨分組索引連續', () => {
    const { container } = render(<ResultList groups={groups} selected={2} onSelect={() => {}} />);
    const selected = container.querySelector('[aria-selected="true"]');
    expect(selected?.textContent).toContain('第 284 條');
  });

  it('點擊項目回呼其攤平索引', async () => {
    const onSelect = vi.fn();
    render(<ResultList groups={groups} selected={0} onSelect={onSelect} />);
    await userEvent.click(screen.getByText('第 191 條'));
    expect(onSelect).toHaveBeenCalledWith(1);
  });

  it('無結果時不渲染任何項目', () => {
    const { container } = render(<ResultList groups={[]} selected={0} onSelect={() => {}} />);
    expect(container.querySelectorAll('[role="option"]')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 執行測試,確認失敗**

Run: `npx vitest run src/ui/Highlight.test.tsx src/ui/ResultList.test.tsx`
Expected: FAIL — 無法解析 `./Highlight` 與 `./ResultList`

- [ ] **Step 3: 實作高亮元件**

建立 `src/ui/Highlight.tsx`:

```tsx
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
```

- [ ] **Step 4: 實作結果清單**

建立 `src/ui/ResultList.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import type { ArticleResult, ResultGroup } from '../core/search';
import { Highlight } from './Highlight';

export function flatResults(groups: ResultGroup[]): ArticleResult[] {
  return groups.flatMap((g) => g.results);
}

type Props = {
  groups: ResultGroup[];
  selected: number;
  onSelect: (index: number) => void;
};

export function ResultList({ groups, selected, onSelect }: Props) {
  const selectedRef = useRef<HTMLLIElement>(null);

  // 讓鍵盤移動時選取項目始終可見(這是左欄自身的捲動,與右欄無關)
  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  let index = -1;
  return (
    <ul className="results" role="listbox" aria-label="搜尋結果">
      {groups.map((g) => (
        <li key={g.pcode} className="group">
          <div className="group-title">
            {g.abbr}
            <span className="group-count">{g.results.length}</span>
          </div>
          <ul className="group-items">
            {g.results.map((r) => {
              index += 1;
              const i = index;
              const isSelected = i === selected;
              return (
                <li
                  key={r.article.no}
                  ref={isSelected ? selectedRef : undefined}
                  role="option"
                  aria-selected={isSelected}
                  className={isSelected ? 'item item-selected' : 'item'}
                  onClick={() => onSelect(i)}
                >
                  <div className="item-no">{r.article.label}</div>
                  <div className="item-text">
                    <Highlight text={r.article.text} hits={r.hits} />
                  </div>
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 5: 加入樣式**

在 `src/ui/app.css` 追加:

```css
.results, .group-items { list-style: none; margin: 0; padding: 0; }

.group-title {
  position: sticky;
  top: 0;
  background: var(--bg);
  padding: 0.5rem 1rem 0.35rem;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--muted);
  border-bottom: 1px solid var(--line);
  display: flex;
  justify-content: space-between;
}

.item { padding: 0.5rem 1rem; cursor: pointer; border-bottom: 1px solid #f3f3f3; }
.item:hover { background: #fafafa; }
.item-selected { background: var(--sel); }
.item-no { font-size: 0.85rem; color: var(--accent); font-weight: 600; }
.item-text {
  font-size: 0.9rem;
  color: var(--muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.summary { padding: 0.5rem 1rem; font-size: 0.8rem; color: var(--muted); }
.diagnosis { padding: 0.75rem 1rem; font-size: 0.85rem; color: #a05a00; background: #fff8e6; }
```

- [ ] **Step 6: 接進 App**

修改 `src/ui/App.tsx` 的 `Workspace`——把 `result-scroll` 區塊換成:

```tsx
        <div className="result-scroll">
          {outcome.totalArticles > 0 && (
            <div className="summary">
              共 {outcome.totalArticles} 條命中,分布於 {outcome.totalLaws} 部法規
            </div>
          )}
          {outcome.diagnosis && (
            <div className="diagnosis">
              「{outcome.diagnosis.term}」無命中,移除後有 {outcome.diagnosis.remaining} 條
            </div>
          )}
          <ResultList groups={outcome.groups} selected={selected} onSelect={setSelected} />
        </div>
```

並在 `Workspace` 中新增選取狀態(query 改變時歸零):

```tsx
  const [selected, setSelected] = useState(0);
  const flat = useMemo(() => flatResults(outcome.groups), [outcome]);

  useEffect(() => { setSelected(0); }, [query]);
```

`import` 加上 `ResultList`、`flatResults`、`useEffect`。

- [ ] **Step 7: 執行測試,確認通過**

Run: `npx vitest run src/ui/`
Expected: PASS(14 個測試)

- [ ] **Step 8: Commit**

```bash
git add src/ui/
git commit -m "feat: 左欄結果清單與命中高亮

結果依法規分組顯示,分組標題 sticky。攤平索引跨分組連續,
供鍵盤上下移動使用。"
```

---

### Task 13: 右欄連續閱讀區

**Files:**
- Create: `src/ui/ReaderPane.tsx`
- Modify: `src/ui/App.tsx`, `src/ui/app.css`
- Test: `src/ui/ReaderPane.test.tsx`

**Interfaces:**
- Consumes: `Law` / `Block` / `Article` / `Division`(Task 1)、`Hit`(Task 7)、`<Highlight>`(Task 12)
- Produces:
  - `<ReaderPane law={Law|null} targetNo={string|null} hitsByNo={Map<string,Hit[]>} />`
  - `articleDomId(no: string): string` — 產生 `article-<no>` 的 DOM id

**全渲染,不做虛擬捲動。** 實測民法 1439 條全渲染只需 30 ms 即可互動(spec §11.3)。虛擬捲動會帶來高度估算誤差與跳轉後往上捲的抖動,在此純屬多餘。

- [ ] **Step 1: 寫下失敗的測試**

建立 `src/ui/ReaderPane.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReaderPane, articleDomId } from './ReaderPane';
import type { Law } from '../core/types';

beforeAll(() => {
  // jsdom 未實作 scrollIntoView
  Element.prototype.scrollIntoView = vi.fn();
});

const law: Law = {
  pcode: 'B0000001', name: '民法', abbr: '民法', aliases: ['民'],
  group: '民法及關係法規', updated: '20260817', history: '1.制定',
  blocks: [
    { t: 'd', level: 0, label: '第 二 編 債' },
    { t: 'd', level: 1, label: '第 一 章 通則' },
    { t: 'a', no: '183', main: 183, sub: 0, label: '第 183 條', text: '不當得利之受領人。' },
    { t: 'a', no: '184', main: 184, sub: 0, label: '第 184 條', text: '因故意或過失。\n第二項內容。' },
    { t: 'a', no: '184-1', main: 184, sub: 1, label: '第 184-1 條', text: '之一條。' },
  ],
};

describe('articleDomId', () => {
  it('產生穩定的 DOM id', () => {
    expect(articleDomId('184-1')).toBe('article-184-1');
  });
});

describe('ReaderPane', () => {
  it('未選法規時顯示提示', () => {
    render(<ReaderPane law={null} targetNo={null} hitsByNo={new Map()} />);
    expect(screen.getByText(/輸入關鍵字或條號/)).toBeDefined();
  });

  it('渲染整部法規的全部條文,不做虛擬捲動', () => {
    const { container } = render(<ReaderPane law={law} targetNo={null} hitsByNo={new Map()} />);
    expect(container.querySelectorAll('article')).toHaveLength(3);
  });

  it('渲染編章節標題並保留層級', () => {
    const { container } = render(<ReaderPane law={law} targetNo={null} hitsByNo={new Map()} />);
    const divisions = container.querySelectorAll('.division');
    expect(divisions).toHaveLength(2);
    expect(divisions[0]!.getAttribute('data-level')).toBe('0');
    expect(divisions[1]!.getAttribute('data-level')).toBe('1');
  });

  it('條文各項分段渲染', () => {
    const { container } = render(<ReaderPane law={law} targetNo="184" hitsByNo={new Map()} />);
    const article = container.querySelector('#article-184')!;
    expect(article.querySelectorAll('p')).toHaveLength(2);
  });

  it('targetNo 變更時捲動到該條', () => {
    const spy = vi.spyOn(Element.prototype, 'scrollIntoView');
    const { rerender } = render(<ReaderPane law={law} targetNo="183" hitsByNo={new Map()} />);
    spy.mockClear();
    rerender(<ReaderPane law={law} targetNo="184-1" hitsByNo={new Map()} />);
    expect(spy).toHaveBeenCalled();
  });

  it('套用命中高亮', () => {
    const hits = new Map([['184', [{ start: 1, length: 2 }]]]);
    const { container } = render(<ReaderPane law={law} targetNo="184" hitsByNo={hits} />);
    expect(container.querySelector('#article-184 mark')?.textContent).toBe('故意');
  });

  it('顯示法規名稱與資料版本', () => {
    render(<ReaderPane law={law} targetNo={null} hitsByNo={new Map()} />);
    expect(screen.getByText('民法')).toBeDefined();
    expect(screen.getByText(/2026-08-17/)).toBeDefined();
  });
});
```

- [ ] **Step 2: 執行測試,確認失敗**

Run: `npx vitest run src/ui/ReaderPane.test.tsx`
Expected: FAIL — 無法解析 `./ReaderPane`

- [ ] **Step 3: 實作閱讀區**

建立 `src/ui/ReaderPane.tsx`:

```tsx
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
    const el = rootRef.current?.querySelector(`#${CSS.escape(articleDomId(targetNo))}`);
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
```

- [ ] **Step 4: 加入樣式(含 sticky 章節標題)**

在 `src/ui/app.css` 追加:

```css
.reader { max-width: 46rem; }
.reader-head { margin-bottom: 2rem; }
.reader-head h1 { margin: 0; font-size: 1.5rem; }
.reader-meta { color: var(--muted); font-size: 0.85rem; }

/* sticky 章節標題 = 紙本小六法的書眉:往下捲時永遠知道自己在第幾編第幾章 */
.division {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg);
  padding: 0.6rem 0 0.4rem;
  font-weight: 600;
  border-bottom: 1px solid var(--line);
}

.article { margin: 0 0 1.5rem; scroll-margin-top: 3rem; }
.article-no { display: block; color: var(--accent); font-size: 0.9rem; }
.article p { margin: 0.25rem 0; }
.article-target { background: #fffdf2; }
```

- [ ] **Step 5: 接進 App**

在 `Workspace` 中新增 `hitsByNo`,並把 `pane-right` 換成 `<ReaderPane>`:

```tsx
  const hitsByNo = useMemo(() => {
    const m = new Map<string, Hit[]>();
    if (!reader) return m;
    for (const g of outcome.groups) {
      if (g.pcode !== reader.pcode) continue;
      for (const r of g.results) m.set(r.article.no, r.hits);
    }
    return m;
  }, [outcome, reader]);
```

```tsx
      <div className="pane-right">
        <ReaderPane law={law} targetNo={reader?.no ?? null} hitsByNo={hitsByNo} />
      </div>
```

- [ ] **Step 6: 執行測試,確認通過**

Run: `npx vitest run src/ui/ReaderPane.test.tsx`
Expected: PASS(8 個測試)

- [ ] **Step 7: Commit**

```bash
git add src/ui/
git commit -m "feat: 右欄連續閱讀區

整部法規全渲染,以原生捲動與 scrollIntoView 定位。實測民法
1439 條全渲染 30ms 可互動,虛擬捲動在此只會帶來高度估算誤差
與跳轉後往上捲的抖動。編章節標題 sticky,等同紙本書眉。"
```

---

### Task 14: 鍵盤操作與單向同步

**Files:**
- Create: `src/ui/useKeyboard.ts`
- Modify: `src/ui/App.tsx`
- Test: `src/ui/useKeyboard.test.tsx`

**Interfaces:**
- Consumes: `flatResults`(Task 12)
- Produces:
  - `useKeyboard(opts: { count: number; selected: number; onMove: (i:number)=>void; onEnter: ()=>void; onEscape: ()=>void; onDivision: (dir: -1|1)=>void; onBookmark: ()=>void }): void`

**單向同步是本任務的重點。** 左欄選取移動時右欄跟隨跳轉;**右欄自行捲動時左欄選取不變**。若做成雙向,使用者為了讀鄰近條文往下捲兩頁,左欄選取會一路跳動。因此 App 中沒有任何「右欄捲動 → 更新選取」的監聽器,這是刻意的省略。

- [ ] **Step 1: 寫下失敗的測試**

建立 `src/ui/useKeyboard.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboard } from './useKeyboard';

function setup(over: Partial<Parameters<typeof useKeyboard>[0]> = {}) {
  const opts = {
    count: 3, selected: 1,
    onMove: vi.fn(), onEnter: vi.fn(), onEscape: vi.fn(),
    onDivision: vi.fn(), onBookmark: vi.fn(),
    ...over,
  };
  renderHook(() => useKeyboard(opts));
  return opts;
}

const press = (key: string, init: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));

describe('useKeyboard', () => {
  it('↓ 往下移動', () => {
    const o = setup();
    press('ArrowDown');
    expect(o.onMove).toHaveBeenCalledWith(2);
  });

  it('↑ 往上移動', () => {
    const o = setup();
    press('ArrowUp');
    expect(o.onMove).toHaveBeenCalledWith(0);
  });

  it('在尾端按 ↓ 不越界', () => {
    const o = setup({ selected: 2 });
    press('ArrowDown');
    expect(o.onMove).toHaveBeenCalledWith(2);
  });

  it('在頂端按 ↑ 不越界', () => {
    const o = setup({ selected: 0 });
    press('ArrowUp');
    expect(o.onMove).toHaveBeenCalledWith(0);
  });

  it('無結果時方向鍵不觸發', () => {
    const o = setup({ count: 0 });
    press('ArrowDown');
    expect(o.onMove).not.toHaveBeenCalled();
  });

  it('Enter 進入閱讀', () => {
    const o = setup();
    press('Enter');
    expect(o.onEnter).toHaveBeenCalled();
  });

  it('Escape 觸發清空', () => {
    const o = setup();
    press('Escape');
    expect(o.onEscape).toHaveBeenCalled();
  });

  it('[ 與 ] 跳章節', () => {
    const o = setup();
    press('[');
    expect(o.onDivision).toHaveBeenCalledWith(-1);
    press(']');
    expect(o.onDivision).toHaveBeenCalledWith(1);
  });

  it('Cmd+D 加書籤', () => {
    const o = setup();
    press('d', { metaKey: true });
    expect(o.onBookmark).toHaveBeenCalled();
  });

  it('在 textarea 中輸入時不攔截方向鍵', () => {
    const o = setup();
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(o.onMove).not.toHaveBeenCalled();
    ta.remove();
  });
});
```

- [ ] **Step 2: 執行測試,確認失敗**

Run: `npx vitest run src/ui/useKeyboard.test.tsx`
Expected: FAIL — 無法解析 `./useKeyboard`

- [ ] **Step 3: 實作鍵盤模組**

建立 `src/ui/useKeyboard.ts`:

```ts
import { useEffect } from 'react';

type Options = {
  count: number;
  selected: number;
  onMove: (index: number) => void;
  onEnter: () => void;
  onEscape: () => void;
  onDivision: (dir: -1 | 1) => void;
  onBookmark: () => void;
};

export function useKeyboard(opts: Options): void {
  const { count, selected, onMove, onEnter, onEscape, onDivision, onBookmark } = opts;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 筆記編輯中不攔截任何導航鍵
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'TEXTAREA') return;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        onBookmark();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case 'ArrowDown':
          if (count === 0) return;
          e.preventDefault();
          onMove(Math.min(selected + 1, count - 1));
          return;
        case 'ArrowUp':
          if (count === 0) return;
          e.preventDefault();
          onMove(Math.max(selected - 1, 0));
          return;
        case 'Enter':
          onEnter();
          return;
        case 'Escape':
          onEscape();
          return;
        case '[':
          onDivision(-1);
          return;
        case ']':
          onDivision(1);
          return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [count, selected, onMove, onEnter, onEscape, onDivision, onBookmark]);
}
```

- [ ] **Step 4: 接進 App**

在 `Workspace` 中加入:

```tsx
  const inputRef = useRef<HTMLInputElement>(null);
  const readerRef = useRef<HTMLDivElement>(null);

  // 單向同步:選取變動 → 右欄跟隨。右欄自行捲動時「不」回頭改變選取,
  // 否則往下讀兩頁鄰近條文,左欄選取會一路跳動。
  useEffect(() => {
    const r = flat[selected];
    if (r) setReader({ pcode: r.pcode, no: r.article.no });
  }, [flat, selected]);

  // 條號查詢的直接跳轉
  useEffect(() => {
    if (outcome.jumpTo) setReader(outcome.jumpTo);
  }, [outcome.jumpTo?.pcode, outcome.jumpTo?.no]);

  const jumpDivision = (dir: -1 | 1) => {
    const divisions = readerRef.current?.querySelectorAll('.division');
    if (!divisions?.length) return;
    const top = readerRef.current!.scrollTop;
    const list = [...divisions] as HTMLElement[];
    const next = dir === 1
      ? list.find((d) => d.offsetTop > top + 4)
      : [...list].reverse().find((d) => d.offsetTop < top - 4);
    next?.scrollIntoView({ block: 'start' });
  };

  useKeyboard({
    count: flat.length,
    selected,
    onMove: setSelected,
    onEnter: () => readerRef.current?.focus(),
    onEscape: () => {
      if (query) setQuery('');
      inputRef.current?.focus();
    },
    onDivision: jumpDivision,
    onBookmark: () => { /* Task 16 接上書籤 */ },
  });
```

把 `ref={inputRef}` 加到搜尋框,`ref={readerRef} tabIndex={-1}` 加到 `pane-right` 的 div。

- [ ] **Step 5: 執行測試,確認通過**

Run: `npx vitest run src/ui/useKeyboard.test.tsx`
Expected: PASS(10 個測試)

- [ ] **Step 6: 手動確認鍵盤流**

Run: `npm run dev`
Expected: 輸入「過失」→ 按 `↓` 數次,右欄同步跳到各條 → 用滑鼠往下捲兩頁,左欄選取**不變** → 按 `Esc` 清空並回到搜尋框。

- [ ] **Step 7: Commit**

```bash
git add src/ui/
git commit -m "feat: 鍵盤操作與單向同步

刻意不監聽右欄捲動來反向更新左欄選取:雙向同步會讓使用者往下
讀鄰近條文時,左欄選取一路跳動。"
```

---

### Task 15: 筆記(Markdown 編輯 / 預覽與修法偵測)

**Files:**
- Create: `src/ui/markdown.ts`, `src/ui/NoteEditor.tsx`, `src/ui/useLawDb.ts`
- Modify: `src/ui/ReaderPane.tsx`, `src/ui/app.css`
- Test: `src/ui/markdown.test.ts`, `src/ui/NoteEditor.test.tsx`

**Interfaces:**
- Consumes: `LawDb` / `Note` / `getNote` / `putNote`(Task 9)
- Produces:
  - `renderMarkdown(md: string): string` — 經 DOMPurify sanitize 的 HTML
  - `staleNoteWarning(note: Note | undefined, lawUpdated: string): string | null`
  - `useLawDb(): LawDb | null`
  - `<NoteEditor pcode no lawUpdated note db onSaved />` — 筆記由外部以 prop 傳入,元件本身不讀資料庫
  - `useNotes(db): { notes: Map<string, Note>; reload: () => void }` — 一次載入全部筆記

**sanitize 不是可選的。** 筆記雖然出自使用者自己,但 Task 10 的匯入功能會接受外部 JSON 檔;未經 sanitize 的渲染路徑等於給匯入開了一個 XSS 缺口。

- [ ] **Step 1: 寫下失敗的測試**

建立 `src/ui/markdown.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderMarkdown, staleNoteWarning } from './markdown';
import type { Note } from '../store/db';

const note = (over: Partial<Note> = {}): Note => ({
  key: 'B0000001:184', pcode: 'B0000001', no: '184',
  body: '筆記', updatedAt: 1, lawVersionAtWrite: '20260817', ...over,
});

describe('renderMarkdown', () => {
  it('渲染標題與清單', () => {
    const html = renderMarkdown('# 侵權行為\n\n- 故意\n- 過失');
    expect(html).toContain('<h1>侵權行為</h1>');
    expect(html).toContain('<li>故意</li>');
  });

  it('渲染粗體與行內程式碼', () => {
    expect(renderMarkdown('**要件**')).toContain('<strong>要件</strong>');
  });

  it('移除 script 標籤', () => {
    const html = renderMarkdown('安全<script>alert(1)</script>');
    expect(html).not.toContain('<script');
    expect(html).toContain('安全');
  });

  it('移除事件屬性', () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain('onerror');
  });

  it('移除 javascript: 連結', () => {
    const html = renderMarkdown('[點我](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
  });
});

describe('staleNoteWarning', () => {
  it('版本相同時不警示', () => {
    expect(staleNoteWarning(note(), '20260817')).toBeNull();
  });

  it('法規已修正時警示,並以可讀日期呈現', () => {
    const msg = staleNoteWarning(note({ lawVersionAtWrite: '20240101' }), '20260817');
    expect(msg).toContain('2026-08-17');
    expect(msg).toContain('修正前');
  });

  it('沒有筆記時不警示', () => {
    expect(staleNoteWarning(undefined, '20260817')).toBeNull();
  });

  it('舊備份沒有版本資訊時不警示(無從判斷)', () => {
    expect(staleNoteWarning(note({ lawVersionAtWrite: '' }), '20260817')).toBeNull();
  });
});
```

建立 `src/ui/NoteEditor.test.tsx`:

```tsx
// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NoteEditor } from './NoteEditor';
import { openLawDb, getNote, articleKey, type LawDb, type Note } from '../store/db';

let db: LawDb;
let n = 0;
beforeEach(async () => { db = await openLawDb(`note-${n++}`); });

const note = (body: string, version = '20260817'): Note => ({
  key: articleKey('B0000001', '184'),
  pcode: 'B0000001', no: '184', body, updatedAt: 1, lawVersionAtWrite: version,
});

const base = {
  pcode: 'B0000001', no: '184', lawUpdated: '20260817', onSaved: () => {},
};

describe('NoteEditor', () => {
  it('沒有筆記時顯示新增入口', () => {
    render(<NoteEditor {...base} note={undefined} db={db} />);
    expect(screen.getByRole('button', { name: /新增筆記/ })).toBeDefined();
  });

  it('既有筆記以渲染後的 HTML 呈現', () => {
    const { container } = render(<NoteEditor {...base} note={note('# 侵權行為')} db={db} />);
    expect(container.querySelector('h1')?.textContent).toBe('侵權行為');
  });

  it('點擊後進入編輯,顯示原始 Markdown', async () => {
    render(<NoteEditor {...base} note={note('# 侵權行為')} db={db} />);
    await userEvent.click(document.querySelector('.note-preview')!);
    const ta = (await screen.findByRole('textbox')) as HTMLTextAreaElement;
    expect(ta.value).toBe('# 侵權行為');
  });

  it('輸入後自動儲存,並回呼 onSaved', async () => {
    const onSaved = vi.fn();
    render(<NoteEditor {...base} onSaved={onSaved} note={undefined} db={db} />);
    await userEvent.click(screen.getByRole('button', { name: /新增筆記/ }));
    await userEvent.type(await screen.findByRole('textbox'), '**要件**');
    await waitFor(
      async () => expect((await getNote(db, 'B0000001', '184'))?.body).toBe('**要件**'),
      { timeout: 3000 }
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it('筆記寫於修法之前時顯示警示', () => {
    render(<NoteEditor {...base} note={note('舊筆記', '20240101')} db={db} />);
    expect(screen.getByText(/修正前/)).toBeDefined();
  });

  it('渲染時不讀取資料庫(避免整部法規觸發 N 次查詢)', () => {
    const spy = vi.spyOn(db, 'get');
    render(<NoteEditor {...base} note={note('內容')} db={db} />);
    expect(spy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 執行測試,確認失敗**

Run: `npx vitest run src/ui/markdown.test.ts src/ui/NoteEditor.test.tsx`
Expected: FAIL — 無法解析 `./markdown` 與 `./NoteEditor`

- [ ] **Step 3: 實作 Markdown 與修法偵測**

建立 `src/ui/markdown.ts`:

```ts
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { Note } from '../store/db';

/**
 * 渲染筆記。必須 sanitize:匯入功能會接受外部 JSON 檔,
 * 未 sanitize 的渲染路徑等於給匯入開了一個 XSS 缺口。
 */
export function renderMarkdown(md: string): string {
  const html = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(html);
}

function formatDate(yyyymmdd: string): string {
  if (!/^\d{8}$/.test(yyyymmdd)) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

/**
 * 不自動處理、不隱藏、不推測改了什麼,只告知需要重看。
 */
export function staleNoteWarning(note: Note | undefined, lawUpdated: string): string | null {
  if (!note || !note.lawVersionAtWrite) return null;
  if (note.lawVersionAtWrite === lawUpdated) return null;
  return `此條所屬法規已於 ${formatDate(lawUpdated)} 修正,你的筆記寫於修正前`;
}
```

- [ ] **Step 4: 實作資料庫 hook 與筆記編輯器**

建立 `src/ui/useLawDb.ts`:

```ts
import { useEffect, useState } from 'react';
import { openLawDb, type LawDb } from '../store/db';

export function useLawDb(): LawDb | null {
  const [db, setDb] = useState<LawDb | null>(null);
  useEffect(() => {
    let cancelled = false;
    openLawDb().then((d) => { if (!cancelled) setDb(d); });
    return () => { cancelled = true; };
  }, []);
  return db;
}
```

建立 `src/ui/NoteEditor.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { putNote, type LawDb, type Note } from '../store/db';
import { renderMarkdown, staleNoteWarning } from './markdown';

const SAVE_DEBOUNCE_MS = 500;

type Props = {
  pcode: string;
  no: string;
  lawUpdated: string;
  /** 由 App 一次載入後傳入。元件本身不讀資料庫——整部民法有 1439 條, *
   *  若每個 NoteEditor 各自 getNote,一次渲染就是 1439 次 IndexedDB 查詢。 */
  note: Note | undefined;
  db: LawDb | null;
  onSaved: () => void;
};

export function NoteEditor({ pcode, no, lawUpdated, note, db, onSaved }: Props) {
  const [body, setBody] = useState(note?.body ?? '');
  const [editing, setEditing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // 切換到別條時重置本地草稿
  useEffect(() => {
    setBody(note?.body ?? '');
    setEditing(false);
  }, [pcode, no, note?.body]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const onChange = (value: string) => {
    setBody(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (!db) return;
      await putNote(db, pcode, no, value, lawUpdated);
      onSaved();
    }, SAVE_DEBOUNCE_MS);
  };

  const warning = staleNoteWarning(note, lawUpdated);

  if (!editing && !body) {
    return (
      <button className="note-add" onClick={() => setEditing(true)}>
        + 新增筆記
      </button>
    );
  }

  return (
    <div className="note">
      {warning && <div className="note-warning">{warning}</div>}
      {editing ? (
        <textarea
          className="note-input"
          autoFocus
          value={body}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          placeholder="支援 Markdown"
        />
      ) : (
        <div
          className="note-preview"
          onClick={() => setEditing(true)}
          dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: 一次載入全部筆記,再掛進閱讀區**

在 `src/ui/useLawDb.ts` 追加:

```ts
import { listNotes, type Note } from '../store/db';

/** 一次載入全部筆記。整部民法有 1439 條,絕不可讓每個條文各自查資料庫。 */
export function useNotes(db: LawDb | null): { notes: Map<string, Note>; reload: () => void } {
  const [notes, setNotes] = useState<Map<string, Note>>(new Map());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!db) return;
    let cancelled = false;
    listNotes(db).then((all) => {
      if (!cancelled) setNotes(new Map(all.map((n) => [n.key, n])));
    });
    return () => { cancelled = true; };
  }, [db, tick]);

  return { notes, reload: () => setTick((t) => t + 1) };
}
```

修改 `src/ui/ReaderPane.tsx`,把 `Props` 與 `ArticleBlock` 改為:

```tsx
type Props = {
  law: Law | null;
  targetNo: string | null;
  hitsByNo: Map<string, Hit[]>;
  notes: Map<string, Note>;
  db: LawDb | null;
  onNoteSaved: () => void;
};
```

`law.blocks.map` 中條文分支改為:

```tsx
          <ArticleBlock
            key={b.no}
            pcode={law.pcode}
            lawUpdated={law.updated}
            article={b}
            hits={hitsByNo.get(b.no) ?? []}
            note={notes.get(articleKey(law.pcode, b.no))}
            db={db}
            onNoteSaved={onNoteSaved}
            isTarget={b.no === targetNo}
          />
```

`ArticleBlock` 的簽名與結尾改為:

```tsx
function ArticleBlock({
  pcode, lawUpdated, article, hits, note, db, onNoteSaved, isTarget,
}: {
  pcode: string; lawUpdated: string; article: Article; hits: Hit[];
  note: Note | undefined; db: LawDb | null; onNoteSaved: () => void; isTarget: boolean;
}) {
  // …分段與高亮換算的邏輯不變…

  return (
    <article id={articleDomId(article.no)} className={isTarget ? 'article article-target' : 'article'}>
      <b className="article-no">{article.label}</b>
      {paragraphs.map((p, i) => (
        <p key={i}>
          <Highlight text={p.line} hits={p.hits} />
        </p>
      ))}
      <NoteEditor
        pcode={pcode}
        no={article.no}
        lawUpdated={lawUpdated}
        note={note}
        db={db}
        onSaved={onNoteSaved}
      />
    </article>
  );
}
```

在 `ReaderPane.tsx` 補上 `import { articleKey, type LawDb, type Note } from '../store/db';` 與 `import { NoteEditor } from './NoteEditor';`。

在 `App.tsx` 的 `Workspace` 中:

```tsx
  const db = useLawDb();
  const { notes, reload: reloadNotes } = useNotes(db);
```

並把閱讀區改為:

```tsx
        <ReaderPane
          law={law}
          targetNo={reader?.no ?? null}
          hitsByNo={hitsByNo}
          notes={notes}
          db={db}
          onNoteSaved={reloadNotes}
        />
```

`ReaderPane.test.tsx` 既有的呼叫需補上 `notes={new Map()} db={null} onNoteSaved={() => {}}` 三個 prop。

- [ ] **Step 6: 加入樣式**

在 `src/ui/app.css` 追加:

```css
.note { margin: 0.5rem 0 0; border-left: 3px solid #ffd85c; padding-left: 0.75rem; }
.note-preview { font-size: 0.9rem; cursor: text; }
.note-preview :first-child { margin-top: 0; }
.note-input {
  width: 100%; min-height: 5rem; font: inherit; font-size: 0.9rem;
  border: 1px solid var(--line); border-radius: 4px; padding: 0.5rem; resize: vertical;
}
.note-warning { font-size: 0.8rem; color: #a05a00; margin-bottom: 0.35rem; }
.note-add {
  border: 0; background: none; color: var(--muted); font: inherit;
  font-size: 0.85rem; cursor: pointer; padding: 0.2rem 0; opacity: 0;
}
.article:hover .note-add, .article-target .note-add { opacity: 1; }
```

- [ ] **Step 7: 執行測試,確認通過**

Run: `npx vitest run src/ui/markdown.test.ts src/ui/NoteEditor.test.tsx`
Expected: PASS(15 個測試)

- [ ] **Step 8: Commit**

```bash
git add src/ui/
git commit -m "feat: 筆記 Markdown 編輯與修法偵測

渲染一律經 DOMPurify:匯入功能接受外部 JSON,未 sanitize 的
渲染路徑等於 XSS 缺口。修法偵測只提示不自動處理——不假裝知道
條文改了什麼,只告知需要重看。"
```

---

### Task 16: 書籤與歷史入口

**Files:**
- Create: `src/ui/SidePanel.tsx`
- Modify: `src/ui/App.tsx`, `src/ui/app.css`
- Test: `src/ui/SidePanel.test.tsx`

**Interfaces:**
- Consumes: `LawDb` / `listBookmarks` / `listHistory` / `addHistory` / `toggleBookmark`(Task 9)、`exportAll` / `importAll`(Task 10)
- Produces:
  - `<SidePanel db corpus onOpen />` — 搜尋框為空時顯示書籤與最近查詢,並提供匯出 / 匯入

- [ ] **Step 1: 寫下失敗的測試**

建立 `src/ui/SidePanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SidePanel } from './SidePanel';
import { openLawDb, toggleBookmark, addHistory, type LawDb } from '../store/db';
import type { Corpus } from '../core/types';

const corpus: Corpus = {
  sourceUpdatedAt: '2026/8/21',
  builtAt: '2026-09-03T00:00:00.000Z',
  laws: [
    { pcode: 'B0000001', name: '民法', abbr: '民法', aliases: ['民'],
      group: '民法及關係法規', updated: '20260817', history: '', blocks: [] },
  ],
};

let db: LawDb;
let n = 0;
beforeEach(async () => { db = await openLawDb(`side-${n++}`); });

describe('SidePanel', () => {
  it('沒有資料時顯示說明', async () => {
    render(<SidePanel db={db} corpus={corpus} onOpen={() => {}} />);
    expect(await screen.findByText(/還沒有書籤/)).toBeDefined();
  });

  it('列出書籤,顯示法規簡稱與條號', async () => {
    await toggleBookmark(db, 'B0000001', '184');
    render(<SidePanel db={db} corpus={corpus} onOpen={() => {}} />);
    expect(await screen.findByText('民法 184')).toBeDefined();
  });

  it('列出最近查詢', async () => {
    await addHistory(db, { ts: 1, query: '民184', pcode: 'B0000001', no: '184' });
    render(<SidePanel db={db} corpus={corpus} onOpen={() => {}} />);
    expect(await screen.findByText('民184')).toBeDefined();
  });

  it('點擊書籤回呼開啟目標', async () => {
    const onOpen = vi.fn();
    await toggleBookmark(db, 'B0000001', '184');
    render(<SidePanel db={db} corpus={corpus} onOpen={onOpen} />);
    await userEvent.click(await screen.findByText('民法 184'));
    expect(onOpen).toHaveBeenCalledWith({ pcode: 'B0000001', no: '184' });
  });

  it('提供匯出與匯入入口', async () => {
    render(<SidePanel db={db} corpus={corpus} onOpen={() => {}} />);
    expect(await screen.findByRole('button', { name: /匯出/ })).toBeDefined();
    expect(await screen.findByText(/匯入/)).toBeDefined();
  });
});
```

- [ ] **Step 2: 執行測試,確認失敗**

Run: `npx vitest run src/ui/SidePanel.test.tsx`
Expected: FAIL — 無法解析 `./SidePanel`

- [ ] **Step 3: 實作側欄面板**

建立 `src/ui/SidePanel.tsx`:

```tsx
import { useCallback, useEffect, useState } from 'react';
import {
  listBookmarks, listHistory, type Bookmark, type HistoryEntry, type LawDb,
} from '../store/db';
import { exportAll, importAll } from '../store/transfer';
import type { Corpus } from '../core/types';

type Target = { pcode: string; no: string };

type Props = {
  db: LawDb | null;
  corpus: Corpus;
  onOpen: (t: Target) => void;
};

export function SidePanel({ db, corpus, onOpen }: Props) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [message, setMessage] = useState('');

  const reload = useCallback(async () => {
    if (!db) return;
    setBookmarks(await listBookmarks(db));
    setHistory(await listHistory(db, 20));
  }, [db]);

  useEffect(() => { void reload(); }, [reload]);

  const abbr = (pcode: string) =>
    corpus.laws.find((l) => l.pcode === pcode)?.abbr ?? pcode;

  const onExport = async () => {
    if (!db) return;
    const backup = await exportAll(db);
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `law-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onImport = async (file: File) => {
    if (!db) return;
    try {
      const counts = await importAll(db, JSON.parse(await file.text()));
      setMessage(`已匯入 ${counts.notes} 則筆記、${counts.bookmarks} 個書籤`);
      await reload();
    } catch (e) {
      setMessage(`匯入失敗:${(e as Error).message}`);
    }
  };

  if (bookmarks.length === 0 && history.length === 0) {
    return (
      <div className="side">
        <div className="status">還沒有書籤或查詢紀錄。輸入關鍵字或條號開始查詢。</div>
        <Transfer onExport={onExport} onImport={onImport} message={message} />
      </div>
    );
  }

  return (
    <div className="side">
      {bookmarks.length > 0 && (
        <section>
          <div className="group-title">書籤</div>
          <ul className="group-items">
            {bookmarks.map((b) => (
              <li key={b.key} className="item" onClick={() => onOpen({ pcode: b.pcode, no: b.no })}>
                <div className="item-no">{`${abbr(b.pcode)} ${b.no}`}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {history.length > 0 && (
        <section>
          <div className="group-title">最近查詢</div>
          <ul className="group-items">
            {history.map((h) => (
              <li key={h.id} className="item" onClick={() => onOpen({ pcode: h.pcode, no: h.no })}>
                <div className="item-no">{h.query}</div>
                <div className="item-text">{`${abbr(h.pcode)} ${h.no}`}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Transfer onExport={onExport} onImport={onImport} message={message} />
    </div>
  );
}

function Transfer({
  onExport, onImport, message,
}: { onExport: () => void; onImport: (f: File) => void; message: string }) {
  return (
    <div className="transfer">
      <button onClick={onExport}>匯出備份</button>
      <label className="transfer-import">
        匯入備份
        <input
          type="file"
          accept="application/json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImport(f);
            e.target.value = '';
          }}
        />
      </label>
      {message && <div className="transfer-msg">{message}</div>}
    </div>
  );
}
```

- [ ] **Step 4: 接進 App 並接上書籤快捷鍵**

在 `Workspace` 中:

```tsx
  const [dbVersion, setDbVersion] = useState(0); // 書籤變動後強制 SidePanel 重載
```

`result-scroll` 內改為在查詢為空時渲染側欄:

```tsx
        <div className="result-scroll">
          {query === '' ? (
            <SidePanel key={dbVersion} db={db} corpus={corpus} onOpen={setReader} />
          ) : (
            <>
              {outcome.totalArticles > 0 && (
                <div className="summary">
                  共 {outcome.totalArticles} 條命中,分布於 {outcome.totalLaws} 部法規
                </div>
              )}
              {outcome.diagnosis && (
                <div className="diagnosis">
                  「{outcome.diagnosis.term}」無命中,移除後有 {outcome.diagnosis.remaining} 條
                </div>
              )}
              <ResultList groups={outcome.groups} selected={selected} onSelect={setSelected} />
            </>
          )}
        </div>
```

`useKeyboard` 的 `onBookmark` 接上:

```tsx
    onBookmark: async () => {
      if (!db || !reader) return;
      await toggleBookmark(db, reader.pcode, reader.no);
      setDbVersion((v) => v + 1);
    },
```

並在 `Enter` 時寫入歷史:

```tsx
    onEnter: async () => {
      readerRef.current?.focus();
      if (db && reader && query) {
        await addHistory(db, { ts: Date.now(), query, pcode: reader.pcode, no: reader.no });
      }
    },
```

- [ ] **Step 5: 加入樣式**

在 `src/ui/app.css` 追加:

```css
.side { padding-bottom: 1rem; }
.transfer { padding: 1rem; border-top: 1px solid var(--line); display: flex; gap: 0.5rem; flex-wrap: wrap; }
.transfer button, .transfer-import {
  font: inherit; font-size: 0.85rem; padding: 0.35rem 0.7rem;
  border: 1px solid var(--line); border-radius: 4px; background: none; cursor: pointer;
}
.transfer-import input { display: none; }
.transfer-msg { flex-basis: 100%; font-size: 0.8rem; color: var(--muted); }
```

- [ ] **Step 6: 執行測試,確認通過**

Run: `npx vitest run src/ui/SidePanel.test.tsx`
Expected: PASS(5 個測試)

- [ ] **Step 7: Commit**

```bash
git add src/ui/
git commit -m "feat: 書籤與最近查詢入口,含備份匯出匯入"
```

---

### Task 17: 離線(PWA)與資料版本提示

**Files:**
- Modify: `vite.config.ts`, `src/main.tsx`, `src/ui/App.tsx`, `src/ui/app.css`
- Create: `src/ui/UpdateBanner.tsx`
- Test: `src/ui/UpdateBanner.test.tsx`

**Interfaces:**
- Consumes: `Corpus.sourceUpdatedAt`(Task 1)
- Produces:
  - `<UpdateBanner visible onReload />`
  - `<DataVersion sourceUpdatedAt />` — 常駐顯示資料版本

**不自動靜默更新。** 使用者可能正在對照條文,腳下的資料不該無預警替換。偵測到新版只顯示橫幅,由使用者決定何時重新載入。

- [ ] **Step 1: 寫下失敗的測試**

建立 `src/ui/UpdateBanner.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpdateBanner, DataVersion } from './UpdateBanner';

describe('UpdateBanner', () => {
  it('沒有更新時不顯示', () => {
    const { container } = render(<UpdateBanner visible={false} onReload={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('有更新時顯示提示', () => {
    render(<UpdateBanner visible onReload={() => {}} />);
    expect(screen.getByText(/法規資料有更新/)).toBeDefined();
  });

  it('點擊後才重新載入,不自動執行', async () => {
    const onReload = vi.fn();
    render(<UpdateBanner visible onReload={onReload} />);
    expect(onReload).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /重新載入/ }));
    expect(onReload).toHaveBeenCalled();
  });
});

describe('DataVersion', () => {
  it('把來源日期格式化後顯示', () => {
    render(<DataVersion sourceUpdatedAt="2026/8/21 上午 12:00:00" />);
    expect(screen.getByText('資料版本 2026-08-21')).toBeDefined();
  });

  it('無法解析時原樣顯示', () => {
    render(<DataVersion sourceUpdatedAt="未知" />);
    expect(screen.getByText('資料版本 未知')).toBeDefined();
  });
});
```

- [ ] **Step 2: 執行測試,確認失敗**

Run: `npx vitest run src/ui/UpdateBanner.test.tsx`
Expected: FAIL — 無法解析 `./UpdateBanner`

- [ ] **Step 3: 實作橫幅與版本顯示**

建立 `src/ui/UpdateBanner.tsx`:

```tsx
export function UpdateBanner({
  visible, onReload,
}: { visible: boolean; onReload: () => void }) {
  if (!visible) return null;
  return (
    <div className="update-banner">
      法規資料有更新
      <button onClick={onReload}>重新載入</button>
    </div>
  );
}

/** 來源格式為 "2026/8/21 上午 12:00:00" */
export function DataVersion({ sourceUpdatedAt }: { sourceUpdatedAt: string }) {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})/.exec(sourceUpdatedAt);
  const text = m
    ? `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`
    : sourceUpdatedAt;
  return <div className="data-version">資料版本 {text}</div>;
}
```

- [ ] **Step 4: 設定 PWA**

修改 `vite.config.ts`:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', // 不自動更新:由使用者決定何時重新載入
      manifest: {
        name: '小六法',
        short_name: '小六法',
        lang: 'zh-Hant',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,json}'],
        // corpus.json 約 5.3 MB,遠超過 workbox 預設的 2 MB 上限
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
      },
    }),
  ],
  test: { globals: true },
});
```

- [ ] **Step 5: 註冊 Service Worker**

修改 `src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App, setUpdateAvailable } from './ui/App';

registerSW({
  onNeedRefresh() { setUpdateAvailable(true); },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

在 `src/ui/App.tsx` 中加入模組層級的訂閱點與畫面接線:

```tsx
let notifyUpdate: ((v: boolean) => void) | null = null;
export function setUpdateAvailable(v: boolean) { notifyUpdate?.(v); }
```

在 `Workspace` 中:

```tsx
  const [updateReady, setUpdateReady] = useState(false);
  useEffect(() => {
    notifyUpdate = setUpdateReady;
    return () => { notifyUpdate = null; };
  }, []);
```

並在 `pane-left` 頂端渲染 `<UpdateBanner visible={updateReady} onReload={() => location.reload()} />`,在 `pane-left` 底部渲染 `<DataVersion sourceUpdatedAt={corpus.sourceUpdatedAt} />`。

在 `tsconfig.json` 的 `compilerOptions.types` 加入 `"vite-plugin-pwa/client"`。

- [ ] **Step 6: 加入樣式**

```css
.update-banner {
  padding: 0.6rem 1rem; background: #eef6ff; font-size: 0.85rem;
  display: flex; justify-content: space-between; align-items: center;
  border-bottom: 1px solid var(--line);
}
.update-banner button {
  font: inherit; font-size: 0.8rem; border: 1px solid var(--accent);
  color: var(--accent); background: none; border-radius: 4px;
  padding: 0.2rem 0.5rem; cursor: pointer;
}
.data-version {
  padding: 0.5rem 1rem; border-top: 1px solid var(--line);
  font-size: 0.75rem; color: var(--muted);
}
```

- [ ] **Step 7: 執行測試並驗證離線**

Run: `npx vitest run src/ui/UpdateBanner.test.tsx`
Expected: PASS(5 個測試)

Run: `npm run build && npm run preview`
Expected: 開啟頁面後,在 DevTools 的 Network 面板切成 Offline 並重新整理,應用仍可完整運作、可搜尋。

- [ ] **Step 8: Commit**

```bash
git add vite.config.ts tsconfig.json src/main.tsx src/ui/
git commit -m "feat: PWA 離線支援與資料版本提示

registerType 用 prompt 而非 autoUpdate:使用者可能正在對照條文,
腳下的資料不該無預警替換。介面常駐顯示資料版本——查法條時不知道
自己看的是不是現行版本,比慢一點嚴重得多。"
```

---

### Task 18: 部署至 GitHub Pages

**Files:**
- Create: `.github/workflows/deploy.yml`, `README.md`
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: `npm run data`(Task 6)、`npm run build`
- Produces: 可公開存取的靜態站台

`public/corpus.json` 不進版控,因此 CI 必須先執行 `npm run data` 才能 build。

- [ ] **Step 1: 設定 base path**

修改 `vite.config.ts`,在 `defineConfig` 中加入:

```ts
  // GitHub Pages 部署在 /<repo>/ 之下;本機開發維持根路徑
  base: process.env.GITHUB_ACTIONS ? '/law/' : '/',
```

同時把 `useCorpus` 的預設 URL 改為相對路徑,以配合 base:

```ts
export function useCorpus(url = `${import.meta.env.BASE_URL}corpus.json`): CorpusStatus {
```

- [ ] **Step 2: 建立部署工作流程**

建立 `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:
  schedule:
    # 來源每月更新一次,每月 1 日重建以取得最新法規
    - cron: '0 2 1 * *'

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm test
      - name: 建置法規資料
        run: npm run data
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: 撰寫 README**

建立 `README.md`:

```markdown
# 小六法

完全離線的小六法即時查詢工具。收錄 100 部法規,輸入的同時出結果。

## 用法

| 輸入 | 意義 |
|---|---|
| `184` | 在目前開啟的法規內跳到第 184 條 |
| `民184` / `民法184` / `民法 184` | 民法第 184 條 |
| `民184-1` / `民法184之1` | 民法第 184 條之 1 |
| `過失` | 全域關鍵字 |
| `民法 過失` | 限定民法內搜尋 |
| `過失 傷害` | 兩個關鍵字都要出現 |

鍵盤:`↑` `↓` 移動選取,`Enter` 進入閱讀,`Esc` 清空,`[` `]` 跳章節,`Cmd+D` 加書籤。

## 開發

```bash
npm install
npm run data     # 下載法規資料並建置 corpus.json(首次必須執行)
npm run dev
npm test
```

## 資料來源

[全國法規資料庫開放資料](https://data.gov.tw/dataset/18289)「中文法規_法律資料檔」,
政府資料開放授權條款第 1 版,每月更新。收錄清單見 `data/laws.yaml`。

新增法規:在 `data/laws.yaml` 加一行(PCode 可從全國法規資料庫的網址取得),
重跑 `npm run data`。別名衝突或 PCode 不存在時建置會失敗並指出原因。
```

- [ ] **Step 4: 執行完整驗證**

Run: `npm test && npm run build`
Expected: 全部測試 PASS,build 成功產出 `dist/`

- [ ] **Step 5: Commit**

```bash
git add .github/ README.md vite.config.ts src/ui/useCorpus.ts
git commit -m "feat: GitHub Pages 部署

corpus.json 不進版控,CI 先跑 npm run data 再 build。每月 1 日
排程重建,對應來源的月更頻率。"
```

---

## 完成後的驗收

全部任務完成後,執行以下檢查:

- [ ] `npm test` 全數通過
- [ ] `npm run data` 輸出 100 部 / 11,942 條
- [ ] `npm run build` 成功
- [ ] 打開 app,輸入 `民184`,右欄出現民法第 184 條,且可往上捲到第 183 條、往下捲到第 185 條
- [ ] 輸入 `民訴244`,出現的是民事訴訟法而非民法
- [ ] 輸入 `第三人`,是關鍵字搜尋而非條號查詢
- [ ] 輸入 `民事責任`,是關鍵字搜尋,不會被誤判為民法內查詢
- [ ] 輸入 `過失 緊急避難`,顯示「『緊急避難』無命中,移除後有 N 條」
- [ ] `↓` 移動時右欄跟隨;用滑鼠捲動右欄時左欄選取不變
- [ ] 寫一則含 `# 標題` 的筆記,失焦後渲染為 HTML
- [ ] 離線(DevTools → Offline)重新整理後仍可完整使用
