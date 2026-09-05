import { useCallback, useEffect, useState } from 'react';
import { listBookmarks, listNotes, openLawDb, type LawDb, type Note } from '../store/db';

/**
 * db 維持 null 代表「筆記功能目前不可用」——不論原因是還在開啟中,
 * 還是瀏覽器直接拒絕(私密瀏覽、儲存空間被封鎖等)。呼叫端一律用
 * `db === null` 判斷是否要停用筆記編輯,不需要另外分辨原因。
 * 這裡的 catch 只負責讓失敗有個去處,不留下 unhandled rejection。
 */
export function useLawDb(): LawDb | null {
  const [db, setDb] = useState<LawDb | null>(null);
  useEffect(() => {
    let cancelled = false;
    openLawDb()
      .then((d) => { if (!cancelled) setDb(d); })
      .catch((err) => {
        if (!cancelled) console.error('開啟本機資料庫失敗,筆記功能將無法使用', err);
      });
    return () => { cancelled = true; };
  }, []);
  return db;
}

/** 一次載入全部筆記。整部民法有 1439 條,絕不可讓每個條文各自查資料庫。 */
export function useNotes(db: LawDb | null): { notes: Map<string, Note>; reload: () => void } {
  const [notes, setNotes] = useState<Map<string, Note>>(new Map());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!db) return;
    let cancelled = false;
    listNotes(db)
      .then((all) => {
        if (!cancelled) setNotes(new Map(all.map((n) => [n.key, n])));
      })
      .catch((err) => {
        if (!cancelled) console.error('讀取筆記清單失敗', err);
      });
    return () => { cancelled = true; };
  }, [db, tick]);

  // reload 的參照必須穩定:它一路傳到每一個 ArticleBlock/NoteEditor 當 prop,
  // 每次 render 都換一個新函式會讓 ArticleBlock 的 React.memo 完全失效,
  // 於是每存一次筆記就重新調和整部法規的 1,439 條。
  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { notes, reload };
}

/** 一次載入全部書籤的 key,供閱讀區在條號旁顯示書籤標記(理由同 useNotes)。 */
export function useBookmarks(db: LawDb | null): { bookmarks: Set<string>; reload: () => void } {
  const [bookmarks, setBookmarks] = useState<Set<string>>(new Set());
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!db) return;
    let cancelled = false;
    listBookmarks(db)
      .then((all) => {
        if (!cancelled) setBookmarks(new Set(all.map((b) => b.key)));
      })
      .catch((err) => {
        if (!cancelled) console.error('讀取書籤清單失敗', err);
      });
    return () => { cancelled = true; };
  }, [db, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { bookmarks, reload };
}
