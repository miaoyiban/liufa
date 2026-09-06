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

鍵盤:`↑` `↓` 移動選取,`Enter` 進入閱讀,`Esc` 清空,`[` `]` 跳編章(不跳節、款、目),`Cmd+D` 加書籤。

左欄有「搜尋」與「目錄」兩個分頁。不打字也能從目錄的法規清單一路點到條文。

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

`.github/workflows/deploy.yml` 會在推送到 `main` 或手動觸發時部署到 GitHub Pages:
安裝依賴、跑測試、`npm run build`,最後把 `dist/` 發布到 Pages。
`public/corpus.json` 已納入版控,CI 預設**不會**重新下載法規資料,直接使用
checkout 帶下來的版本(原因與更新流程見下一節)。

`vite.config.ts` 的 `base` 在 CI(`GITHUB_ACTIONS` 環境變數存在時)設為 `/liufa/`,
本機開發則維持 `/`。**部署前務必確認**:若這個 repository 在 GitHub 上的實際名稱
不是 `liufa`(例如 fork 後改了名字),要先把這裡的 `base` 改成對應的
`/<repo>/`,否則所有資產、manifest 與 Service Worker 的路徑都會指到錯誤的
前綴,production 站台會整頁空白。

## 更新法規資料

`public/corpus.json` 是建置產物,但已提交進版控,**必須手動更新**:GitHub Actions
的 runner 連不到法務部的資料來源主機,首次部署即以連線逾時失敗
(`connect ETIMEDOUT 163.29.130.174:443`,是連不上,不是被拒絕),
判斷是台灣政府網段對該類 runner IP 的封鎖,而非程式碼問題。

更新步驟:

```bash
npm run data              # 重新下載並產生 public/corpus.json
git status                # 確認 public/corpus.json 有變動
git add public/corpus.json
git commit -m "..."
git push
```

## 恢復自動化

若日後換到連得到 `sendlaw.moj.gov.tw` 的主機(例如自架 runner,或來源開放了
GitHub-hosted runner 的 IP 段),可以重新打開 CI 自動重建:

- **永久打開**:在 repo 的 Settings → Secrets and variables → Actions → Variables
  新增 repo variable `REBUILD_CORPUS`,值設為 `true`。之後每次 push 到 `main`
  都會先執行 `npm run data` 再建置。
- **手動跑一次**:在 Actions 頁面手動觸發 `Deploy` workflow(`workflow_dispatch`),
  勾選 `rebuild_corpus` 輸入。
- **恢復每月自動重建**(對應來源的月更頻率):在 `deploy.yml` 的 `on:` 底下加回

  ```yaml
    schedule:
      - cron: '0 2 1 * *'
  ```

  同時把 `REBUILD_CORPUS` 設為 `true`——否則排程觸發時 `npm run data` 一樣會被跳過。

以上任一開關打開且下載成功時,**新語料只用於該次部署,不會被 commit 回 repo**,
repo 內的 `public/corpus.json` 仍是舊版本,下次沒開開關的部署會用回舊的。
若開關打開但下載失敗,建置會直接失敗(fail-fast),不會靜默退回已提交的版本。
