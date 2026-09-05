import { useEffect, useRef } from 'react';

type Options = {
  count: number;
  selected: number;
  onMove: (index: number) => void;
  onEnter: () => void;
  onEscape: () => void;
  onDivision: (dir: -1 | 1) => void;
  onBookmark: () => void;
  /** 焦點不在輸入框時打了可列印字元:把焦點交回搜尋框,別讓輸入消失 */
  onPrintable: () => void;
};

export function useKeyboard(opts: Options): void {
  // 用 ref 存最新的 opts,讓下面的 effect 只訂閱一次 window 監聽器;
  // 每次 render 時這裡會同步更新,handler 觸發時讀到的永遠是最新值,
  // 不會有「掛上監聽器當下」被凍結住的陳舊 closure。
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 注音/拼音等輸入法組字中,方向鍵在選字、Enter 在選字確認、
      // Escape 在取消組字——這些都不是本應用的導航鍵,一律放行。
      if (e.isComposing) return;

      const target = e.target as HTMLElement | null;
      // 筆記編輯中不攔截任何導航鍵
      if (target?.tagName === 'TEXTAREA') return;

      const {
        count, selected, onMove, onEnter, onEscape, onDivision, onBookmark, onPrintable,
      } = optsRef.current;

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        onBookmark();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case 'ArrowDown':
          if (count === 0) return;
          e.preventDefault();
          onMove(Math.min(selected + 1, count - 1));
          return;
        case 'ArrowUp':
          if (count === 0) return;
          e.preventDefault();
          onMove(Math.max(selected - 1, 0));
          return;
        case 'Enter':
          onEnter();
          return;
        case 'Escape':
          onEscape();
          return;
        case '[':
          // 搜尋框是 autoFocus,打中括號字元時不能同時跳章節
          if (target?.tagName === 'INPUT') return;
          onDivision(-1);
          return;
        case ']':
          if (target?.tagName === 'INPUT') return;
          onDivision(1);
          return;
        default:
          // §7.2「焦點預設永遠在搜尋框,開啟即可打字」。Enter 之後焦點在右欄
          // (不可編輯的 div),沒有這條路徑的話,接著打的字會靜默消失,課堂上
          // 的 查詢 → Enter → 閱讀 → 下一個查詢 迴圈就在第四步斷掉。
          // 只認可列印字元(單一字元的 key),功能鍵不算;不 preventDefault,
          // 讓這個字元本身照樣落進剛聚焦的搜尋框。
          if (target?.tagName === 'INPUT') return;
          if (e.key.length !== 1) return;
          onPrintable();
          return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
}
