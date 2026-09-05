// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useKeyboard } from './useKeyboard';

function setup(over: Partial<Parameters<typeof useKeyboard>[0]> = {}) {
  const opts = {
    count: 3, selected: 1,
    onMove: vi.fn(), onEnter: vi.fn(), onEscape: vi.fn(),
    onDivision: vi.fn(), onBookmark: vi.fn(),
    ...over,
  };
  renderHook(() => useKeyboard(opts));
  return opts;
}

const press = (key: string, init: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));

describe('useKeyboard', () => {
  it('↓ 往下移動', () => {
    const o = setup();
    press('ArrowDown');
    expect(o.onMove).toHaveBeenCalledWith(2);
  });

  it('↑ 往上移動', () => {
    const o = setup();
    press('ArrowUp');
    expect(o.onMove).toHaveBeenCalledWith(0);
  });

  it('在尾端按 ↓ 不越界', () => {
    const o = setup({ selected: 2 });
    press('ArrowDown');
    expect(o.onMove).toHaveBeenCalledWith(2);
  });

  it('在頂端按 ↑ 不越界', () => {
    const o = setup({ selected: 0 });
    press('ArrowUp');
    expect(o.onMove).toHaveBeenCalledWith(0);
  });

  it('無結果時方向鍵不觸發', () => {
    const o = setup({ count: 0 });
    press('ArrowDown');
    expect(o.onMove).not.toHaveBeenCalled();
  });

  it('Enter 進入閱讀', () => {
    const o = setup();
    press('Enter');
    expect(o.onEnter).toHaveBeenCalled();
  });

  it('Escape 觸發清空', () => {
    const o = setup();
    press('Escape');
    expect(o.onEscape).toHaveBeenCalled();
  });

  it('[ 與 ] 跳章節', () => {
    const o = setup();
    press('[');
    expect(o.onDivision).toHaveBeenCalledWith(-1);
    press(']');
    expect(o.onDivision).toHaveBeenCalledWith(1);
  });

  it('Cmd+D 加書籤', () => {
    const o = setup();
    press('d', { metaKey: true });
    expect(o.onBookmark).toHaveBeenCalled();
  });

  it('在 textarea 中輸入時不攔截方向鍵', () => {
    const o = setup();
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(o.onMove).not.toHaveBeenCalled();
    ta.remove();
  });

  it('輸入法組字中不攔截任何鍵(isComposing)', () => {
    const o = setup();
    press('ArrowDown', { isComposing: true });
    press('Enter', { isComposing: true });
    press('Escape', { isComposing: true });
    expect(o.onMove).not.toHaveBeenCalled();
    expect(o.onEnter).not.toHaveBeenCalled();
    expect(o.onEscape).not.toHaveBeenCalled();
  });

  it('搜尋框(input)聚焦時方向鍵仍可運作', () => {
    const o = setup();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(o.onMove).toHaveBeenCalledWith(2);
    input.remove();
  });

  it('搜尋框(input)中打中括號字元不觸發跳章節', () => {
    const o = setup();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: '[', bubbles: true }));
    expect(o.onDivision).not.toHaveBeenCalled();
    input.remove();
  });

  it('連續按兩次 ↓ 而中間沒有重新 render,兩次都以目前的 selected 計算', () => {
    // 這是防呆測試:確保「只訂閱一次」的最佳化不是靠內部自行遞增一個
    // 计数器來取代 selected prop——若真的那樣做,第二次按下會算出 3
    // 而非正確的 2(因為 mock 的 onMove 不會真的回頭更新 selected)。
    const o = setup();
    press('ArrowDown');
    press('ArrowDown');
    expect(o.onMove).toHaveBeenNthCalledWith(1, 2);
    expect(o.onMove).toHaveBeenNthCalledWith(2, 2);
  });
});
