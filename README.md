# 小六法

完全離線的小六法即時查詢工具。收錄 100 部法規,輸入的同時出結果。

## 用法

| 輸入 | 意義 |
|---|---|
| `184` | 在目前開啟的法規內跳到第 184 條 |
| `民184` / `民法184` / `民法 184` | 民法第 184 條 |
| `民184-1` / `民法184之1` | 民法第 184 條之 1 |
| `過失` | 全域關鍵字 |
| `民法 過失` | 限定民法內搜尋 |
| `過失 傷害` | 兩個關鍵字都要出現 |

鍵盤:`↑` `↓` 移動選取,`Enter` 進入閱讀,`Esc` 清空,`[` `]` 跳章節,`Cmd+D` 加書籤。

## 開發

```bash
npm install
npm run data     # 下載法規資料並建置 corpus.json(首次必須執行)
npm run dev
npm test
```

需要 Node.js 20 以上(建置腳本使用內建 `fetch`)。

## 資料來源

[全國法規資料庫開放資料](https://data.gov.tw/dataset/18289)「中文法規_法律資料檔」,
政府資料開放授權條款第 1 版,每月更新。收錄清單見 `data/laws.yaml`。

新增法規:在 `data/laws.yaml` 加一行(PCode 可從全國法規資料庫的網址取得),
重跑 `npm run data`。別名衝突或 PCode 不存在時建置會失敗並指出原因。

## 部署

`.github/workflows/deploy.yml` 會在推送到 `main`、手動觸發,或每月 1 日(對應資料來源的月更頻率)
自動重建並部署到 GitHub Pages:安裝依賴、執行 `npm run data` 產生 `public/corpus.json`
(此檔不進版控,必須在跑測試與 build 之前先產生,否則 `corpus.test.ts`
的守門測試會直接失敗),再跑測試、`npm run build`,最後把 `dist/` 發布到 Pages。

`vite.config.ts` 的 `base` 在 CI(`GITHUB_ACTIONS` 環境變數存在時)設為 `/law/`,
本機開發則維持 `/`。**部署前務必確認**:若這個 repository 在 GitHub 上的實際名稱
不是 `law`(例如 fork 後改了名字),要先把這裡的 `base` 改成對應的
`/<repo>/`,否則所有資產、manifest 與 Service Worker 的路徑都會指到錯誤的
前綴,production 站台會整頁空白。
