# CF-Server-Monitor Theme Material

為 [CF-Server-Monitor](https://github.com/huilang-me/CF-Server-Monitor) 打造的 **Material Design 3 / Material You** 主題。

本主題是 [Liebesfreud/Komari-Material](https://github.com/Liebesfreud/Komari-Material) 的 **1:1 移植版**：
完整保留原版組件、樣式、字體與 Material Web 自定義元素，僅將數據層替換為 CFSM 公開 API。
以 [Tokinx/cf-server-monitor-theme-emerald](https://github.com/Tokinx/cf-server-monitor-theme-emerald) 的移植方式為技術參考
（Vue 3 + Vite 單頁應用，遵循 [theme-develop.md](https://github.com/huilang-me/CF-Server-Monitor/blob/main/theme-develop.md) 主題契約）。

## 上傳到 GitHub

本倉庫已按 `cf-server-monitor-theme-emerald` 的結構整理（`.github/workflows`、`docs/preview.png`、`AGENTS.md` 等）。

### 一、創建倉庫並推送

```bash
# 1. 在 GitHub 上新建空倉庫（如 cfsm-theme-material），不要勾選 README/.gitignore

# 2. 推送本工程（已在本地初始化 git）
git remote add origin https://github.com/<你的用户名>/cfsm-theme-material.git
git branch -M main
git push -u origin main
```

### 二、生成構建產物分支（build）

推送後 GitHub Actions 會自動執行：
- **Build**：每次 push/PR 跑 `npm ci && npm run build`，驗證構建
- **Deploy Build Branch**：把 `dist/` 部署到 `build` 分支（含 `index.html` + `assets/`）

也可以在 Actions 頁面手動觸發 **Deploy Build Branch**。

### 三、在 CFSM 後台啟用主題

1. 登錄 CF-Server-Monitor 管理後台 → 外觀/主題設置
2. 填入 **build 分支** 的 GitHub tree 地址：`https://github.com/<你的用户名>/cfsm-theme-material/tree/build`
3. 將下方「主題自定義配置 JSON」粘貼到對應文本框（可按需增刪）並保存
4. 刷新前台

> 後台會反向代理 `build` 分支的 `index.html` 與 `assets/` 兩個路徑。

## 功能特性

- **Material Design 3 / Material You 動態配色**：手動種子色、18 款內置調色盤、壁紙取色三種模式，自動生成亮/暗兩套完整色階
- **亮色 / 深色 / 跟隨系統**：頂欄一鍵切換，訪客選擇持久化到本地
- **三種節點視圖**：卡片、列表、緊湊雙欄列表
- **完整節點信息**：CPU、內存、磁盤、流量、上下行速率、延遲/丟包摘要、價格/到期標籤、自定義 tags
- **世界地圖**：按地區聚合的節點散點分佈圖（ECharts，多 CDN 回退加載 GeoJSON）
- **負載/延遲歷史圖表**：24h CPU/內存/磁盤曲線、1h 電信/聯通/移動/BGP 延遲曲線
- **外觀面板**：主題模式、視圖、配色來源、密度、卡片材質（實色/半透明玻璃）、不透明度、頁寬，即時生效
- **WebSocket 實時更新**：斷線指數退避重連、心跳保活、頁面隱藏自動掛起、多後端聚合
- **擴展配置**：首頁公告（支持簡易 Markdown）、ICP/公安備案、自定義圖片/視頻背景（含模糊與遮罩）
- **移動端適配**：響應式佈局，卡片/列表自動重排

## 安裝

### 方式一：主題倉庫安裝（推薦）

1. 將本倉庫部署為 GitHub 倉庫（包含構建產物 `index.html` 與 `assets/`）
2. 登錄 CF-Server-Monitor 管理後台 → 外觀/主題設置
3. 填入本倉庫的 GitHub tree 地址（如 `https://github.com/<user>/cfsm-theme-material/tree/main`）
4. 保存後刷新前台

### 方式二：同源部署

將 `dist/` 目錄上傳到你的 Web 伺服器（如 Nginx），並將 `/api`、`/flags`、`/os-icons`、`/api/ws` 反向代理到 CF-Server-Monitor Worker：

```nginx
location / {
    root /var/www/cfsm-theme-material;
    try_files $uri $uri/ /index.html;
}

location /api {
    proxy_pass https://your-worker.example.com;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}

location ~ ^/(flags|os-icons) {
    proxy_pass https://your-worker.example.com;
}
```

> **CSP 白名單**：如主題使用外部字體/圖片/世界地圖 CDN，請在後台「外觀設置 → CSP 白名單」中添加對應域名（如 `cdn.jsdelivr.net`、`fastly.jsdelivr.net`）。

## 主題配置

將以下 JSON 填入 **CF-Server-Monitor 後台 → 外觀設置 → 主題自定義配置 JSON** 並保存（可自行增刪條目）：

```json
{
  "configuration": [
    { "key": "defaultThemeMode", "value": "auto", "options": "auto,light,dark", "description": "訪客默認主題模式：auto 跟隨系統、light 淺色、dark 深色" },
    { "key": "defaultViewMode", "value": "card", "options": "card,list,compact-list", "description": "默認節點視圖：card 卡片、list 列表、compact-list 緊湊列表" },
    { "key": "dataUpdateInterval", "value": "1", "options": "", "description": "數據刷新間隔（秒），1-60，建議 1-10" },
    { "key": "showLoginButton", "value": "true", "options": "", "description": "頂欄顯示管理後台入口" },
    { "key": "showPingChartButton", "value": "true", "options": "", "description": "顯示延遲歷史入口" },
    { "key": "showNodePingStats", "value": "true", "options": "", "description": "卡片顯示延遲/丟包摘要" },
    { "key": "hideSingleGroupTab", "value": "true", "options": "", "description": "單分組時隱藏分組 Tab" },
    { "key": "hiddenGroupsFromAll", "value": "", "options": "", "description": "從「全部」中隱藏的分組，多個用逗號分隔" },
    { "key": "cardSurfaceStyle", "value": "solid", "options": "solid,translucent", "description": "卡片材質：solid 實色、translucent 半透明玻璃（配合背景使用）" },
    { "key": "cardOpacity", "value": "80", "options": "", "description": "半透明卡片不透明度（%），50-95" },
    { "key": "lightCardContrast", "value": "false", "options": "", "description": "亮色模式增強卡片對比度" },
    { "key": "cardProgressLayout", "value": "2col", "options": "1col,2col", "description": "卡片進度條佈局：1col 單列、2col 雙列" },
    { "key": "uptimeTagWrap", "value": "false", "options": "", "description": "運行時間用標籤包裹顯示" },
    { "key": "trafficSplitColor", "value": "true", "options": "", "description": "區分上下行流量顏色" },
    { "key": "listStatusStyle", "value": "tag", "options": "tag,badge", "description": "列表狀態樣式：tag 標籤、badge 徽章" },
    { "key": "fullWidth", "value": "false", "options": "", "description": "內容占滿可用寬度" },
    { "key": "maxPageWidth", "value": "1800px", "options": "", "description": "內容最大寬度（CSS 寬度值）" },
    { "key": "materialDensity", "value": "compact", "options": "compact,comfortable", "description": "界面信息密度" },
    { "key": "monetColorMode", "value": "seed", "options": "seed,palette,wallpaper", "description": "配色來源：seed 種子色、palette 調色盤、wallpaper 壁紙取色" },
    { "key": "monetPalette", "value": "material-teal", "options": "coral-red,sunset-orange,amber-gold,olive-green,lime-green,forest-green,material-teal,sky-blue,ocean-blue,indigo-blue,material-purple,violet-purple,magenta-pink,rose-pink,plum-purple,earth-brown,slate-gray,graphite-gray", "description": "內置調色盤（palette 模式使用，wallpaper 失敗時回退）" },
    { "key": "materialSeedColor", "value": "#006A60", "options": "", "description": "Material You 種子色（HEX）" },
    { "key": "fontFamily", "value": "\"Roboto Variable\", \"Noto Sans SC Variable\", sans-serif", "options": "", "description": "界面字體（CSS font-family）" },
    { "key": "numberFontFamily", "value": "\"Roboto Variable\", \"Noto Sans SC Variable\", sans-serif", "options": "", "description": "數字字體" },
    { "key": "uptimeFormat", "value": "day", "options": "day,hour,minute,second", "description": "運行時間精度" },
    { "key": "byteDecimalsB", "value": "0", "options": "", "description": "B 單位小數位數，-1 跳過" },
    { "key": "byteDecimalsKB", "value": "0", "options": "", "description": "KB 單位小數位數，-1 跳過" },
    { "key": "byteDecimalsMB", "value": "1", "options": "", "description": "MB 單位小數位數，-1 跳過" },
    { "key": "byteDecimalsGB", "value": "1", "options": "", "description": "GB 單位小數位數，-1 跳過" },
    { "key": "byteDecimalsTB", "value": "2", "options": "", "description": "TB 及以上小數位數，-1 跳過" },
    { "key": "alertEnabled", "value": "false", "options": "", "description": "首頁顯示公告" },
    { "key": "alertType", "value": "info", "options": "default,info,success,warning,error", "description": "公告樣式" },
    { "key": "alertTitle", "value": "", "options": "", "description": "公告標題" },
    { "key": "alertContent", "value": "", "options": "", "description": "公告內容（支持簡易 Markdown：**粗體**、`代碼`、[鏈接](url)）" },
    { "key": "icpEnabled", "value": "false", "options": "", "description": "頁腳顯示 ICP 備案" },
    { "key": "icpNumber", "value": "", "options": "", "description": "ICP 備案號" },
    { "key": "icpUrl", "value": "https://beian.miit.gov.cn/", "options": "", "description": "ICP 備案跳轉鏈接" },
    { "key": "policeEnabled", "value": "false", "options": "", "description": "頁腳顯示公安備案" },
    { "key": "policeNumber", "value": "", "options": "", "description": "公安備案號" },
    { "key": "policeUrl", "value": "", "options": "", "description": "公安備案跳轉鏈接" },
    { "key": "backgroundEnabled", "value": "false", "options": "", "description": "啟用自定義背景" },
    { "key": "backgroundType", "value": "image", "options": "image,video", "description": "背景媒體類型" },
    { "key": "lightBackgroundUrl", "value": "", "options": "", "description": "亮色模式背景圖片/視頻 URL" },
    { "key": "darkBackgroundUrl", "value": "", "options": "", "description": "暗色模式背景圖片/視頻 URL" },
    { "key": "backgroundBlur", "value": "0", "options": "", "description": "背景模糊半徑（px），0-100" },
    { "key": "backgroundOverlay", "value": "0", "options": "", "description": "背景遮罩強度（%），0-100" }
  ]
}
```

訪客還可通過右上角「外觀設置」面板在本地切換主題模式、視圖、配色、密度與卡片材質；本地覆蓋僅影響當前瀏覽器。

## 本地開發

```bash
npm install
cp .env.example .env   # 填入 API_BASE，如 https://monitor.example.com
npm run dev            # http://localhost:5173
```

開發模式將同源 `/api` 請求代理到單個 `API_BASE`，避免本地 CORS 限制。

### 無後端預覽（Mock）

不連接真實後端也可預覽主題效果：

```bash
npm run build
node scripts/mock-server.mjs 8080
# 打開 http://localhost:8080
```

Mock 伺服器提供模擬節點/歷史數據與世界地圖（GeoJSON 需外網訪問 jsdelivr CDN）。

## 構建

```bash
npm run build
```

產物位於 `dist/`：僅包含 `index.html` 與 `assets/`，符合 CFSM 主題目錄約定。

## 項目結構

```
src/
├── components/      節點卡片/列表、圖表、外觀面板、世界地圖等
├── composables/     WebSocket 實時管理
├── stores/          Pinia：主題配置（app）、節點狀態（nodes）
├── styles/          MD3 全局樣式
├── utils/           API 適配、MD3 配色引擎、格式化、地區/OS 工具
└── views/           HomeView（首頁）、InstanceDetail（詳情頁）
```

## 許可證

[MIT](LICENSE)

- MD3 動態配色引擎移植自 [Liebesfreud/Komari-Material](https://github.com/Liebesfreud/Komari-Material)（Copyright © 2026 Liebesfreud），其上游 Komari Naive 保留 Copyright © 2025 Tony Liu
- API 適配與數據模型參考 [Tokinx/cf-server-monitor-theme-emerald](https://github.com/Tokinx/cf-server-monitor-theme-emerald)（MIT）
- 服務的監控平台：[huilang-me/CF-Server-Monitor](https://github.com/huilang-me/CF-Server-Monitor)（MIT）
