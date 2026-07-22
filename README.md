# 浪乘 Surfpool

台灣衝浪共乘媒合 demo —— 幫衝浪客解決「有板沒車、有車沒伴」的問題。

🔗 **線上體驗:** [surfpool-demo.vercel.app](https://surfpool-demo.vercel.app)（Google 登入）

---

## 專案描述

台灣衝浪熱點大多離市區有段距離,自己開車不划算、搭車不方便,衝浪客之間長期靠 FB 社團 po文湊團。「浪乘」把這個流程做成一個雙向媒合平台:司機可以開團徵乘客,乘客也可以主動貼出需求等司機接單,雙方都能看評價、板具需求、集合地點再決定要不要配對。

這是一個練習/展示用的完整專案,目標是走完一個真實產品從「前端原型」到「有真實登入與資料庫的可上線服務」的完整路徑。

## 功能介紹

- **雙模式媒合**:司機開團徵乘客 / 乘客發布需求等司機接單
- **開團流程**:4 步驟表單(路線、時間、板具需求、規則),可編輯、可取消、可標記完成
- **申請與審核**:乘客申請加入行程,司機接受 / 拒絕,雙方即時收到通知
- **收藏行程**:乘客可以收藏感興趣的團,之後在個人頁快速回顧
- **評價系統**:行程完成後可以互相留下星等與評語,累積在個人檔案上
- **即時通知**:未讀數提示、點擊已讀,關鍵動作(有人申請、被接受/拒絕)即時推播
- **Google 帳號登入**:免註冊,一鍵用 Google 帳號開始使用

## 技術棧

- **前端**:Next.js 16(App Router)、React 19、TypeScript、Tailwind CSS 4
- **後端**:Supabase(Postgres + Auth + Row Level Security),無自建 server
- **部署**:Vercel + GitHub 自動部署

## 開發故事

前端原型完成後,最花時間的其實是接上真實登入與資料庫的那段路——一個看似單純的「Google 登入失敗」,一路查出六層疊在一起的問題:環境變數裡一個多餘的路徑、一個指到不存在資料表的資料庫 trigger、一條漏掉的 RLS 政策、部署網域沒同步、還有一個藏在表單預設值裡寫死的過期日期。每一層都用瀏覽器 DevTools 或 Postgres Logs 抓到第一手證據才動手修,而不是看到錯誤訊息就照字面意思猜。

完整的除錯過程、每一層的判斷依據,整理成了案例筆記:[登入除錯案例整理](https://claude.ai/code/artifact/f01caa25-a381-437d-bab0-1e36087bf27e)。

## 我如何跟 AI 協作

這個專案的除錯與部署過程,我用 Claude Code 當搭檔一起做,但分工很明確:排查方向、下判斷、動手查資料庫跟跑指令的都是我自己——例如去 Supabase Dashboard 查 `pg_trigger`、翻 Postgres Logs 找原始錯誤、在瀏覽器 DevTools 裡對照 Request/Response 驗證是 RLS 問題還是身份問題,以及最後決定「拿掉壞掉的 trigger 而不是修它」這類設計取捨,都是我自己確認過根因之後做的決定。AI 的角色是幫我更快讀懂錯誤訊息背後代表什麼、提出可能的排查方向,並在我確認方向後動手改程式碼或給出對應的 SQL。整個過程比較像找了一個經驗豐富的 pair,而不是把問題丟出去等答案。

## 開始使用

```bash
npm install
npm run dev
```

打開 [http://localhost:3000](http://localhost:3000) 即可看到畫面。

需要自己的 Supabase 專案才能跑完整流程(登入、開團、申請等),在根目錄建立 `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>
```

資料庫 schema 見 `schema.sql`,到 Supabase SQL Editor 執行一次即可建立所需的資料表與 RLS 政策。
