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
});
