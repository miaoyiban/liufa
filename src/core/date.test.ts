import { describe, it, expect } from 'vitest';
import { formatLawDate } from './date';

describe('formatLawDate', () => {
  it('將 yyyymmdd 轉為 yyyy-mm-dd', () => {
    expect(formatLawDate('20260817')).toBe('2026-08-17');
  });

  it('格式不符時原樣回傳', () => {
    expect(formatLawDate('1.制定')).toBe('1.制定');
  });

  it('空字串原樣回傳', () => {
    expect(formatLawDate('')).toBe('');
  });
});
