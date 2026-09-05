import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // GitHub Pages 部署在 /<repo>/ 之下;本機開發維持根路徑
  base: process.env.GITHUB_ACTIONS ? '/law/' : '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt', // 不自動更新:由使用者決定何時重新載入
      manifest: {
        name: '小六法',
        short_name: '小六法',
        lang: 'zh-Hant',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,json}'],
        // corpus.json 約 5.3 MB,遠超過 workbox 預設的 2 MB 上限
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
      },
    }),
  ],
  test: { globals: true },
});
