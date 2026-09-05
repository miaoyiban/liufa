// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App, setUpdateAvailable, setUpdateHandler, divisionJumpTargets } from './App';
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

async function renderReady(c: Corpus = corpus) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => c })));
  render(<App />);
  return screen.findByLabelText('搜尋法條');
}

function targetArticleId(): string | undefined {
  return document.querySelector('.article-target')?.id;
}

/** 右欄目前顯示的是哪一部法規 */
function readerLaw(): string | null | undefined {
  return document.querySelector('.reader-head h1')?.textContent;
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

// 六法核心中有四部都有第 184 條——冷啟動輸入「184」時,這四部都是合法候選。
const coreCorpus: Corpus = {
  sourceUpdatedAt: '2026/8/21',
  builtAt: '2026-09-03T00:00:00.000Z',
  laws: [
    coreLaw('B0000001', '民法', '民法及關係法規'),
    coreLaw('B0010001', '民事訴訟法', '民事訴訟法及關係法規'),
    coreLaw('C0000001', '刑法', '刑法及關係法規'),
    coreLaw('C0010001', '刑事訴訟法', '刑事訴訟法及關係法規'),
  ],
};

function coreLaw(pcode: string, abbr: string, group: string): Corpus['laws'][number] {
  return {
    pcode, name: abbr, abbr, aliases: [], group,
    updated: '20260817', history: '1.制定',
    blocks: [
      { t: 'a', no: '184', main: 184, sub: 0, label: '第 184 條', text: `${abbr}第一八四條內容。` },
      { t: 'a', no: '185', main: 185, sub: 0, label: '第 185 條', text: `${abbr}第一八五條內容。` },
    ],
  };
}

// C1 重現用:每部核心法規都同時有第 1、18、184 條(真實語料中幾乎每部法規
// 都有這三條)。上面的 coreLaw/coreCorpus 只定義了 184、185——逐字輸入
// "1"→"18" 時中間按鍵永遠零命中,flat 保持空,auto-follow effect 從未觸發,
// 完全踩不到 C1 的競態(假綠燈)。這裡讓每一步都是非空、可能有多筆候選的
// 中間狀態,才會真正踩到「上一個按鍵的第一筆猜測污染下一個按鍵的搜尋脈絡」。
function coreLawWithShortArticles(pcode: string, abbr: string, group: string): Corpus['laws'][number] {
  return {
    pcode, name: abbr, abbr, aliases: [], group,
    updated: '20260817', history: '1.制定',
    blocks: ['1', '18', '184', '185'].map((no) => ({
      t: 'a' as const, no, main: Number(no), sub: 0,
      label: `第 ${no} 條`, text: `${abbr}第${no}條內容。`,
    })),
  };
}

const coreCorpusShortArticles: Corpus = {
  sourceUpdatedAt: '2026/8/21',
  builtAt: '2026-09-03T00:00:00.000Z',
  laws: [
    coreLawWithShortArticles('B0000001', '民法', '民法及關係法規'),
    coreLawWithShortArticles('B0010001', '民事訴訟法', '民事訴訟法及關係法規'),
    coreLawWithShortArticles('C0000001', '刑法', '刑法及關係法規'),
    coreLawWithShortArticles('C0010001', '刑事訴訟法', '刑事訴訟法及關係法規'),
  ],
};

describe('§5.5 情境二:冷啟動輸入純數字條號', () => {
  it('候選清單完整呈現,且方向鍵能走完全部候選', async () => {
    const user = userEvent.setup();
    const input = await renderReady(coreCorpusShortArticles);

    // 逐字輸入(userEvent.type 預設一次一個字元):'1' → '18' → '184'。
    // 三步都在四部核心法規裡有命中,才會真的踩到 C1 的競態。
    await user.type(input, '184');

    // 四部核心法規都有第 184 條,四個都必須留在清單上
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(4));
    expect(document.querySelector('.summary')?.textContent)
      .toBe('共 4 條命中,分布於 4 部法規');
    expect([...document.querySelectorAll('.group-title')].map((e) => e.firstChild?.textContent))
      .toEqual(['民法', '民事訴訟法', '刑法', '刑事訴訟法']);

    // 方向鍵要能一路走到最後一個候選,右欄跟著換法規
    await waitFor(() => expect(readerLaw()).toBe('民法'));
    for (const expected of ['民事訴訟法', '刑法', '刑事訴訟法']) {
      fireEvent.keyDown(window, { key: 'ArrowDown' });
      await waitFor(() => expect(readerLaw()).toBe(expected));
    }
    expect(targetArticleId()).toBe('article-184');
    // 走完之後候選清單仍然完整,不會因為右欄換了法規就塌成一個
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('先開啟一部法規後再查純數字,沿用開始打字時正在讀的法規(§5.5 情境一)', async () => {
    const user = userEvent.setup();
    const input = await renderReady(coreCorpus);

    // 先用法規名開啟刑法
    await user.type(input, '刑法');
    await waitFor(() => expect(readerLaw()).toBe('刑法'));

    await user.clear(input);
    await user.type(input, '185');

    await waitFor(() => expect(targetArticleId()).toBe('article-185'));
    expect(readerLaw()).toBe('刑法');
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });
});

// C1 附帶行為(不在 brief 三條硬性驗收條件之列,但既有的 totalLaws === 1
// 自動確認需要自己的測試):民法、刑法都有第 18 條(冷啟動打出 2 個候選);
// 只有民法有第 185 條——單純繼續打字就會自然收斂到唯一一部,不靠使用者按
// 方向鍵。民法、民事訴訟法都有第 9 條,用來驗證收斂後的法規有沒有真的成為
// 下一次查詢的脈絡(如果沒有,打「9」會看到 2 個候選,不是 1 個)。
const narrowingCorpus: Corpus = {
  sourceUpdatedAt: '2026/8/21',
  builtAt: '2026-09-03T00:00:00.000Z',
  laws: [
    {
      pcode: 'B0000001', name: '民法', abbr: '民法', aliases: [], group: '民法及關係法規',
      updated: '20260817', history: '1.制定',
      blocks: [
        { t: 'a', no: '18', main: 18, sub: 0, label: '第 18 條', text: '民法第十八條內容。' },
        { t: 'a', no: '185', main: 185, sub: 0, label: '第 185 條', text: '民法第一八五條內容。' },
        { t: 'a', no: '9', main: 9, sub: 0, label: '第 9 條', text: '民法第九條內容。' },
      ],
    },
    {
      pcode: 'C0000001', name: '刑法', abbr: '刑法', aliases: [], group: '刑法及關係法規',
      updated: '20260817', history: '1.制定',
      blocks: [
        { t: 'a', no: '18', main: 18, sub: 0, label: '第 18 條', text: '刑法第十八條內容。' },
      ],
    },
    {
      pcode: 'B0010001', name: '民事訴訟法', abbr: '民事訴訟法', aliases: [], group: '民事訴訟法及關係法規',
      updated: '20260817', history: '1.制定',
      blocks: [
        { t: 'a', no: '9', main: 9, sub: 0, label: '第 9 條', text: '民事訴訟法第九條內容。' },
      ],
    },
  ],
};

describe('唯一候選自動確認(totalLaws === 1 時的 reader 自動確認)', () => {
  it('冷啟動打出多個候選,繼續打字自然收斂到唯一一部後,該法規成為後續查詢的脈絡', async () => {
    const user = userEvent.setup();
    const input = await renderReady(narrowingCorpus);

    await user.type(input, '18');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));

    // 追加一個字元變成 "185",只有民法有,候選收斂到剩一部
    await user.type(input, '5');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1));
    await waitFor(() => expect(readerLaw()).toBe('民法'));

    // 換一個全新的查詢:民法、民事訴訟法都有第 9 條。若剛才的收斂沒有真的
    // 確認成 reader、成為脈絡,這裡會看到 2 個候選而不是 1 個。
    await user.clear(input);
    await user.type(input, '9');
    await waitFor(() => expect(targetArticleId()).toBe('article-9'));
    expect(readerLaw()).toBe('民法');
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });
});

describe('候選不只一部、尚未按方向鍵時的 Enter / Cmd+D(fix round 2)', () => {
  it('Enter 把目前顯示(預覽)的候選提升為 reader,並寫入最近查詢', async () => {
    const user = userEvent.setup();
    const input = await renderReady(coreCorpus);
    fireEvent.change(input, { target: { value: '184' } });

    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(4));
    // 尚未按方向鍵,右欄仍是「預覽」第一筆候選(民法),不是使用者確認過的
    await waitFor(() => expect(readerLaw()).toBe('民法'));

    fireEvent.keyDown(window, { key: 'Enter' });

    // 清空查詢换回側欄,檢查「最近查詢」是否真的多了這一筆(對應顯示中的
    // 民法,而不是靜默 no-op)
    await user.clear(input);
    await waitFor(() => {
      const items = [...document.querySelectorAll('.item-text')].map((e) => e.textContent);
      expect(items).toContain('民法 184');
    });
  });

  it('Cmd+D 對目前顯示(預覽)的候選生效,不會誤判成「尚未開啟任何條文」', async () => {
    const input = await renderReady(coreCorpus);
    fireEvent.change(input, { target: { value: '184' } });

    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(4));
    await waitFor(() => expect(readerLaw()).toBe('民法'));

    fireEvent.keyDown(window, { key: 'd', metaKey: true });
    expect(await screen.findByText('已加入書籤:民法 184')).toBeDefined();
    await waitFor(() =>
      expect(document.querySelector('#article-184 [aria-label="已加入書籤"]')).not.toBeNull()
    );

    // 復原:openLawDb() 用固定的預設資料庫名稱,同一個檔案內的所有測試共用
    // 同一份 IndexedDB('law-lookup'),不會在測試之間重置。下面「Cmd+D 書籤」
    // 描述區塊裡的既有測試用的也是「民法 184」這把鍵,這裡加了書籤不清掉,
    // 會讓那個測試的第一次按 Cmd+D 變成「移除」而不是「加入」。
    fireEvent.keyDown(window, { key: 'd', metaKey: true });
    await screen.findByText('已移除書籤:民法 184');
  });
});

// 單一法規 150 條全部命中同一個關鍵字,用來檢查「左欄只渲染視窗、但計數與
// 鍵盤導覽仍涵蓋完整清單」。
const bulkCorpus: Corpus = {
  sourceUpdatedAt: '2026/8/21',
  builtAt: '2026-09-03T00:00:00.000Z',
  laws: [
    {
      pcode: 'B0000001', name: '民法', abbr: '民法', aliases: ['民'],
      group: '民法及關係法規', updated: '20260817', history: '1.制定',
      blocks: Array.from({ length: 150 }, (_, i) => ({
        t: 'a' as const, no: String(i + 1), main: i + 1, sub: 0,
        label: `第 ${i + 1} 條`, text: '因過失致生損害。',
      })),
    },
  ],
};

describe('Cmd+D 書籤', () => {
  it('加入與移除都會回報結果,並在條號旁顯示標記', async () => {
    const user = userEvent.setup();
    const input = await renderReady();

    await user.type(input, '過失');
    await waitFor(() => expect(targetArticleId()).toBe('article-184'));

    fireEvent.keyDown(window, { key: 'd', metaKey: true });
    expect(await screen.findByText('已加入書籤:民法 184')).toBeDefined();
    await waitFor(() =>
      expect(document.querySelector('#article-184 [aria-label="已加入書籤"]')).not.toBeNull()
    );

    fireEvent.keyDown(window, { key: 'd', metaKey: true });
    expect(await screen.findByText('已移除書籤:民法 184')).toBeDefined();
    await waitFor(() =>
      expect(document.querySelector('#article-184 [aria-label="已加入書籤"]')).toBeNull()
    );
  });

  it('尚未開啟條文時說明按了為什麼沒有反應', async () => {
    await renderReady();
    // 本機資料庫是非同步開啟的,在它就緒之前按 Cmd+D 會得到另一句(同樣誠實的)
    // 訊息:「書籤功能暫時無法使用」。這裡要驗的是「有條文可加書籤」以外的
    // 那個原因,所以重試到資料庫就緒為止;重複按沒有副作用。
    await waitFor(() => {
      fireEvent.keyDown(window, { key: 'd', metaKey: true });
      expect(screen.getByText(/尚未開啟任何條文/)).toBeDefined();
    });
  });

  it('本機資料庫不可用時說明原因,不會按了完全沒反應', async () => {
    // 私密瀏覽、儲存空間被封鎖等情況:openLawDb 失敗,db 永遠是 null。
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('indexedDB', {
      open: () => { throw new DOMException('封鎖中', 'SecurityError'); },
    });
    await renderReady();

    fireEvent.keyDown(window, { key: 'd', metaKey: true });

    expect(await screen.findByText(/書籤功能暫時無法使用/)).toBeDefined();
    logged.mockRestore();
  });
});

describe('Enter 進入閱讀之後的打字去處(§7.2)', () => {
  it('在右欄打可列印字元時焦點回到搜尋框,輸入不會被吞掉', async () => {
    const user = userEvent.setup();
    const input = await renderReady();

    await user.type(input, '過失');
    await waitFor(() => expect(targetArticleId()).toBe('article-184'));

    fireEvent.keyDown(window, { key: 'Enter' });
    const paneRight = document.querySelector('.pane-right') as HTMLElement;
    expect(document.activeElement).toBe(paneRight);

    // 焦點在不可編輯的右欄時打字,原本會直接消失
    fireEvent.keyDown(paneRight, { key: '刑', bubbles: true });
    await waitFor(() => expect(document.activeElement).toBe(input));

    // 焦點回到搜尋框後,接下來的輸入照常進入查詢
    await user.type(input, '184');
    expect((input as HTMLInputElement).value).toBe('過失184');
  });
});

describe('大量命中時的左欄渲染', () => {
  it('只渲染視窗,但命中數與方向鍵可達範圍仍是完整清單', async () => {
    const user = userEvent.setup();
    const input = await renderReady(bulkCorpus);

    await user.type(input, '過失');
    await waitFor(() =>
      expect(document.querySelector('.summary')?.textContent)
        .toBe('共 150 條命中,分布於 1 部法規')
    );

    // 渲染端有視窗:不會一次把 150 條全部塞進 DOM
    expect(screen.getAllByRole('option').length).toBeLessThan(150);

    // 但鍵盤導覽仍走得到最後一條——視窗會跟著選取延伸
    for (let i = 0; i < 149; i++) fireEvent.keyDown(window, { key: 'ArrowDown' });
    await waitFor(() => expect(targetArticleId()).toBe('article-150'));
    expect(document.querySelector('.summary')?.textContent)
      .toBe('共 150 條命中,分布於 1 部法規');
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

describe('divisionJumpTargets(A-2:`[`/`]` 只跳編章,不跳節款目)', () => {
  it('只保留 level 0、1(編、章),節/款/目被濾掉', () => {
    // 編(0) 章(1) 節(2) 款(3) 章(1) 目(4)
    expect(divisionJumpTargets([0, 1, 2, 3, 1, 4])).toEqual([0, 1, 4]);
  });

  it('沒有任何 division 時回傳空陣列', () => {
    expect(divisionJumpTargets([])).toEqual([]);
  });

  it('全部都是節、款、目時回傳空陣列(該法規沒有可跳的編章)', () => {
    expect(divisionJumpTargets([2, 3, 4])).toEqual([]);
  });
});
