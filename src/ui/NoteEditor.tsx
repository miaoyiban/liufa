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
