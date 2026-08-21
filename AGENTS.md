# Repository Guide

This repository is a Vue 3 static theme for CF-Server-Monitor — a 1:1 port of
[Liebesfreud/Komari-Material](https://github.com/Liebesfreud/Komari-Material).

## Commands

```bash
npm install
npm run dev       # 開發模式（需要 .env 配置 API_BASE）
npm run build     # 類型檢查 + 生產構建（產物在 dist/）
npm run preview   # 預覽生產構建
npm run mock      # 無後端時用 mock 數據預覽（scripts/mock-server.mjs）
```

Use npm for dependency management. Validation is `vue-tsc --noEmit` plus the
production build; there is no unit test suite yet.

## Architecture

- `src/utils/rpc.ts` is the CF-Server-Monitor adaptation of the original
  Komari RPC surface — it keeps the exact KomariRpc/RpcClient API signatures
  but maps every method to CFSM REST endpoints (`/api/config`, `/api/servers`,
  `/api/server?id=`, `/api/history/all`) and `/api/ws?subscribe=all`.
- `src/utils/api.ts` is the CFSM adaptation of the original KomariApi class
  (getPublicSettings / getMe / getLoadRecords / getPingRecords / ...).
- `src/utils/cfsmTheme.ts` converts CFSM `theme_options.configuration[]`
  (read-only admin JSON) into the flat `theme_settings` object the store expects.
- `src/utils/init.ts` owns startup order, polling, WebSocket state, and reconnects.
- `src/stores/` remains the UI source of truth (app / nodes / dashboard / nodePing).
- `src/components/` is the original Komari-Material component set, unmodified
  except for asset paths (`/flags/`, `/os-icons/`) and login redirect.
- Routing must remain hash-based for static hosting: `/#/` and `/#/server/:id`.
- The theme build output is only `dist/index.html` + `dist/assets/`; CFSM
  proxies those two paths from this repository.

## Constraints

- Do not remove the Material Design 3 design system: `@material/web`
  custom elements, Material Symbols Rounded font, Roboto Variable /
  Noto Sans SC Variable fonts, UnoCSS and the MD3 design tokens are all
  required for the visual identity.
- Keep the adaptation layer isolated in `src/utils/{rpc,api,cfsmTheme}.ts` —
  do not reintroduce platform calls (Komari RPC2, `/api/oauth`, theme write-back)
  inside components or stores.
- Login always redirects to `${origin}/admin`; CFSM themes must not implement
  their own login page.
