// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpdateBanner, DataVersion } from './UpdateBanner';

describe('UpdateBanner', () => {
  it('沒有更新時不顯示', () => {
    const { container } = render(<UpdateBanner visible={false} onReload={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('有更新時顯示提示', () => {
    render(<UpdateBanner visible onReload={() => {}} />);
    expect(screen.getByText(/法規資料有更新/)).toBeDefined();
  });

  it('點擊後才重新載入,不自動執行', async () => {
    const onReload = vi.fn();
    render(<UpdateBanner visible onReload={onReload} />);
    expect(onReload).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /重新載入/ }));
    expect(onReload).toHaveBeenCalled();
  });
});

describe('DataVersion', () => {
  it('把來源日期格式化後顯示', () => {
    render(<DataVersion sourceUpdatedAt="2026/8/21 上午 12:00:00" />);
    expect(screen.getByText('資料版本 2026-08-21')).toBeDefined();
  });

  it('無法解析時原樣顯示', () => {
    render(<DataVersion sourceUpdatedAt="未知" />);
    expect(screen.getByText('資料版本 未知')).toBeDefined();
  });
});
