import { useEffect, useState } from 'react';
import { listNotes, openLawDb, type LawDb, type Note } from '../store/db';

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

  return { notes, reload: () => setTick((t) => t + 1) };
}
