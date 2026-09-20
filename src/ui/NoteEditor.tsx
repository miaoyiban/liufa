import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { putNote, type LawDb, type Note } from '../store/db';
import { renderMarkdown, staleNoteWarning } from './markdown';
import { applyMarkdownAction, diffRange, type MarkdownAction } from '../core/markdownEdit';

const SAVE_DEBOUNCE_MS = 500;

/** 工具列。字母型的用字元,圖形型的用 inline SVG(理由同 App.tsx 的漢堡鈕)。 */
const TOOLS: { action: MarkdownAction; label: string; glyph: ReactNode }[] = [
  { action: 'bold', label: '粗體', glyph: <b>B</b> },
  { action: 'italic', label: '斜體', glyph: <i>I</i> },
  { action: 'heading', label: '標題', glyph: 'H' },
  { action: 'bullet', label: '項目清單', glyph: '\u2022' },
  { action: 'ordered', label: '編號清單', glyph: '1.' },
  { action: 'quote', label: '引用', glyph: '\u201c' },
  {
    action: 'link',
    label: '連結',
    glyph: (
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" focusable="false">
        <path
          d="M5.6 8.4a2.5 2.5 0 003.5 0l2-2a2.5 2.5 0 00-3.5-3.5l-1 1M8.4 5.6a2.5 2.5 0 00-3.5 0l-2 2a2.5 2.5 0 003.5 3.5l1-1"
          fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"
        />
      </svg>
    ),
  },
];

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

/** 排入 debounce、尚未真正寫入 IndexedDB 的內容,連同它當下的身分一起記錄——
 *  換條或卸載時要補存的是「這一筆」,不是「現在最新 render 看到的那一條」,
 *  否則會把某條的草稿寫進另一條(round 2 regression B)。 */
type Pending = { pcode: string; no: string; lawUpdated: string; value: string };

export function NoteEditor({ pcode, no, lawUpdated, note, db, onSaved }: Props) {
  const [body, setBody] = useState(note?.body ?? '');
  const [editing, setEditing] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingRef = useRef<Pending | null>(null);
  const mountedRef = useRef(true);
  // 目前 body/editing 狀態屬於哪一條。初值就是掛載當下的 pcode/no,
  // 因此掛載這一刻不會再重新帶入一次(useState 的初始值已經做過了)。
  const loadedKeyRef = useRef(`${pcode}:${no}`);

  const save = async (target: Pending) => {
    if (!db) return;
    try {
      await putNote(db, target.pcode, target.no, target.value, target.lawUpdated);
    } catch (err) {
      console.error('筆記儲存失敗', err);
      if (mountedRef.current) setSaveError(true);
      return;
    }
    // onSaved 只負責通知外部重新載入筆記清單,寫入本身已經成功,
    // 不該因為這一步(或它引發的 reload)拋錯就顯示「儲存失敗」。
    if (mountedRef.current) setSaveError(false);
    onSaved();
  };

  // save 每次 render 都會用到當下的 db,透過 ref 轉發,讓卸載時的 flush
  // (掛載在 dependency 為 [] 的 effect 裡)也能叫到最新版本,而不是掛載
  // 當下、db 可能還沒開好的那一份。
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; });

  const flushPending = () => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    clearTimeout(timer.current);
    void saveRef.current(pending);
  };

  // 唯一的帶入路徑:只有真的換條(pcode/no 改變)才用 note 重新帶入 body,
  // 其餘情況一律不動 body——這個元件是筆記內容唯一的寫入者,存檔後 note
  // prop 的更新只是回聲,沒有需要即時反映的外部來源(round 2 ruling,
  // 取代 round 1 曾經加上的「未編輯時同步」路徑,那條路徑正是新 bug 的來源)。
  useEffect(() => {
    const key = `${pcode}:${no}`;
    if (loadedKeyRef.current === key) return;
    // 換條前,把上一條還沒寫入的草稿用它原本的身分補存,不能用這次 render
    // 拿到的新 pcode/no,否則會把舊草稿寫進新條文。
    flushPending();
    loadedKeyRef.current = key;
    setBody(note?.body ?? '');
    setEditing(false);
    setSaveError(false);
    // note 只在換條當下讀取一次;它之後的變動不需要追蹤(見上方說明)。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pcode, no]);

  // 卸載時(例如切到另一部法規、且條號不巧沒有重疊、元件真的被移除)若還
  // 有沒存到的內容,立刻用它原本的身分補存,而不是丟掉。
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      flushPending();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = (value: string) => {
    setBody(value);
    pendingRef.current = { pcode, no, lawUpdated, value };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      pendingRef.current = null;
      void save({ pcode, no, lawUpdated, value });
    }, SAVE_DEBOUNCE_MS);
  };

  const onBlur = () => {
    flushPending();
    setEditing(false);
  };

  /**
   * 套用一個工具列動作。文字怎麼變是 core/markdownEdit 決定的,這裡只負責
   * 把 textarea 的選取範圍餵進去、再把結果寫回去。
   */
  const applyAction = (action: MarkdownAction) => {
    const ta = taRef.current;
    if (!ta) return;
    const before = { text: ta.value, selStart: ta.selectionStart, selEnd: ta.selectionEnd };
    const after = applyMarkdownAction(action, before);

    if (after.text !== before.text) {
      const { start, endA, insert } = diffRange(before.text, after.text);
      ta.setSelectionRange(start, endA);
      // execCommand 已被標記為 deprecated,但它是唯一能把程式化修改寫進
      // textarea 原生 undo stack 的方式。直接設 value 的話,使用者在工具列
      // 按了幾下之後按 Cmd+Z,救回來的是按工具列「之前」的狀態,中間全沒了。
      // 它會觸發真正的 input 事件,所以下面的 onChange(存檔那條路徑)會跟著跑。
      let ok = false;
      try {
        ok = document.execCommand('insertText', false, insert);
      } catch {
        ok = false;
      }
      if (!ok) {
        // 退路:自己寫 value 並手動走一次 onChange,undo 會斷,但內容與存檔正確。
        ta.value = after.text;
        onChange(after.text);
      }
    }

    // 選取要在最後設:文字長度變了,先設會被後來的寫入蓋掉。
    ta.setSelectionRange(after.selStart, after.selEnd);
    ta.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 組字中的 Cmd+B 不是格式指令。全域的 useKeyboard 遇到 TEXTAREA 會整個
    // 放行,所以這兩個組合鍵在這裡沒有競爭者。
    if (e.nativeEvent.isComposing) return;
    if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k !== 'b' && k !== 'i') return;
    e.preventDefault();
    applyAction(k === 'b' ? 'bold' : 'italic');
  };

  const warning = staleNoteWarning(note, lawUpdated);
  // 空內容不進 marked/DOMPurify。這個 memo 在提早 return 之上,整部民法
  // 1,439 條就有 1,439 個 NoteEditor 掛載,其中絕大多數只渲染一顆「+ 新增
  // 筆記」按鈕——為它們解析空字串,產出還會被丟掉。
  const html = useMemo(() => (body ? renderMarkdown(body) : ''), [body]);

  // db 為 null 代表筆記功能目前不可用,不論是還在開啟中還是被瀏覽器拒絕
  // (私密瀏覽、儲存空間被封鎖等)——不能讓使用者以為打字會存到。跟
  // 「+ 新增筆記」一樣預設隱藏、hover/當前條文才顯示,避免整部法規每條
  // 都重複一行同樣的提示。
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
        <>
          {/* 每一顆都要 preventDefault mousedown:否則按下去的瞬間 textarea
              失焦 → onBlur → setEditing(false),編輯器在 click 生效之前就
              收起來了,按鈕看起來完全沒作用。 */}
          <div className="note-toolbar">
            {TOOLS.map((t) => (
              <button
                key={t.action}
                type="button"
                className="note-tool"
                aria-label={t.label}
                title={t.label}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyAction(t.action)}
              >
                {t.glyph}
              </button>
            ))}
            <button
              type="button"
              className="note-tool note-tool-end"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onBlur}
            >
              預覽
            </button>
          </div>
          <textarea
            ref={taRef}
            className="note-input"
            autoFocus
            value={body}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            placeholder="支援 Markdown"
          />
        </>
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
