import { useEffect, useState } from 'react';
import { listNotes, openLawDb, type LawDb, type Note } from '../store/db';

export function useLawDb(): LawDb | null {
  const [db, setDb] = useState<LawDb | null>(null);
  useEffect(() => {
    let cancelled = false;
    openLawDb().then((d) => { if (!cancelled) setDb(d); });
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
    listNotes(db).then((all) => {
      if (!cancelled) setNotes(new Map(all.map((n) => [n.key, n])));
    });
    return () => { cancelled = true; };
  }, [db, tick]);

  return { notes, reload: () => setTick((t) => t + 1) };
}
