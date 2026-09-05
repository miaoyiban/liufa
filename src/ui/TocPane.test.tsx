// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TocPane } from './TocPane';
import type { Block, Corpus, Law } from '../core/types';

const d = (level: number, label: string): Block => ({ t: 'd', level, label });
const a = (no: string): Block => ({
  t: 'a', no, main: Number(no), sub: 0, label: `第 ${no} 條`, text: `第${no}條內容。`,
});

function mkLaw(pcode: string, abbr: string, group: string, blocks: Block[]): Law {
  return { pcode, name: abbr, abbr, aliases: [], group, updated: '20260817', history: '1.制定', blocks };
}

const corpus: Corpus = {
  sourceUpdatedAt: '2026/8/21',
  builtAt: '2026-09-03T00:00:00.000Z',
  laws: [
    mkLaw('A0000001', '憲法', '憲法及關係法規', [a('1')]),
    mkLaw('B0000001', '民法', '民法及關係法規', [
      d(0, '第 一 編 總則'),
      d(1, '第 一 章 法例'),
      a('1'),
      a('2'),
      d(1, '第 二 章 人'),
      a('6'),
      d(0, '第 二 編 債'),
      a('153'),
    ]),
    mkLaw('B0000002', '民法總則施行法', '民法及關係法規', [a('1')]),
    mkLaw('C0000001', '刑法', '刑法及關係法規', [a('1')]),
  ],
};

/** 目前渲染出來的樹節點數(懶展開的觀測點) */
function nodeCount(): number {
  return document.querySelectorAll('.toc-list li').length;
}

function renderPane(props: Partial<Parameters<typeof TocPane>[0]> = {}) {
  const onOpen = vi.fn();
  render(<TocPane corpus={corpus} reader={null} onOpen={onOpen} {...props} />);
  return { onOpen, user: userEvent.setup() };
}

describe('TocPane 法規清單', () => {
  it('依分類分組,分類順序與法規順序都照 corpus', () => {
    renderPane();

    expect([...document.querySelectorAll('.toc-group')].map((e) => e.textContent))
      .toEqual(['憲法及關係法規', '民法及關係法規', '刑法及關係法規']);
    expect([...document.querySelectorAll('.toc-law')].map((e) => e.textContent))
      .toEqual(['憲法', '民法', '民法總則施行法', '刑法']);
  });

  it('點法規進入該法的編章節樹,再按返回回到清單', async () => {
    const { user } = renderPane();

    await user.click(screen.getByRole('button', { name: '民法' }));
    expect(screen.getByRole('button', { name: '第 一 編 總則' })).toBeDefined();
    expect(screen.queryByRole('button', { name: '刑法' })).toBeNull();

    await user.click(screen.getByRole('button', { name: /返回法規清單/ }));
    expect(screen.getByRole('button', { name: '刑法' })).toBeDefined();
    expect(screen.queryByRole('button', { name: '第 一 編 總則' })).toBeNull();
  });
});

describe('TocPane 編章節樹', () => {
  it('預設只展開到最外層,子節點完全不 render(懶展開)', async () => {
    const { user } = renderPane();
    await user.click(screen.getByRole('button', { name: '民法' }));

    // 只有兩個編,章與條文都還沒進 DOM
    expect(nodeCount()).toBe(2);
    expect(screen.queryByRole('button', { name: '第 一 章 法例' })).toBeNull();
    expect(screen.queryByRole('button', { name: '第 1 條' })).toBeNull();
  });

  it('點編章節展開一層,再點收合,收合後子節點離開 DOM', async () => {
    const { user } = renderPane();
    await user.click(screen.getByRole('button', { name: '民法' }));

    const bian = screen.getByRole('button', { name: '第 一 編 總則' });
    expect(bian.getAttribute('aria-expanded')).toBe('false');

    await user.click(bian);
    expect(bian.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: '第 一 章 法例' })).toBeDefined();
    // 只展開一層:章底下的條文仍未 render
    expect(screen.queryByRole('button', { name: '第 1 條' })).toBeNull();

    await user.click(bian);
    expect(bian.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: '第 一 章 法例' })).toBeNull();
    expect(nodeCount()).toBe(2);
  });

  it('點條文設定 reader(pcode 與條號都要對)', async () => {
    const { user, onOpen } = renderPane();
    await user.click(screen.getByRole('button', { name: '民法' }));
    await user.click(screen.getByRole('button', { name: '第 一 編 總則' }));
    await user.click(screen.getByRole('button', { name: '第 一 章 法例' }));

    onOpen.mockClear();
    await user.click(screen.getByRole('button', { name: '第 2 條' }));

    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith({ pcode: 'B0000001', no: '2' });
  });

  it('展開編章節時順便把右欄捲到該節開頭(該節第一條),收合時不動右欄', async () => {
    const { user, onOpen } = renderPane();
    await user.click(screen.getByRole('button', { name: '民法' }));

    onOpen.mockClear();
    const bian = screen.getByRole('button', { name: '第 二 編 債' });
    await user.click(bian);
    expect(onOpen).toHaveBeenCalledWith({ pcode: 'B0000001', no: '153' });

    // 收合是「收起來」,不是「移動閱讀位置」
    onOpen.mockClear();
    await user.click(bian);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('沒有編章節的單行法直接列出條文', async () => {
    const { user } = renderPane();
    await user.click(screen.getByRole('button', { name: '刑法' }));

    expect(screen.getByRole('button', { name: '第 1 條' })).toBeDefined();
  });
});

describe('TocPane 自動展開到目前正在讀的條文', () => {
  it('掛載時 reader 已指向某條文:直接開在該法並展開整條路徑', () => {
    renderPane({ reader: { pcode: 'B0000001', no: '6' } });

    // 不是停在法規清單,而是停在正在讀的地方
    expect(screen.queryByRole('button', { name: '刑法' })).toBeNull();
    expect(screen.getByRole('button', { name: '第 一 編 總則' }).getAttribute('aria-expanded'))
      .toBe('true');
    expect(screen.getByRole('button', { name: '第 二 章 人' }).getAttribute('aria-expanded'))
      .toBe('true');
    expect(screen.getByRole('button', { name: '第 6 條' })).toBeDefined();

    // 路徑以外的兄弟節點仍然收合(展開的是路徑,不是整棵樹)
    expect(screen.getByRole('button', { name: '第 一 章 法例' }).getAttribute('aria-expanded'))
      .toBe('false');
    expect(screen.queryByRole('button', { name: '第 1 條' })).toBeNull();
  });

  it('reader 換到另一部法規時,目錄跟著換過去', () => {
    const { rerender } = render(<TocPane corpus={corpus} reader={null} onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: '刑法' })).toBeDefined();

    rerender(<TocPane corpus={corpus} reader={{ pcode: 'B0000001', no: '2' }} onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: '第 2 條' })).toBeDefined();
  });

  it('使用者自己在同一部法規裡收合的節點,不會被 reader 移動又自動展開回去', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <TocPane corpus={corpus} reader={{ pcode: 'B0000001', no: '2' }} onOpen={vi.fn()} />
    );
    const bian = screen.getByRole('button', { name: '第 一 編 總則' });
    expect(bian.getAttribute('aria-expanded')).toBe('true');

    await user.click(bian);
    expect(bian.getAttribute('aria-expanded')).toBe('false');

    // 右欄捲到同一部法規的另一條(例如搜尋結果移動),不該把使用者收起來的東西
    // 又硬展開回來——自動展開只發生在「開啟一部法規」的那一刻。
    rerender(<TocPane corpus={corpus} reader={{ pcode: 'B0000001', no: '6' }} onOpen={vi.fn()} />);
    expect(screen.getByRole('button', { name: '第 一 編 總則' }).getAttribute('aria-expanded'))
      .toBe('false');
  });
});

// 懶展開的節點數必須用真實的民法量到,小 fixture 量不出「1,439 條全展開」的
// 差別——那正是本分支先前 I1(單字查詢渲染 79,058 個 DOM 節點)的覆轍。
const PATH = 'public/corpus.json';

describe('TocPane 懶展開的節點數(真實民法資料)', () => {
  if (!existsSync(PATH)) {
    it('corpus.json 尚未建置', () => {
      throw new Error(`找不到 ${PATH},請先執行 npm run data`);
    });
  } else {
    const real = JSON.parse(readFileSync(PATH, 'utf8')) as Corpus;

    it('開啟民法且全部收合時,渲染的節點數遠小於 1,439 條;展開一編只增加該編的直屬子節點', async () => {
      const user = userEvent.setup();
      const mf = real.laws.find((l) => l.pcode === 'B0000001')!;
      expect(mf.abbr).toBe('民法');
      expect(mf.blocks.filter((b) => b.t === 'a')).toHaveLength(1439);

      render(<TocPane corpus={real} reader={null} onOpen={vi.fn()} />);
      await user.click(screen.getByRole('button', { name: '民法' }));

      // 民法有 5 編;收合時 DOM 裡就只有這 5 個節點
      const collapsed = nodeCount();
      expect(collapsed).toBe(5);
      expect(collapsed).toBeLessThan(50); // 遠小於 1,439 條的明確上限

      // 展開第一編(總則,7 章)只多出那 7 個直屬子節點,不是整編的條文
      await user.click(screen.getByRole('button', { name: '第 一 編 總則' }));
      expect(nodeCount()).toBe(collapsed + 7);

      // 收回去就回到原點,展開過的子樹不會留在 DOM 裡
      await user.click(screen.getByRole('button', { name: '第 一 編 總則' }));
      expect(nodeCount()).toBe(collapsed);
    });
  }
});
