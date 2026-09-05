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
