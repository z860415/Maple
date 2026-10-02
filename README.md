# 瑪卡巴卡打王集合所 · Cloudflare 版

Discord 帳號登入、角色資料、自由開團、正選與備選、出席、分寶及領取紀錄。
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
- 報名後一律先列為備選；團長可勾選多人並批次儲存正選名單。團長固定正選，正選總數不能超過人數上限，退出或增加名額皆不自動遞補。
- 團長可從報名名單轉移管理權限給其他成員。招募中轉給備選時，原團長與新團長對調正選資格；開打後只能轉給正選，出席與結算紀錄不變。已取消的團不能轉移。
- 招募中點「新增分隊」，在彈窗勾選備選成員後進入新分隊資訊；開團彈窗帶入原團資訊，新團長須從勾選成員中指派。建立與移動一次完成，保留角色快照、時段、備註與報名時間；移動成員在新團皆為正選，原團移除這些報名。原團長不會自動加入新分隊，通知排程與結算不複製。
- 分寶人員預設為目前團長，團長可指派已報名成員。團長及分寶人員可管理結算、領取狀態及分寶通知；分寶人員不能管理出席、集合通知或指派其他分寶人員。受指派者退出或移到分隊時，原團恢復由團長負責。預設負責人會隨團長轉移，明確指派的人員則保持不變。
- 團長開始打王 → 勾選出席（勾選或取消勾選即自動儲存）→ 完成打王 → 分寶結算。
- 標記有人領取後禁止清除結算，需先取消已領標記。

## Discord 招募公告（選用）

### Bot 集合與分寶通知

Cloudflare Secret 設定 `DISCORD_BOT_TOKEN`，公開變數設定 `DISCORD_NOTIFICATION_CHANNEL_ID`。Bot 在指定文字頻道需要查看頻道、傳送訊息、嵌入連結權限。

現有 D1 先執行 `migrations/002_notifications.sql`，再部署最新 `worker.js` 與前端。若使用 Dashboard 部署，另至 Worker → Settings → Triggers / Cron Triggers 新增 `* * * * *`（每分鐘）。命令列部署使用 `wrangler.jsonc` 內的 triggers。排程通常在設定時間後一分鐘內觸發，不保證秒級準時。

- 團長點「集合通知」或「分寶通知」先編輯預設文案與預覽，再發送；可插入團名、剩餘時間、時間、地點、打王項目、分寶金額與團隊連結。
- 集合通知標記目前正選隊友；分寶通知標記結算名單中尚未領取者。兩者都排除團長本人與備選，僅允許這些帳號被標記。沒有標記對象時仍可發送文案。
- 招募中可設定集合前 1–10080 分鐘自動通知，一團保留一筆待發自動提醒；重新設定會取代舊提醒。修改集合時間後提醒會跟著調整，團隊開始、取消、完成或錯過集合時間後取消待發提醒。
- 手動通知一團每分鐘最多一筆，避免連點洗版。通知紀錄可查看狀態並取消待發提醒。
- Discord 限流時排程會延後重試；網路逾時或伺服器錯誤導致結果不明時不自動重發，先查看頻道避免重複通知。
- 本機前端也可操作通知，訊息由線上 Worker 發送。測試使用模擬 Bot 回應，不會發送真實 Discord 訊息。

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
- 一個帳號可儲存多個角色，開團與報名時選擇角色；同一團每個帳號只佔一個名額。每次報名保留當時角色資料，後續修改角色不會改寫舊紀錄。
- 「參團紀錄」顯示個人所有團隊的角色、出席及分寶領取狀態，不受最近 100 團限制。
- 任一團隊皆可「複製並開團」，帶入名稱、項目、地點、要求及備註，再編輯後建立自己的新團；集合時間預設為一小時後。
- 一團共用出席名單；不同王需不同分配名單時，分開開團。
- 能力門檻由團長人工確認。列表顯示最近 100 團，舊資料仍在 D1。
- 登入保存在前端網站的持久 Cookie，關閉分頁或瀏覽器仍保留；手動登出會刪除 Cookie 並撤銷該次登入。清除該網站 Cookie 後需重新登入。後端不再設定 8 小時期限；瀏覽器自身的 Cookie 保存政策仍適用。
- 所有已登入玩家均可看最近團隊及報名資料；沒有公會隔離。
- 同時修改同一團時，後寫入者可能收到重新整理提示；不會覆寫前者。

## 開發與命令列部署（選用）

### 本機前端使用線上資料庫

先將最新的 `worker.js` 部署到 Cloudflare（保留原本的 Discord 密鑰、D1 綁定與正式網址設定）。此版本允許 localhost 與 127.0.0.1 的 8000、8080 埠跨來源請求，登入後會返回發起登入的前端。Discord OAuth Redirect 維持線上 Worker 的 callback，不需新增本機 callback。

`web/config.js` 保持線上 API 網址。日常測試只需啟動前端：

```sh
python3 -m http.server 8080 --directory web
```

開啟 http://localhost:8080/ 。資料經線上 Worker 寫入正式 D1，不需要 Wrangler 登入、本機資料庫或本機 Discord Secret。

現有 D1 升級此版本時，先執行以下 SQL 新增角色表，再更新 Worker 與前端。既有角色會在登入讀取資料時自動保留為第一個角色：

```sql
CREATE TABLE IF NOT EXISTS characters(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),profile TEXT NOT NULL,created INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS characters_user ON characters(user_id);
```

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
