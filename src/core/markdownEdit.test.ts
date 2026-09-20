import { describe, it, expect } from 'vitest';
import { applyMarkdownAction, diffRange, type Edit } from './markdownEdit';

/**
 * 「a«bc»d」表示選取了 bc;「a«»d」表示游標停在 a 與 d 之間。
 * 游標位置是這組函式一半的行為,用字串寫出來才看得見。
 */
function at(s: string): Edit {
  const selStart = s.indexOf('«');
  const selEnd = s.indexOf('»') - 1;
  return { text: s.replace(/[«»]/g, ''), selStart, selEnd };
}
function show(e: Edit): string {
  return (
    e.text.slice(0, e.selStart) + '«' +
    e.text.slice(e.selStart, e.selEnd) + '»' +
    e.text.slice(e.selEnd)
  );
}
const run = (a: Parameters<typeof applyMarkdownAction>[0], s: string) =>
  show(applyMarkdownAction(a, at(s)));

describe('粗體 / 斜體', () => {
  it('包住選取的文字,並讓文字維持選取', () => {
    expect(run('bold', '«過失»責任')).toBe('**«過失»**責任');
    expect(run('italic', '«過失»責任')).toBe('*«過失»*責任');
  });

  it('標記在選取範圍「內」時解除包裹', () => {
    expect(run('bold', '«**過失**»責任')).toBe('«過失»責任');
    expect(run('italic', '«*過失*»責任')).toBe('«過失»責任');
  });

  it('標記在選取範圍「外」時也解除 —— 剛加粗後重選該詞再按一次的情況', () => {
    expect(run('bold', '**«過失»**責任')).toBe('«過失»責任');
    expect(run('italic', '*«過失»*責任')).toBe('«過失»責任');
  });

  it('空選取時插入一對標記,游標停在中間', () => {
    expect(run('bold', '過失«»責任')).toBe('過失**«»**責任');
    expect(run('italic', '過失«»責任')).toBe('過失*«»*責任');
  });

  it('斜體不把粗體的 ** 誤判成自己的標記', () => {
    // 在粗體內再加斜體,應該得到三顆星,而不是把粗體拆成斜體
    expect(run('italic', '**«過失»**責任')).toBe('***«過失»***責任');
  });

  it('粗體不把斜體的單星誤判成自己的標記', () => {
    expect(run('bold', '*«過失»*責任')).toBe('***«過失»***責任');
  });
});

describe('行前綴:標題 / 清單 / 編號 / 引用', () => {
  it('加在游標所在的整行上,游標跟著位移', () => {
    expect(run('bullet', '買賣«»契約')).toBe('- 買賣«»契約');
    expect(run('heading', '«»要件')).toBe('## «»要件');
    expect(run('quote', '判決«»要旨')).toBe('> 判決«»要旨');
  });

  it('多行選取時每一行都加,選取把新前綴一起圈住(才按得了第二次)', () => {
    expect(run('bullet', '«行為\n因果關係»')).toBe('«- 行為\n- 因果關係»');
  });

  it('單行選了一個詞時,選取跟著位移,那個詞還在選取裡', () => {
    expect(run('bullet', '前言\n«行為»\n結論')).toBe('前言\n- «行為»\n結論');
  });

  it('編號清單依序編號', () => {
    expect(run('ordered', '«行為\n因果關係\n損害»')).toBe('«1. 行為\n2. 因果關係\n3. 損害»');
  });

  it('所有行都已有前綴時整組移除(再按一次就關掉)', () => {
    expect(run('bullet', '«- 行為\n- 因果關係»')).toBe('«行為\n因果關係»');
    expect(run('ordered', '«1. 行為\n2. 因果關係»')).toBe('«行為\n因果關係»');
    expect(run('heading', '«## 要件»')).toBe('«要件»');
  });

  it('只有部分行有前綴時,補齊而不是移除', () => {
    expect(run('bullet', '«- 行為\n因果關係»')).toBe('«- 行為\n- 因果關係»');
  });

  it('清單與編號互換時換掉舊前綴,不疊加', () => {
    expect(run('ordered', '«- 行為\n- 因果關係»')).toBe('«1. 行為\n2. 因果關係»');
    expect(run('bullet', '«1. 行為\n2. 因果關係»')).toBe('«- 行為\n- 因果關係»');
  });

  it('只影響選取涵蓋的行,不動前後', () => {
    expect(run('quote', '前言\n«判決»\n結論')).toBe('前言\n> «判決»\n結論');
  });

  it('移除前綴時游標不會被推到行首之前', () => {
    expect(run('bullet', '- «»行為')).toBe('«»行為');
  });
});

describe('連結', () => {
  it('把選取文字當連結文字,游標停在網址括號內', () => {
    expect(run('link', '參見«第185條»')).toBe('參見[第185條](«»)');
  });

  it('空選取時給一對空括號,游標停在連結文字的位置', () => {
    expect(run('link', '參見«»')).toBe('參見[«»]()');
  });
});

describe('不變式', () => {
  it('游標位置永遠落在新文字的範圍內', () => {
    const actions = ['bold', 'italic', 'heading', 'bullet', 'ordered', 'quote', 'link'] as const;
    const inputs = ['«»', '«a»', 'a«»b', '«a\nb»', '- «a»', '## «a»', '**«a»**'];
    for (const a of actions) {
      for (const i of inputs) {
        const r = applyMarkdownAction(a, at(i));
        expect(r.selStart).toBeGreaterThanOrEqual(0);
        expect(r.selEnd).toBeGreaterThanOrEqual(r.selStart);
        expect(r.selEnd).toBeLessThanOrEqual(r.text.length);
      }
    }
  });
});

describe('diffRange(最小改動區間)', () => {
  /** 把 a 的 [start,endA) 換成 insert,必須還原出 b */
  const roundTrip = (a: string, b: string) => {
    const { start, endA, insert } = diffRange(a, b);
    return a.slice(0, start) + insert + a.slice(endA);
  };

  it('區間只涵蓋改動處,不重寫整串(後面沒動到的「責任」留在區間外)', () => {
    // 前後各插一對 ** 無法用單一前後綴比對拆成兩段插入,所以區間會涵蓋
    // 「過失」整個詞;重點是它到此為止,沒有把後面的「責任」也圈進來。
    expect(diffRange('過失責任', '**過失**責任'))
      .toEqual({ start: 0, endA: 2, insert: '**過失**' });
  });

  it('刪除時 insert 為空字串', () => {
    expect(diffRange('- 行為', '行為')).toEqual({ start: 0, endA: 2, insert: '' });
  });

  it('前後都相同時區間為空', () => {
    expect(diffRange('行為', '行為')).toEqual({ start: 2, endA: 2, insert: '' });
  });

  it('套用回去一定還原出目標字串', () => {
    const pairs: [string, string][] = [
      ['', '**'], ['abc', ''], ['過失責任', '**過失**責任'],
      ['- a\n- b', 'a\nb'], ['a\nb', '1. a\n2. b'], ['aaa', 'aa'], ['aa', 'aaa'],
    ];
    for (const [a, b] of pairs) expect(roundTrip(a, b)).toBe(b);
  });

  it('經過 applyMarkdownAction 的每一種動作都能還原', () => {
    const actions = ['bold', 'italic', 'heading', 'bullet', 'ordered', 'quote', 'link'] as const;
    const inputs = ['«»', '«過失»', 'a«»b', '«a\nb»', '- «a»', '## «a»', '**«a»**'];
    for (const a of actions) {
      for (const i of inputs) {
        const cur = at(i);
        const next = applyMarkdownAction(a, cur);
        expect(roundTrip(cur.text, next.text)).toBe(next.text);
      }
    }
  });
});
