import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App, setUpdateAvailable } from './ui/App';

// 不自動靜默更新:偵測到新版只標記狀態,由 UpdateBanner 讓使用者決定何時重新載入。
registerSW({
  onNeedRefresh() { setUpdateAvailable(true); },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
