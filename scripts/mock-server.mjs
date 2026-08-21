/**
 * 本地預覽用 Mock 伺服器
 *
 * 啟動方式：node scripts/mock-server.mjs [port]
 * 功能：
 *  - 伺服 dist/ 靜態文件
 *  - 模擬 /api/config /api/servers /api/server /api/history/all
 *  - 用於在不連接真實 CF-Server-Monitor 後端時預覽主題效果
 */

import http from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('../dist', import.meta.url))
const PORT = Number(process.argv[2] || 8080)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

/* ---------- 模擬數據 ---------- */

const REGIONS = ['HK', 'US', 'JP', 'SG', 'DE', 'FR', 'GB', 'NL', 'KR', 'TW', 'CA', 'AU', 'BR', 'IN', 'RU', 'PL', 'FI', 'SE', 'CH', 'IT']
const OS_LIST = ['Ubuntu 22.04', 'Debian 12', 'CentOS 7', 'AlmaLinux 9', 'Fedora 40', 'Arch Linux', 'openSUSE Leap', 'FreeBSD 14', 'Alpine 3.19']
const NAMES = [
  'HK-Core-01', 'HK-Edge-02', 'US-West-01', 'US-East-02', 'JP-Tokyo-01', 'SG-Sin-01',
  'DE-Fra-01', 'FR-Par-02', 'GB-Lon-01', 'NL-Ams-01', 'KR-Seoul-01', 'TW-Tpe-01',
  'CA-Tor-01', 'AU-Syd-01', 'BR-Sao-01', 'IN-Mum-01', 'RU-Mos-01', 'PL-Waw-01',
  'FI-Hel-01', 'SE-Sto-01', 'CH-Zrh-01', 'IT-Mil-01',
]
const GROUPS = ['核心', '邊緣', '海外', '備份']

function rand(min, max) {
  return Math.random() * (max - min) + min
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1))
}

function makeServers() {
  const now = Date.now()
  return NAMES.map((name, index) => {
    const online = index % 5 !== 4 // 約 80% 在線
    const region = REGIONS[index % REGIONS.length]
    const cpuCores = [2, 4, 8, 16, 32][index % 5]
    const ramTotal = cpuCores * 1024
    const diskTotal = cpuCores * 40960
    const price = index % 6 === 0 ? 0 : randInt(3, 60)
    const expireDays = [1, 5, 15, 60, 365, 730][index % 6]
    const expire = new Date(now + expireDays * 86400000).toISOString().slice(0, 10)

    const cpu = online ? rand(3, 85) : 0
    const ramUsed = online ? ramTotal * rand(0.15, 0.85) : 0
    const diskUsed = online ? diskTotal * rand(0.1, 0.75) : 0
    const updatedAt = online ? now - randInt(0, 120) * 1000 : now - randInt(6, 30) * 60000

    const pingProviders = { ct: rand(8, 60), cu: rand(10, 70), cm: rand(12, 80), bd: rand(15, 90) }

    return {
      id: `server-${index + 1}`,
      name,
      server_group: GROUPS[index % GROUPS.length],
      tags: index % 4 === 0 ? 'prod,重要' : index % 7 === 0 ? 'test' : '',
      price: price ? `${price}.00` : '0',
      billing_cycle: price ? ['month', 'quarter', 'year'][index % 3] : 'month',
      currency: '¥',
      expire_date: expire,
      traffic_limit: `${randInt(1, 20)}TB`,
      traffic_calc_type: index % 3 === 0 ? 'dl' : 'sum',
      sort_order: index,
      cpu,
      load_avg: online ? `${rand(0.1, 4.0).toFixed(2)} ${rand(0.1, 3.0).toFixed(2)} ${rand(0.1, 2.0).toFixed(2)}` : '0 0 0',
      net_in_speed: online ? rand(0, 80) * 1024 * 1024 : 0,
      net_out_speed: online ? rand(0, 60) * 1024 * 1024 : 0,
      net_rx: rand(0, 500) * 1024 ** 3,
      net_tx: rand(0, 300) * 1024 ** 3,
      net_rx_monthly: rand(1, 9) * 1024 ** 3,
      net_tx_monthly: rand(1, 6) * 1024 ** 3,
      processes: online ? randInt(50, 400) : 0,
      tcp_conn: online ? randInt(5, 120) : 0,
      udp_conn: online ? randInt(1, 30) : 0,
      ping_ct: online ? pingProviders.ct : null,
      ping_cu: online ? pingProviders.cu : null,
      ping_cm: online ? pingProviders.cm : null,
      ping_bd: online ? pingProviders.bd : null,
      loss_ct: online ? (Math.random() > 0.85 ? randInt(1, 20) : 0) : null,
      loss_cu: online ? (Math.random() > 0.85 ? randInt(1, 15) : 0) : null,
      loss_cm: online ? (Math.random() > 0.85 ? randInt(1, 12) : 0) : null,
      loss_bd: online ? (Math.random() > 0.85 ? randInt(1, 10) : 0) : null,
      ping: buildPingWindow(online),
      loss: buildLossWindow(online),
      ram_total: ramTotal,
      ram_used: ramUsed,
      swap_total: 2048,
      swap_used: online ? rand(0, 500) : 0,
      disk_total: diskTotal,
      disk_used: diskUsed,
      cpu_cores: cpuCores,
      cpu_info: ['Intel Xeon E5-2680 v4', 'AMD EPYC 7443P', 'Intel Xeon Gold 6338', 'Apple M2', 'Ampere Altra'][index % 5],
      gpu_info: index % 10 === 0 ? JSON.stringify([{ id: '0', name: 'NVIDIA RTX 4090', info: rand(0, 90).toFixed(1) }]) : null,
      arch: 'x86_64',
      os: OS_LIST[index % OS_LIST.length],
      region,
      ip_v4: '1',
      ip_v6: index % 3 === 0 ? '1' : '0',
      boot_time: String(now - randInt(1, 90) * 86400000),
      last_updated: updatedAt,
      timestamp: updatedAt,
      is_online: online,
    }
  })
}

function buildPingWindow(online) {
  const now = Date.now()
  const points = []
  for (let i = 29; i >= 0; i--) {
    const ts = now - i * 120000
    points.push({
      ts,
      ct: online ? Math.round(rand(8, 60)) : null,
      cu: online ? Math.round(rand(10, 70)) : null,
      cm: online ? Math.round(rand(12, 80)) : null,
      bd: online ? Math.round(rand(15, 90)) : null,
    })
  }
  return points
}

function buildLossWindow(online) {
  const now = Date.now()
  const points = []
  for (let i = 29; i >= 0; i--) {
    const ts = now - i * 120000
    points.push({
      ts,
      ct: online ? (Math.random() > 0.9 ? randInt(1, 15) : 0) : null,
      cu: online ? (Math.random() > 0.9 ? randInt(1, 10) : 0) : null,
      cm: online ? (Math.random() > 0.9 ? randInt(1, 8) : 0) : null,
      bd: online ? (Math.random() > 0.9 ? randInt(1, 6) : 0) : null,
    })
  }
  return points
}

// 預生成每個節點 7 天 / 5 分鐘間隔的歷史（覆蓋 9 個時間窗口 10M ~ 7D）
const HISTORY_DAYS = 7
const HISTORY_INTERVAL_MS = 5 * 60 * 1000
const historyCache = new Map()

function getServerHistory(server) {
  let cached = historyCache.get(server.id)
  if (cached)
    return cached

  const rows = []
  const now = Date.now()
  const total = Math.floor((HISTORY_DAYS * 86400 * 1000) / HISTORY_INTERVAL_MS)
  for (let i = total - 1; i >= 0; i--) {
    const ts = now - i * HISTORY_INTERVAL_MS
    rows.push({
      timestamp: ts,
      cpu: rand(2, 80),
      ram_used: server.ram_total * rand(0.15, 0.85),
      ram_total: server.ram_total,
      swap_used: rand(0, 400),
      swap_total: 2048,
      net_in_speed: rand(0, 60) * 1024 * 1024,
      net_out_speed: rand(0, 45) * 1024 * 1024,
      load_avg: `${rand(0.1, 3).toFixed(2)} ${rand(0.1, 2).toFixed(2)} ${rand(0.1, 1.5).toFixed(2)}`,
      disk_used: server.disk_used,
      disk_total: server.disk_total,
      processes: randInt(40, 350),
      tcp_conn: randInt(3, 100),
    })
  }
  historyCache.set(server.id, rows)
  return rows
}

function makeHistory(server, hours = 24) {
  const all = getServerHistory(server)
  const threshold = Date.now() - hours * 3600 * 1000
  return all.filter(row => row.timestamp >= threshold)
}

const CONFIG = {
  version: '2.8.4',
  is_public: true,
  authorization: false,
  turnstile_enabled: false,
  turnstile_site_key: '',
  site_title: 'Narwhal Cloud 狀態監控',
  theme_options: {
    configuration: [
      { key: 'defaultThemeMode', value: 'auto' },
      { key: 'defaultViewMode', value: 'card' },
      { key: 'materialSeedColor', value: '#006A60' },
      { key: 'monetColorMode', value: 'seed' },
      { key: 'materialDensity', value: 'compact' },
      { key: 'cardSurfaceStyle', value: 'solid' },
      { key: 'alertEnabled', value: 'true' },
      { key: 'alertTitle', value: '系統維護通知' },
      { key: 'alertContent', value: '**計劃維護**：本週日凌晨 02:00–04:00（HKT）升級監控面板，期間可能出現短暫中斷。' },
    ],
  },
  frontend_ws_timeout_minutes: 0,
  long_history_points: 120,
}

const SERVERS = makeServers()

/* ---------- HTTP 伺服器 ---------- */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const path = url.pathname

  // API 路由
  if (path === '/api/config') {
    return json(res, CONFIG)
  }
  if (path === '/api/servers') {
    const online = SERVERS.filter(s => s.is_online).length
    return json(res, {
      servers: SERVERS,
      stats: { total: SERVERS.length, online, offline: SERVERS.length - online },
      sysConfig: { show_price: true, show_expire: true, show_tf: true },
    })
  }
  if (path === '/api/server') {
    const id = url.searchParams.get('id')
    const serverData = SERVERS.find(s => s.id === id)
    if (!serverData)
      return json(res, { error: 'Server not found' }, 404)
    return json(res, serverData)
  }
  if (path === '/api/history/all') {
    const id = url.searchParams.get('id')
    const hours = Number(url.searchParams.get('hours') ?? 24)
    const serverData = SERVERS.find(s => s.id === id)
    if (!serverData)
      return json(res, { error: 'Server not found' }, 404)
    return json(res, makeHistory(serverData, hours))
  }

  // 靜態文件
  let filePath = normalize(join(ROOT, path === '/' ? 'index.html' : path))
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403)
    return res.end('Forbidden')
  }

  if (existsSync(filePath) && statSync(filePath).isDirectory())
    filePath = join(filePath, 'index.html')

  if (!existsSync(filePath)) {
    // SPA hash 路由：回退到 index.html
    filePath = join(ROOT, 'index.html')
  }

  const ext = extname(filePath)
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
  })

  // 對 index.html 注入 localStorage 預設（用於頭部無頭截圖 / 快速預覽）
  if (ext === '.html') {
    const raw = createReadStream(filePath)
    const chunks = []
    raw.on('data', (chunk) => chunks.push(chunk))
    raw.on('end', () => {
      const html = Buffer.concat(chunks).toString('utf-8')
      const modeValue = (CONFIG.theme_options.configuration.find(c => c.key === 'defaultThemeMode')?.value) || 'auto'
      const inject = `<script>try{localStorage.setItem('md-theme-mode', ${JSON.stringify(modeValue)})}catch(_){}</script>`
      const out = html.replace('</head>', `${inject}</head>`)
      res.end(out)
    })
    return
  }
  createReadStream(filePath).pipe(res)
})

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(data))
}

server.listen(PORT, () => {
  console.log(`\n  CFSM Material 主題預覽伺服器已啟動:`)
  console.log(`  http://localhost:${PORT}\n`)
  console.log(`  模擬節點數: ${SERVERS.length}（在線 ${SERVERS.filter(s => s.is_online).length}）`)
  console.log(`  提示: 世界地圖 GeoJSON 需外網訪問 jsdelivr CDN\n`)
})
