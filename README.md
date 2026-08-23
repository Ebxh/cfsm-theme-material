# CFSM Material

<p align="center">
  <strong>為 CF-Server-Monitor 打造的 Material Design 3 / Material You 主題</strong><br>
  高信息密度、動態配色、響應式佈局與可管理配置
</p>

<p align="center">
  <a href="https://github.com/Ebxh/cfsm-theme-material/releases/latest"><img alt="Latest Release" src="https://img.shields.io/github/v/release/Ebxh/cfsm-theme-material?display_name=tag&style=flat-square"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/github/license/Ebxh/cfsm-theme-material?style=flat-square"></a>
  <a href="https://vuejs.org/"><img alt="Vue 3" src="https://img.shields.io/badge/Vue-3-42b883?style=flat-square&logo=vuedotjs&logoColor=white"></a>
  <a href="https://m3.material.io/"><img alt="Material Design 3" src="https://img.shields.io/badge/Material-Design%203-6750a4?style=flat-square&logo=materialdesign&logoColor=white"></a>
</p>

> [!IMPORTANT]
> **CFSM Material 是基於 [Liebesfreud/Komari-Material](https://github.com/Liebesfreud/Komari-Material) 的移植版本，並非 CF-Server-Monitor 官方主題。**<br>
> 完整保留原版組件、樣式、字體與 Material Web 自定義元素，僅將數據層替換為 CFSM 公開 API，並參考 [Tokinx/cf-server-monitor-theme-emerald](https://github.com/Tokinx/cf-server-monitor-theme-emerald) 的移植方式。

## 項目關係

| 項目 | 與本主題的關係 |
| --- | --- |
| [CF-Server-Monitor](https://github.com/huilang-me/CF-Server-Monitor) | 本主題所服務的伺服器監控平台，提供後台、API 與主題運行環境 |
| [Liebesfreud/Komari-Material](https://github.com/Liebesfreud/Komari-Material) | 本主題直接移植的原主題與代碼基礎（Komari Monitor 的 MD3 主題） |
| [Tokinx/cf-server-monitor-theme-emerald](https://github.com/Tokinx/cf-server-monitor-theme-emerald) | 技術參考：Vue 3 + Vite 單頁應用，遵循 CFSM theme-develop.md 主題契約 |
| **CFSM Material** | 在 Komari Material 基礎上移植到 CF-Server-Monitor 並持續維護的版本 |

## 主要特性

- **Material Design 3 / Material You**：統一使用 MD3 色彩、排版、形狀、狀態層與交互動效。
- **動態配色**：手動種子色、18 款內置調色盤、壁紙取色三種模式，自動生成亮/暗兩套完整色階。
- **亮色 / 深色 / 跟隨系統**：頂欄一鍵切換，訪客選擇持久化到本地。
- **三種節點視圖**：卡片、列表、緊湊雙欄列表。
- **完整節點信息**：CPU、內存、磁盤、月流量、上下行速率、延遲/丟包摘要、價格/到期標籤、自定義 tags。
- **負載/延遲歷史圖表**：CPU/內存/磁盤曲線、電信/聯通/移動/BGP 延遲曲線（默認 10M 窗口）。
- **世界地圖**：按地區聚合的節點散點分佈圖（ECharts，多 CDN 回退加載 GeoJSON）。
- **卡片材質控制**：MD3 實色表面與半透明玻璃，可調整不透明度與亮色對比度。
- **WebSocket 實時更新**：斷線指數退避重連、心跳保活、頁面隱藏自動掛起。
- **可管理主題配置**：通過後台「主題自定義配置 JSON」集中管理選項。
- **內容擴展**：首頁公告（支持簡易 Markdown）、ICP/公安備案、自定義圖片/視頻背景（含模糊與遮罩）。
- **移動端適配**：響應式佈局，卡片/列表自動重排。

## 安裝

### 方式一：GitHub tree 地址（推薦）

1. 在 GitHub 上新建空倉庫（如 `cfsm-theme-material`），不要勾選 README/.gitignore。
2. 推送本工程（`main` 分支）。
3. 推送構建產物分支 `build`（含 `index.html` + `assets/`）。
   - 可由 `.github/workflows/deploy-build-branch.yml` 自動完成，或手動執行 `npm run build` 後將 `dist/` 推至 `build` 分支。
4. 登錄 CF-Server-Monitor 管理後台 → **外觀/主題設置**。
5. 填入 **build 分支** 的 GitHub tree 地址：
   ```
   https://github.com/<你的用戶名>/cfsm-theme-material/tree/build
   ```
6. 將下方「主題自定義配置 JSON」粘貼到對應文本框（可按需增刪）並保存。
7. 保存後刷新前台。

> 後台會反向代理 `build` 分支的 `index.html` 與 `assets/` 兩個路徑。由於 Worker 主題快取 TTL 約為 1 小時，更新後如需立即生效，請到 Cloudflare Dashboard → Caching → Purge Everything。

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

### 環境要求

- Node.js `^20.19.0 || >=22.12.0`
- npm / pnpm

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

## 運行時約定

- 路由：`/#/`、`/#/server/:id`
- 後台管理入口：`${origin}#/admin`
- 後端地址為當前頁面 origin（同源部署）
- 匿名用戶最多可查詢近 24 小時歷史數據；登錄且開啟長歷史時最多可查詢近 7 天

## 項目結構

```text
src/                  Vue 應用源碼
src/components/       節點卡片、列表、圖表、外觀面板、世界地圖等
src/composables/      WebSocket 實時管理
src/stores/           Pinia：主題配置（app）、節點狀態（nodes）、延遲（nodePing）
src/styles/           MD3 全局樣式
src/utils/            API 適配、MD3 配色引擎、格式化、地區/OS 工具
src/views/            HomeView（首頁）、InstanceDetail（詳情頁）
public/               運行時旗幟和系統 Logo
docs/preview.png      README 封面與主題預覽圖
```

## 致謝

特別感謝：

- **[Liebesfreud/Komari-Material](https://github.com/Liebesfreud/Komari-Material)** — 本主題的直接上游，提供了 Material Design 3 風格的組件與樣式基礎。
- **[Tokinx/cf-server-monitor-theme-emerald](https://github.com/Tokinx/cf-server-monitor-theme-emerald)** — 提供了 CF-Server-Monitor 主題移植的技術參考與最佳實踐。
- **[huilang-me/CF-Server-Monitor](https://github.com/huilang-me/CF-Server-Monitor)** — 提供優秀的伺服器監控平台與主題運行環境。

同時感謝以下開源項目：

- [Vue](https://vuejs.org/)
- [Vite](https://vite.dev/)
- [Material Web](https://material-web.dev/)
- [Material Color Utilities](https://github.com/material-foundation/material-color-utilities)
- [UnoCSS](https://unocss.dev/)
- [Apache ECharts](https://echarts.apache.org/)

## 許可證

本項目基於 [MIT License](LICENSE) 開源。

直接上游 Komari Material 與 Komari Naive 使用 MIT License，本倉庫繼續保留其原始版權聲明，並增加 `Copyright (c) 2026 Ebxh` 作為移植與後續維護的署名。

使用、修改或分發本項目時，請同時保留原始版權聲明、二次開發署名與許可證文本。
