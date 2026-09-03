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
