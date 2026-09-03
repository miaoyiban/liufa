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
