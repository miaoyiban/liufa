import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App, setUpdateAvailable, setUpdateHandler } from './ui/App';

// 不自動靜默更新:偵測到新版只標記狀態,由 UpdateBanner 讓使用者按下後才真正更新。
// registerSW() 回傳的函式才會送出 skip-waiting 訊息啟用新的 Service Worker 並在
// 生效後重新整理;若改成單純呼叫 location.reload(),拿到的仍是舊 worker 快取的
// 舊版內容,按鈕形同虛設。
const updateSW = registerSW({
  onNeedRefresh() { setUpdateAvailable(true); },
  onRegisterError(error) { console.error('Service Worker 註冊失敗', error); },
});
setUpdateHandler(() => { void updateSW(); });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
