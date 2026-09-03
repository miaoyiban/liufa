import { describe, it, expect } from 'vitest';
import { loadLaws } from './loadLaws';
import { assertNoAliasConflicts } from '../../src/core/alias';

describe('loadLaws', () => {
  const laws = loadLaws('data/laws.yaml');

  it('讀到 100 部法規', () => {
    expect(laws).toHaveLength(100);
  });

  it('每部都有 pcode、abbr、group', () => {
    for (const l of laws) {
      expect(l.pcode).toMatch(/^[A-Z]\d{7}$/);
      expect(l.abbr.length).toBeGreaterThan(0);
      expect(l.group.length).toBeGreaterThan(0);
    }
  });

  it('pcode 不重複', () => {
    expect(new Set(laws.map((l) => l.pcode)).size).toBe(100);
  });

  it('真實清單的別名無衝突', () => {
    expect(() => assertNoAliasConflicts(laws)).not.toThrow();
  });

  it('民法與刑法的別名正確', () => {
    expect(laws.find((l) => l.pcode === 'B0000001')?.aliases).toContain('民');
    expect(laws.find((l) => l.pcode === 'C0000001')?.abbr).toBe('刑法');
  });
});
