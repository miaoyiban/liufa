/**
 * 資料不自動靜默更新:使用者可能正在對照條文,腳下的資料不該無預警替換。
 * 偵測到新版只顯示橫幅,重新載入與否完全由使用者決定。
 */
export function UpdateBanner({
  visible, onReload,
}: { visible: boolean; onReload: () => void }) {
  if (!visible) return null;
  return (
    <div className="update-banner" role="status" aria-live="polite">
      法規資料有更新
      <button onClick={onReload}>重新載入</button>
    </div>
  );
}

/** 常駐顯示資料版本,讓使用者隨時知道自己看的是不是現行版本。來源格式為 "2026/8/21 上午 12:00:00"。 */
export function DataVersion({ sourceUpdatedAt }: { sourceUpdatedAt: string }) {
  const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})/.exec(sourceUpdatedAt);
  const text = m
    ? `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`
    : sourceUpdatedAt || '未知';
  return <div className="data-version">資料版本 {text}</div>;
}
