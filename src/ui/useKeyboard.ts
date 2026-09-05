import { useEffect } from 'react';

type Options = {
  count: number;
  selected: number;
  onMove: (index: number) => void;
  onEnter: () => void;
  onEscape: () => void;
  onDivision: (dir: -1 | 1) => void;
  onBookmark: () => void;
};

export function useKeyboard(opts: Options): void {
  const { count, selected, onMove, onEnter, onEscape, onDivision, onBookmark } = opts;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 筆記編輯中不攔截任何導航鍵
      const target = e.target as HTMLElement | null;
      if (target?.tagName === 'TEXTAREA') return;

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
          onDivision(-1);
          return;
        case ']':
          onDivision(1);
          return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [count, selected, onMove, onEnter, onEscape, onDivision, onBookmark]);
}
