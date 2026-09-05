import { useEffect, useState } from 'react';
import type { Corpus } from '../core/types';

export type CorpusStatus =
  | { state: 'loading' }
  | { state: 'ready'; corpus: Corpus }
  | { state: 'error'; message: string };

export function useCorpus(url = `${import.meta.env.BASE_URL}corpus.json`): CorpusStatus {
  const [status, setStatus] = useState<CorpusStatus>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        const corpus = (await res.json()) as Corpus;
        if (!cancelled) setStatus({ state: 'ready', corpus });
      } catch (e) {
        if (!cancelled) setStatus({ state: 'error', message: (e as Error).message });
      }
    })();
    return () => { cancelled = true; };
  }, [url]);

  return status;
}
