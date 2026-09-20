// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App, setUpdateAvailable, setUpdateHandler, divisionJumpTargets } from './App';
import { openLawDb } from '../store/db';
import type { Corpus } from '../core/types';

beforeAll(() => {
  // jsdom 未實作 scrollIntoView
  Element.prototype.scrollIntoView = vi.fn();
});

// 測試隔離:useLawDb.ts 呼叫 openLawDb() 不帶名稱,固定開在預設的 'law-lookup',
// 本檔每個測試渲染的 App 因此共用同一份 fake-IndexedDB。不隔離的話,前一個測試
// 留下的書籤/筆記會外洩到後面的測試(Task A 期間就咬過一次:把「加入」翻轉成
// 「移除」),而且是靠檔內順序才看得出來的隱性耦合。
//
// 做法是每個測試換一個全新的 IDBFactory,而不是在測試結束時
// deleteDatabase('law-lookup'):useLawDb 不會在卸載時關閉連線(那是它的正常
// 行為,不是要在這裡修的 production 問題),而 deleteDatabase 只要還有連線沒關
// 就會卡在 'blocked' 永不完成;先關連線再刪又會跟「上一個測試尚未結束的非同步
// openLawDb」相撞,反而讓整套測試變得不穩定。換掉整個 factory 沒有這些問題:
// 新的 factory 一定是空的,上一個測試殘留的非同步操作留在舊 factory 上,自行
// 隨著垃圾回收消失,不影響任何人。
beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory());
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
  const input = await screen.findByLabelText('搜尋法條');
  // 等本機資料庫真的開好再把控制權交還給測試。useLawDb 的 openLawDb() 是非同步
  // 的,在它完成之前 db 還是 null,Cmd+D 與「寫入最近查詢」都會靜默地不做事——
  // 過去這件事沒有咬到人,只是因為所有測試共用同一份資料庫,第一個測試就把
  // schema 建好了,後面的測試開的都是「已存在的資料庫」而快得看不出來。隔離成
  // 每個測試一份全新的 factory 之後,這個競態就浮出來了,必須明確地等。
  //
  // 等法:IndexedDB 依送出順序處理請求。Workspace 掛載時 useLawDb 已經送出
  // open,所以這裡自己再 open 一次並等它完成,就保證 App 的那一個也完成了。
  // 資料庫本來就開不起來的測試(私密瀏覽情境)由 catch 直接放行。
  await act(async () => {
    await openLawDb().then((d) => d.close()).catch(() => {});
  });
  return input;
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
  // 舊標題寫的是「把預覽提升為 reader」,但本體從頭到尾沒有觀察 reader:
  // 歷史紀錄是從 displayTarget 產生的,不論 reader 有沒有被寫入都會出現。
  // 標題改成本體真正涵蓋的兩件事;「Enter 與脈絡法規的關係」由下面 C-A 那一組
  // 測試負責,那才有觀察得到的量(ctxPcode)。
  it('Enter 對顯示中的預覽候選寫入最近查詢,並把焦點移到右欄(§7.2)', async () => {
    const user = userEvent.setup();
    const input = await renderReady(coreCorpus);
    fireEvent.change(input, { target: { value: '184' } });

    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(4));
    // 尚未按方向鍵,右欄仍是「預覽」第一筆候選(民法),不是使用者確認過的
    await waitFor(() => expect(readerLaw()).toBe('民法'));

    fireEvent.keyDown(window, { key: 'Enter' });

    // §7.2 對 Enter 的定義:焦點移至右欄,進入閱讀
    expect(document.activeElement).toBe(document.querySelector('.pane-right'));

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
  });
});

describe('C-A:Enter 不替使用者決定脈絡法規', () => {
  // C1 的形狀,中間插了一個按鍵。Enter 本身不帶任何「使用者指的是四部裡的
  // 哪一部」的資訊——民法排第一只是因為 search.ts 依分類順序回傳。把它確認成
  // reader,就會經由 ctxPcode 靜默收窄之後的每一個查詢,並印出不實的涵蓋宣告。
  //
  // 唯一觀察得到的量是 ctxPcode 對下一個查詢的效果,所以這裡刻意做完整的
  // 「模糊查詢 → Enter → 清空 → 新查詢 → 數候選」序列,而不是去斷言 reader。
  it('多部候選時按 Enter,下一個查詢仍列出全部候選,摘要不縮水', async () => {
    const user = userEvent.setup();
    const input = await renderReady(coreCorpusShortArticles);

    await user.type(input, '184');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(4));
    await waitFor(() => expect(readerLaw()).toBe('民法'));

    fireEvent.keyDown(window, { key: 'Enter' });

    await user.clear(input);
    await user.type(input, '1');

    // 四部核心法規都有第 1 條。若剛才的 Enter 把民法確認成脈絡,這裡會塌成
    // 一部,摘要會宣告「共 1 條命中,分布於 1 部法規」——其餘三部的第 1 條
    // 憑空消失,而使用者無從得知自己漏掉了什麼(§6.3)。
    await waitFor(() =>
      expect(document.querySelector('.summary')?.textContent)
        .toBe('共 4 條命中,分布於 4 部法規')
    );
    expect(screen.getAllByRole('option')).toHaveLength(4);
    expect([...document.querySelectorAll('.group-title')].map((e) => e.firstChild?.textContent))
      .toEqual(['民法', '民事訴訟法', '刑法', '刑事訴訟法']);
  });

  it('使用者自己用方向鍵選過之後,Enter 仍讓該法規成為後續查詢的脈絡', async () => {
    const user = userEvent.setup();
    const input = await renderReady(coreCorpusShortArticles);

    await user.type(input, '184');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(4));

    // 使用者主動選取(§5.5 情境一 的正當來源),不是系統猜的
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    await waitFor(() => expect(readerLaw()).toBe('民事訴訟法'));
    fireEvent.keyDown(window, { key: 'Enter' });

    await user.clear(input);
    await user.type(input, '1');

    await waitFor(() => expect(readerLaw()).toBe('民事訴訟法'));
    expect(targetArticleId()).toBe('article-1');
    expect(screen.getAllByRole('option')).toHaveLength(1);
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

describe('左欄分頁(搜尋 / 目錄)', () => {
  it('切到目錄再切回搜尋,查詢字串與結果都還在', async () => {
    const user = userEvent.setup();
    const input = await renderReady(coreCorpus);

    await user.type(input, '184');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(4));

    await user.click(screen.getByRole('tab', { name: '目錄' }));
    // 目錄分頁顯示的是法規清單,搜尋結果暫時退場(但沒有被丟掉)
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByRole('button', { name: '刑法' })).toBeDefined();

    await user.click(screen.getByRole('tab', { name: '搜尋' }));
    expect((input as HTMLInputElement).value).toBe('184');
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('從目錄點條文:右欄跳過去,而且成為下一次查詢的脈絡法規(§5.5 情境一)', async () => {
    const user = userEvent.setup();
    const input = await renderReady(coreCorpus);

    await user.click(screen.getByRole('tab', { name: '目錄' }));
    await user.click(screen.getByRole('button', { name: '刑法' }));
    await user.click(screen.getByRole('button', { name: '第 185 條' }));

    await waitFor(() => expect(readerLaw()).toBe('刑法'));
    expect(targetArticleId()).toBe('article-185');

    // 點目錄是明確的使用者意圖,不是系統猜的:接著查純數字條號時,四部核心
    // 法規都有第 184 條,但脈絡已經是刑法,候選應該只剩一部。
    await user.type(input, '184');
    await waitFor(() => expect(targetArticleId()).toBe('article-184'));
    expect(readerLaw()).toBe('刑法');
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });

  it('目錄分頁按 Enter 不把左欄殘留的查詢字串記成「最近查詢」', async () => {
    const user = userEvent.setup();
    const input = await renderReady(coreCorpus);

    // 殘留的查詢字串:切到目錄之後它還在左欄上方的搜尋框裡
    await user.type(input, '184');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(4));
    await waitFor(() => expect(readerLaw()).toBe('民法'));

    await user.click(screen.getByRole('tab', { name: '目錄' }));
    fireEvent.keyDown(window, { key: 'Enter' });   // ← 不該寫入任何紀錄

    // 對照組:同一個手勢在搜尋分頁確實會寫入。它排在上面那一次之後,而
    // IndexedDB 依送出順序處理請求——所以只要下面讀到了「185」,任何來自
    // 目錄分頁的「184」也必定已經落地、必定會一起被讀出來。這個先後順序讓
    // 「184 不在清單裡」成為確定的結論,而不是搶在寫入完成前的假綠燈。
    await user.clear(input);
    await user.type(input, '185');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(4));
    fireEvent.keyDown(window, { key: 'Enter' });

    await user.clear(input);
    await waitFor(() => {
      const items = [...document.querySelectorAll('.item-text')].map((e) => e.textContent);
      expect(items).toEqual(['民法 185']);
    });
  });

  it('目錄分頁下方向鍵不會偷偷移動看不見的搜尋選取', async () => {
    const user = userEvent.setup();
    const input = await renderReady(coreCorpus);

    await user.type(input, '184');
    await waitFor(() => expect(readerLaw()).toBe('民法'));

    await user.click(screen.getByRole('tab', { name: '目錄' }));
    fireEvent.keyDown(window, { key: 'ArrowDown' });
    fireEvent.keyDown(window, { key: 'ArrowDown' });

    // 留在搜尋分頁的話,兩次 ArrowDown 會把右欄換成刑法
    expect(readerLaw()).toBe('民法');
    await user.click(screen.getByRole('tab', { name: '搜尋' }));
    expect(screen.getByRole('option', { name: /民法/ }).getAttribute('aria-selected')).toBe('true');
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

describe('左欄收合', () => {
  const body = () => document.getElementById('pane-body');
  const toggle = () => screen.getByRole('button', { name: /側欄/ });

  it('收合後左欄內容退場、版面讓給右欄,再按一次回來', async () => {
    const user = userEvent.setup();
    await renderReady(coreCorpus);

    expect(body()?.hasAttribute('hidden')).toBe(false);
    expect(document.querySelector('.app')?.className).toBe('app');

    await user.click(toggle());
    expect(body()?.hasAttribute('hidden')).toBe(true);
    // 版面真的讓出去了:光把內容藏起來、欄寬照舊的話,右欄一點也沒變寬。
    expect(document.querySelector('.app')?.className).toBe('app app-collapsed');
    expect(toggle().getAttribute('aria-expanded')).toBe('false');

    await user.click(toggle());
    expect(body()?.hasAttribute('hidden')).toBe(false);
    expect(document.querySelector('.app')?.className).toBe('app');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
  });

  it('收合再展開,查詢字串、結果與目錄展開位置都還在', async () => {
    const user = userEvent.setup();
    const input = await renderReady(coreCorpus);

    await user.type(input, '184');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(4));
    // 切到目錄並展開到法規層,製造一份「只存在於子元件內部」的狀態
    await user.click(screen.getByRole('tab', { name: '目錄' }));
    await user.click(screen.getByRole('button', { name: '刑法' }));
    expect(screen.getByRole('button', { name: '第 185 條' })).toBeDefined();

    await user.click(toggle());
    await user.click(toggle());

    // 收合若是靠「不渲染」而非 hidden,這裡會退回法規清單、查詢結果也會重算
    expect(screen.getByRole('button', { name: '第 185 條' })).toBeDefined();
    await user.click(screen.getByRole('tab', { name: '搜尋' }));
    expect((input as HTMLInputElement).value).toBe('184');
    expect(screen.getAllByRole('option')).toHaveLength(4);
  });

  it('收合狀態下打可列印字元:自動展開並把焦點交回搜尋框(§7.2)', async () => {
    const user = userEvent.setup();
    const input = await renderReady(coreCorpus);

    await user.click(toggle());
    expect(body()?.hasAttribute('hidden')).toBe(true);

    fireEvent.keyDown(window, { key: '刑' });

    expect(body()?.hasAttribute('hidden')).toBe(false);
    expect(document.activeElement).toBe(input);

    // 這裡蓋到的是「收合狀態被解除」,蓋不到「同步解除」。App.tsx 之所以用
    // flushSync,是因為真實瀏覽器不讓 hidden 子樹裡的元素取得焦點:晚一個
    // tick 展開,focus() 當下搜尋框還藏著,是個 no-op,字就掉了。
    // jsdom 沒有這層限制——實測 focus() 對 hidden 子樹裡的 input 照樣生效——
    // 所以把 flushSync 換成一般 setState,這個測試仍然全綠。
    // 別因為「測試沒失敗」就拿掉 flushSync,那條路徑要靠實機驗證。
  });

  it('收合狀態下按 Escape:展開、清空查詢、焦點回搜尋框', async () => {
    const user = userEvent.setup();
    const input = await renderReady(coreCorpus);

    await user.type(input, '184');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(4));
    await user.click(toggle());

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(body()?.hasAttribute('hidden')).toBe(false);
    expect((input as HTMLInputElement).value).toBe('');
    expect(document.activeElement).toBe(input);
  });

  it('收合不影響右欄的閱讀與 [ ] 跳章節', async () => {
    const user = userEvent.setup();
    const input = await renderReady(coreCorpus);

    await user.type(input, '184');
    await waitFor(() => expect(readerLaw()).toBe('民法'));
    await user.click(toggle());

    // 右欄照樣顯示條文
    expect(readerLaw()).toBe('民法');
    expect(targetArticleId()).toBe('article-184');
    // 而且鍵盤仍然走得到右欄(這一鍵不該被收合狀態吞掉)
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(document.activeElement).toBe(document.querySelector('.pane-right'));
  });
});

describe('搜尋框清空鈕', () => {
  const clearBtn = () => screen.queryByRole('button', { name: '清空搜尋' });

  it('有字才出現,按下後清空查詢、結果收掉、焦點回到輸入框', async () => {
    const user = userEvent.setup();
    const input = await renderReady(coreCorpus);

    // 空查詢時不該擺一顆按了沒事的鈕
    expect(clearBtn()).toBeNull();

    await user.type(input, '184');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(4));
    expect(clearBtn()).not.toBeNull();

    await user.click(clearBtn()!);

    expect((input as HTMLInputElement).value).toBe('');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    // 清空後要能直接打下一個查詢,不必再去點輸入框(§7.2)
    expect(document.activeElement).toBe(input);
    expect(clearBtn()).toBeNull();

    await user.keyboard('185');
    expect((input as HTMLInputElement).value).toBe('185');
  });
});
