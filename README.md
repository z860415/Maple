# 楓星打王集合所 · Cloudflare 版

Discord 帳號登入、角色資料、自由開團、正取與候補、出席、分寶及領取紀錄。
任何 Discord 帳號都能登入，只要求 identify，不檢查伺服器或身分組。

## 先部署後端（不需要安裝開發工具）

1. Cloudflare → Storage & databases → D1 → **maple-db** → Console。
   開啟本資料夾的 `schema.sql`，貼上內容並執行。若介面一次只接受一條 SQL，逐條執行；最後 CREATE TRIGGER 到 END; 是同一條。
   這是全新 D1 的初始化，不能拿來直接遷移舊 Python SQLite 資料。
2. Workers & Pages → **maple-api** → Edit code。
   用 `worker.js` 的全部內容取代預設程式，按 Deploy。使用 ES module 格式。
3. 確認 Worker 的 Bindings 有 D1，名稱 **DB**，對應 **maple-db**。
4. Settings → Variables and Secrets：

|名稱|類型|值|
|---|---|---|
|DISCORD_CLIENT_ID|Variable|你的 Discord Application ID|
|DISCORD_CLIENT_SECRET|Secret|你已重設的 Discord Secret|
|PUBLIC_API_URL|Variable|https://maple-api.z860415.workers.dev|
|FRONTEND_URL|Variable|https://z860415.github.io/Maple/|

已設定的欄位保留即可。沒有 DISCORD_GUILD_ID 或 DISCORD_MEMBER_ROLE_ID 的需求。
Discord OAuth2 Redirect 必須是 `https://maple-api.z860415.workers.dev/api/auth/callback`。

5. 開啟 https://maple-api.z860415.workers.dev/api/health ，應看到 `{"ok":true}`。
   再開啟 `/api/config`，確認 `login_ready` 是 true。
   `discord_ready:false` 只表示未開啟頻道公告，不影響登入或報名。

## 上傳 GitHub，啟用前端

`web/config.js` 已填好後端網址。**不要上傳任何 Secret、.env 或 .dev.vars。**

如果 Maple 還是空的，在解壓縮後、看得到 README.md 的資料夾開啟終端機：

```sh
git init -b main
git add .
git commit -m "Build Discord raid site on Cloudflare Workers and D1"
git remote add origin git@github.com:z860415/Maple.git
git push -u origin main
```

這使用你電腦的 GitHub SSH 登入。若尚未設定 SSH，可改用 GitHub Desktop 登入後，Clone `z860415/Maple`，把本資料夾內檔案（含 `.github`）複製到 clone 的資料夾，再 Commit、Push。
若遠端已經有檔案，請採 Clone 後 Commit 的方式，不要 force push。

GitHub → Maple → Settings → Pages → Build and deployment → Source 選 **GitHub Actions**。
到 Actions → Deploy frontend to GitHub Pages → Run workflow。
完成後網站是 https://z860415.github.io/Maple/ 。

## 實際驗收

- 網站按 Discord 登入，授權頁只要求基本身分；不應要求加入公會。
- 填寫角色，開團；第二個 Discord 帳號登入報名。
- 人數額滿後候補；正取退出後依報名時間及帳號 ID 遞補。
- 團長開始打王 → 勾選並儲存出席 → 完成打王 → 分寶結算。
- 標記有人領取後禁止清除結算，需先取消已領標記。

## Discord 招募公告（選用）

若要在你管理的 Discord 頻道公告，另外建立頻道 Webhook，並將 URL 存為 Worker Secret `DISCORD_WEBHOOK_URL`。
未設定時網站隱藏「同步至 Discord」；仍可複製招募文字自行貼上。
首次公告只在團長按同步按鈕時發送，其後報名與團隊變更會嘗試更新同一則訊息。訊息不會觸發 mentions。
同步失敗時網站資料保留，可手動同步重試。

為避免網路逾時重複發送，首次發送結果不明時會鎖住同步。
站長先查看頻道：如果訊息已存在，在 D1 Console 設定正確訊息 ID，再解除鎖：

```sql
UPDATE raids SET message_id='實際Discord訊息ID',publishing=0,sync_error=NULL WHERE id=實際團隊ID;
```

如果確認沒有訊息，僅將該團 `publishing=0`，再按同步。不要在仍在發送時解除鎖。

## 分寶規則與目前範圍

- 售價 = 物品數量 × 單價，手續費預設 3%。
- 預設 1 千萬楓幣 = 9000 楓點，可修改。
- 成本的數量供紀錄；金額是該列總額，不會再乘數量。
- 楓點／楓幣是同一筆成本，依最後編輯欄位計算，不重複扣除。
- 後端使用 BigInt 有理數計算，淨額向下取整，再依出席人數均分；餘數另列。
- 負收益不允許儲存；超過 JavaScript 安全整數的總額會拒絕。
- 一個帳號一個角色設定，每次報名保留當時的角色資料。
- 一團共用出席名單；不同王需不同分配名單時，分開開團。
- 能力門檻由團長人工確認。列表顯示最近 100 團，舊資料仍在 D1。
- 登入有效期 8 小時，登出使該次登入失效。
- 所有已登入玩家均可看最近團隊及報名資料；沒有公會隔離。
- 同時修改同一團時，後寫入者可能收到重新整理提示；不會覆寫前者。

## 開發與命令列部署（選用）

```sh
npm ci
npm test
npm run test:ui
```

測試使用 Miniflare 的本機 Workers/D1，OAuth 與 Webhook 使用 mock，不需要真實密鑰，也不會發送真實 Discord 訊息。
UI 測試使用 jsdom 驗證互動流程，不是瀏覽器視覺測試。

命令列部署前，在 `wrangler.jsonc` 將 database_id 的占位字串換成 Cloudflare 的 maple-db UUID，並在 vars 加入公開的 DISCORD_CLIENT_ID。
`wrangler.jsonc` 不放 Secret；原本 Dashboard 設定的變數需同步到 vars，以免 CLI 部署覆寫。

```sh
npx wrangler login
npx wrangler d1 execute maple-db --remote --file=schema.sql
npx wrangler secret put DISCORD_CLIENT_SECRET
npm run deploy
```

前端與後端分開部署：GitHub Actions 只發布 web，後端更新需 Cloudflare Deploy。

官方文件：
- https://developers.cloudflare.com/d1/get-started/
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
