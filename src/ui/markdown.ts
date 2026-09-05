import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { Note } from '../store/db';
import { formatLawDate } from '../core/date';

// 匯入的 style / style 屬性可以整頁改版(例如把警示文字藏起來),
// 而 DOMPurify 預設 profile 並不會擋掉這兩者,要另外加進黑名單。
const SANITIZE_CONFIG = { FORBID_TAGS: ['style'], FORBID_ATTR: ['style'] };

/**
 * 渲染筆記。必須 sanitize:匯入功能會接受外部 JSON 檔,
 * 未 sanitize 的渲染路徑等於給匯入開了一個 XSS 缺口。
 *
 * DOMPurify 在沒有真實 DOM 的環境(例如 SSR)會把 sanitize 降級成
 * 直接回傳原字串,而不是拋錯——等於在該環境把整個防護悄悄關掉。
 * 這裡的環境一律有 jsdom/瀏覽器 DOM,若 isSupported 是 false 代表
 * 假設被打破,寧可炸掉也不要悄悄跳過 sanitize。
 */
export function renderMarkdown(md: string): string {
  if (!DOMPurify.isSupported) {
    throw new Error('DOMPurify 在此環境不受支援,拒絕未經過濾就渲染筆記');
  }
  const html = marked.parse(md, { async: false }) as string;
  return DOMPurify.sanitize(html, SANITIZE_CONFIG);
}

/**
 * 不自動處理、不隱藏、不推測改了什麼,只告知需要重看。
 */
export function staleNoteWarning(note: Note | undefined, lawUpdated: string): string | null {
  if (!note || !note.lawVersionAtWrite || !lawUpdated) return null;
  if (note.lawVersionAtWrite === lawUpdated) return null;
  return `此條所屬法規已於 ${formatLawDate(lawUpdated)} 修正,你的筆記寫於修正前`;
}
