// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useCorpus } from './useCorpus';
import type { Corpus } from '../core/types';

const corpus: Corpus = {
  sourceUpdatedAt: '2026/8/21',
  builtAt: '2026-09-03T00:00:00.000Z',
  laws: [],
};

afterEach(() => vi.unstubAllGlobals());

describe('useCorpus', () => {
  it('初始為 loading', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const { result } = renderHook(() => useCorpus());
    expect(result.current.state).toBe('loading');
  });

  it('載入成功後回傳 corpus', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => corpus })));
    const { result } = renderHook(() => useCorpus());
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current).toEqual({ state: 'ready', corpus });
  });

  it('HTTP 錯誤時回傳可讀訊息', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404, statusText: 'Not Found' })));
    const { result } = renderHook(() => useCorpus());
    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current).toMatchObject({ state: 'error', message: expect.stringContaining('404') });
  });

  it('網路失敗時回傳可讀訊息', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const { result } = renderHook(() => useCorpus());
    await waitFor(() => expect(result.current.state).toBe('error'));
    expect(result.current).toMatchObject({ state: 'error', message: expect.stringContaining('offline') });
  });
});
