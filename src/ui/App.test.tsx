// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App, setUpdateAvailable, setUpdateHandler } from './App';
import type { Corpus } from '../core/types';

beforeAll(() => {
  // jsdom 未實作 scrollIntoView
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => vi.unstubAllGlobals());

const corpus: Corpus = {
  sourceUpdatedAt: '2026/8/21',
  builtAt: '2026-09-03T00:00:00.000Z',
  laws: [
    {
      pcode: 'B0000001', name: '民法', abbr: '民法', aliases: ['民'],
      group: '民法及關係法規', updated: '20260817', history: '1.制定',
      blocks: [
        { t: 'a', no: '184', main: 184, sub: 0, label: '第 184 條', text: '因故意或過失，不法侵害他人之權利者。' },
        { t: 'a', no: '185', main: 185, sub: 0, label: '第 185 條', text: '數人共同不法侵害他人之權利者，因過失。' },
      ],
    },
  ],
};

async function renderReady() {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => corpus })));
  render(<App />);
  return screen.findByLabelText('搜尋法條');
}

function targetArticleId(): string | undefined {
  return document.querySelector('.article-target')?.id;
}

describe('Workspace 單向同步(左欄選取 → 右欄跳轉)', () => {
  it('左欄選取移動時右欄跟隨跳轉(正向)', async () => {
    const user = userEvent.setup();
    const input = await renderReady();

    await user.type(input, '過失');
    await waitFor(() => expect(targetArticleId()).toBe('article-184'));

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    await waitFor(() => expect(targetArticleId()).toBe('article-185'));
  });

  it('右欄自行捲動時左欄選取與右欄目標都不變(反向不同步)', async () => {
    const user = userEvent.setup();
    const input = await renderReady();

    await user.type(input, '過失');
    await waitFor(() => expect(targetArticleId()).toBe('article-184'));

    fireEvent.keyDown(window, { key: 'ArrowDown' });
    await waitFor(() => expect(targetArticleId()).toBe('article-185'));

    const paneRight = document.querySelector('.pane-right');
    expect(paneRight).not.toBeNull();
    fireEvent.scroll(paneRight!);

    // App 中沒有任何「右欄捲動 → 更新選取」的監聽器;這裡確認捲動事件
    // 本身完全不會改變左欄選取或右欄目標,若日後有人加上這種監聽器,
    // 這個測試會失敗。
    expect(targetArticleId()).toBe('article-185');
    const selectedOption = screen.getByRole('option', { name: /第 185 條/ });
    expect(selectedOption.getAttribute('aria-selected')).toBe('true');
  });
});

describe('離線更新橫幅的重新載入接線', () => {
  afterEach(() => {
    // 避免這裡設的模組層級狀態滲漏到其他測試。此時 Workspace 可能仍掛載著
    // (testing-library 的自動 cleanup 尚未執行),setUpdateAvailable 會觸發
    // 真正的 React state 更新,所以要包在 act() 裡,否則會出現「不在 act()
    // 範圍內更新」的警告。
    act(() => {
      setUpdateAvailable(false);
      setUpdateHandler(null);
    });
  });

  it('點擊重新載入時呼叫已註冊的更新處理函式,而非單純重整頁面', async () => {
    const user = userEvent.setup();
    await renderReady();

    const updateSW = vi.fn();
    act(() => {
      setUpdateHandler(updateSW);
      setUpdateAvailable(true);
    });

    const button = await screen.findByRole('button', { name: /重新載入/ });
    await user.click(button);

    // 這裡釘住的是 App.tsx 內的接線本身:點擊呼叫的是外部註冊進來的
    // 處理函式,而不是 App 自己直接呼叫 location.reload()。真正送出
    // skip-waiting 訊息、啟用新 Service Worker 的邏輯屬於 main.tsx,
    // 不在單元測試環境(jsdom 沒有 Service Worker)可驗證的範圍內。
    expect(updateSW).toHaveBeenCalledTimes(1);
  });
});
