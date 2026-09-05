import { useEffect, useMemo, useRef, useState } from 'react';
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
  const [saveError, setSaveError] = useState(false);

  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const bodyRef = useRef(body);
  const pendingRef = useRef(false); // 是否還有 debounce 尚未寫入的內容
  const mountedRef = useRef(true);
  // 目前 body/editing 狀態屬於哪一條(pcode+no)。同一條時,note prop 的
  // 變動多半是自己存檔觸發的 reload,一律忽略;真正換了一條才重新帶入,
  // 否則每次自動存檔都會把使用者踢出編輯狀態(見 review round 1)。
  const loadedKeyRef = useRef<string | null>(null);

  useEffect(() => { bodyRef.current = body; }, [body]);

  const save = async (value: string) => {
    if (!db) return;
    try {
      await putNote(db, pcode, no, value, lawUpdated);
      if (mountedRef.current) setSaveError(false);
      onSaved();
    } catch (err) {
      console.error('筆記儲存失敗', err);
      if (mountedRef.current) setSaveError(true);
    }
  };

  // save 每次 render 都會用到當下的 pcode/no/lawUpdated/db,透過 ref 轉發
  // 讓卸載時的 flush(見下方 effect,只掛載一次)可以叫到「最新」的版本,
  // 而不是掛載當下、db 可能還沒開好的那一份。
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; });

  useEffect(() => {
    const key = `${pcode}:${no}`;
    if (loadedKeyRef.current === key) {
      if (!editing) setBody(note?.body ?? '');
      return;
    }
    loadedKeyRef.current = key;
    setBody(note?.body ?? '');
    setEditing(false);
    setSaveError(false);
  }, [pcode, no, note, editing]);

  // 卸載時(例如切到另一部法規)若還有沒存到的內容,立刻補存一次而不是
  // 丟掉——putNote 是覆蓋式寫入,多存一次無害,沒存到才是真正的損失。
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (pendingRef.current) {
        pendingRef.current = false;
        clearTimeout(timer.current);
        void saveRef.current(bodyRef.current);
      }
    };
  }, []);

  const flush = () => {
    if (!pendingRef.current) return;
    pendingRef.current = false;
    clearTimeout(timer.current);
    void save(bodyRef.current);
  };

  const onChange = (value: string) => {
    setBody(value);
    pendingRef.current = true;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      pendingRef.current = false;
      void save(value);
    }, SAVE_DEBOUNCE_MS);
  };

  const onBlur = () => {
    flush();
    setEditing(false);
  };

  const warning = staleNoteWarning(note, lawUpdated);
  const html = useMemo(() => renderMarkdown(body), [body]);

  // db 為 null 代表筆記功能目前不可用,不論是還在開啟中還是被瀏覽器拒絕
  // (私密瀏覽、儲存空間被封鎖等)——不能讓使用者以為打了字就會存到。
  if (!db) {
    return <div className="note-unavailable">筆記功能暫時無法使用(尚未連上本機資料庫)</div>;
  }

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
      {saveError && <div className="note-error">儲存失敗,請重新輸入或稍後再試</div>}
      {editing ? (
        <textarea
          className="note-input"
          autoFocus
          value={body}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder="支援 Markdown"
        />
      ) : (
        <div
          className="note-preview"
          onClick={() => setEditing(true)}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}
