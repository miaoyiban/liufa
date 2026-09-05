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

/** 搜尋框為空時顯示的側欄:書籤、最近查詢,以及備份匯出/匯入入口。 */
export function SidePanel({ db, corpus, onOpen }: Props) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [message, setMessage] = useState('');
  // 讀取失敗與「真的沒有資料」必須分開:兩者都留下空清單,但只有後者可以說
  // 「還沒有書籤或查詢紀錄」。把錯誤講成空狀態,等於對使用者謊報他的資料。
  const [loadFailed, setLoadFailed] = useState(false);

  const reload = useCallback(async () => {
    if (!db) return;
    try {
      const [b, h] = await Promise.all([listBookmarks(db), listHistory(db, 20)]);
      setBookmarks(b);
      setHistory(h);
      setLoadFailed(false);
    } catch (err) {
      console.error('讀取書籤或最近查詢失敗', err);
      setLoadFailed(true);
    }
  }, [db]);

  useEffect(() => { void reload(); }, [reload]);

  const abbr = (pcode: string) =>
    corpus.laws.find((l) => l.pcode === pcode)?.abbr ?? pcode;

  const onExport = async () => {
    if (!db) return;
    try {
      const backup = await exportAll(db);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `law-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (err) {
      console.error('匯出備份失敗', err);
      setMessage('匯出失敗,請稍後再試');
    }
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

  if (loadFailed) {
    return (
      <div className="side">
        <div className="status status-error">
          讀取本機資料失敗,書籤與最近查詢暫時無法顯示(資料並未遺失)。
        </div>
        <Transfer onExport={onExport} onImport={onImport} message={message} />
      </div>
    );
  }

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
}: { onExport: () => Promise<void>; onImport: (f: File) => Promise<void>; message: string }) {
  return (
    <div className="transfer">
      <button onClick={() => { onExport().catch(() => {}); }}>匯出備份</button>
      <label className="transfer-import">
        匯入備份
        <input
          type="file"
          accept="application/json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onImport(f).catch(() => {});
            e.target.value = '';
          }}
        />
      </label>
      {message && <div className="transfer-msg">{message}</div>}
    </div>
  );
}
