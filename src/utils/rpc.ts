/**
 * CF-Server-Monitor RPC 適配層
 *
 * 保持原版 Komari-Material `utils/rpc.ts` 的完整接口簽名
 * （KomariRpc / RpcClient / 類型定義），底層替換為 CFSM 公開 API：
 *  - ping            → GET /api/config
 *  - getNodes        → GET /api/servers（adaptServer 的 client 部分）
 *  - getNodesLatestStatus → GET /api/servers（status 部分）
 *  - getNodeRecentStatus  → GET /api/server?id=
 *  - getLoadRecords  → GET /api/history/all?id=&hours=
 *  - getPingRecords  → 首頁使用 /api/servers 內嵌 ping/loss；詳情頁使用 /api/history/all
 *  - WebSocket       → /api/ws?subscribe=all 或 /api/ws?subscribe=<id>
 *
 * 原始版權：Komari-Material Copyright (c) 2026 Liebesfreud（MIT）
 */
import { fetchCfsmConfig, getSharedApi } from '@/utils/api'

// ==================== 类型定义（与原版一致） ====================

/** 节点客户端信息 */
export interface Client {
  uuid: string
  token?: string
  name: string
  cpu_name: string
  virtualization: string
  arch: string
  cpu_cores: number
  os: string
  kernel_version: string
  gpu_name?: string
  ipv4?: string
  ipv6?: string
  region: string
  remark?: string
  public_remark: string
  mem_total: number
  swap_total: number
  disk_total: number
  version?: string
  weight: number
  price: number
  billing_cycle: number
  auto_renewal: boolean
  currency: string
  expired_at: string
  group: string
  tags: string
  hidden: boolean
  traffic_limit: number
  traffic_limit_type: string
  created_at: string
  updated_at: string
  boot_time: string
}

/** 公开站点信息 */
export interface PublicInfo {
  allow_cors: boolean
  custom_body: string
  custom_head: string
  description: string
  disable_password_login: boolean
  oauth_enable: boolean
  oauth_provider: string
  ping_record_preserve_time: number
  private_site: boolean
  record_enabled: boolean
  record_preserve_time: number
  sitename: string
  theme: string
  theme_settings: Record<string, unknown>
}

/** 版本信息 */
export interface VersionInfo {
  version: string
  hash: string
}

/** 节点状态 */
export interface NodeStatus {
  client: string
  time: string
  cpu: number
  gpu: number
  ram: number
  ram_total: number
  swap: number
  swap_total: number
  load: number
  load5: number
  load15: number
  temp: number
  disk: number
  disk_total: number
  net_in: number
  net_out: number
  net_total_up: number
  net_total_down: number
  process: number
  connections: number
  connections_udp: number
  online: boolean
  uptime: number
}

/** 状态记录 */
export interface StatusRecord {
  client: string
  time: string
  cpu: number
  gpu: number
  ram: number
  ram_total: number
  swap: number
  swap_total: number
  load: number
  load5: number
  load15: number
  temp: number
  disk: number
  disk_total: number
  net_in: number
  net_out: number
  net_total_up: number
  net_total_down: number
  process: number
  connections: number
  connections_udp: number
}

/** Ping 记录 */
export interface PingRecord {
  client: string
  task_id: number
  time: string
  value: number
}

/** RPC 方法元数据（適配層保留類型，返回空數組） */
export interface MethodMeta {
  name: string
  summary: string
  description: string
  params: ParamMeta[]
  returns: string
}

/** 参数元数据 */
export interface ParamMeta {
  name: string
  type: string
  description: string
}

/** 指标标签 */
export type MetricTags = Record<string, string>

/** 指标采样点 */
export interface MetricPoint {
  time: string
  value: number | null
  count?: number
  labels?: Record<string, string>
  tags?: MetricTags
}

/** 指标序列 */
export interface MetricSeries {
  metric_key: string
  entity_id: string
  type?: string
  unit?: string
  retention_days?: number
  downsampled?: boolean
  downsample_algorithm?: string
  max_points?: number
  interval_seconds?: number
  count: number
  points: MetricPoint[]
  tags?: MetricTags
}

/** 指标查询响应 */
export interface QueryMetricsResponse {
  start: string
  end: string
  series: MetricSeries[]
  count: number
}

/** 公开 Ping 任务 */
export interface PublicPingTask {
  id: number
  weight?: number
  name: string
  type?: string
  interval?: number
  clients?: string[]
  default_on?: boolean
}

/** Ping 指标统计 */
export interface PingMetricStat {
  entity_id: string
  task_id: string
  name?: string
  type?: string
  interval?: number
  tags?: MetricTags
  total: number
  valid: number
  loss: number
  loss_approximate?: boolean
  min?: number | null
  max?: number | null
  avg?: number | null
  latest?: number | null
  p50?: number | null
  p99?: number | null
  stddev?: number | null
  p99_p50_ratio?: number
}

/** Ping 指标统计响应 */
export interface PingMetricStatsResponse {
  start: string
  end: string
  interval_seconds?: number
  stats: PingMetricStat[]
  count: number
}

/** RPC 错误 */
export class RpcError extends Error {
  code: number
  data?: unknown

  constructor(code: number, message: string, data?: unknown) {
    super(message)
    this.name = 'RpcError'
    this.code = code
    this.data = data
  }
}

/** RpcClient 配置选项 */
interface RpcClientOptions {
  baseUrl?: string
  timeout?: number
  /** 是否使用 WebSocket，默认 false */
  useWebSocket?: boolean
}

// ==================== CFSM 底層適配 ====================

const MB = 1024 * 1024
const ONLINE_THRESHOLD_MS = 5 * 60 * 1000

interface CfServerWire {
  id: string
  name?: string
  server_group?: string
  tags?: string
  price?: string | number | null
  billing_cycle?: string | number | null
  auto_renewal?: boolean | string | number | null
  currency?: string | null
  expire_date?: string | null
  traffic_limit?: string | number
  traffic_calc_type?: string
  sort_order?: number
  cpu?: number | string
  load_avg?: string
  net_in_speed?: number | string
  net_out_speed?: number | string
  net_rx?: number | string
  net_tx?: number | string
  net_rx_monthly?: number | string
  net_tx_monthly?: number | string
  processes?: number | string
  tcp_conn?: number | string
  udp_conn?: number | string
  ping_ct?: number | string | null
  ping_cu?: number | string | null
  ping_cm?: number | string | null
  ping_bd?: number | string | null
  loss_ct?: number | string | null
  loss_cu?: number | string | null
  loss_cm?: number | string | null
  loss_bd?: number | string | null
  ram_total?: number | string
  ram_used?: number | string
  swap_total?: number | string
  swap_used?: number | string
  disk_total?: number | string
  disk_used?: number | string
  cpu_cores?: number | string
  cpu_info?: string
  gpu_info?: string | unknown[]
  arch?: string
  os?: string
  region?: string
  ip_v4?: string
  ip_v6?: string
  boot_time?: string | number
  kernel_version?: string
  agent_version?: string
  last_updated?: number | string
  timestamp?: number | string
  is_online?: boolean
  /** 內嵌延遲歷史（約 30 點），由 /api/servers 直接返回 */
  ping?: CfPingPoint[]
  /** 內嵌丟包歷史，與 ping 時間軸對齊 */
  loss?: CfPingPoint[]
  custom_ct?: string
  custom_cu?: string
  custom_cm?: string
  custom_bd?: string
}

/** /api/servers 內嵌的 ping / loss 採樣點 */
interface CfPingPoint {
  ts?: number
  ct?: number | null
  cu?: number | null
  cm?: number | null
  bd?: number | null
}

/** /api/servers 完整響應 */
interface CfServersResponse {
  servers?: CfServerWire[]
  latestReportUpdates?: Array<{
    serverId?: string
    reportTs?: number
    samples?: Array<{ ts?: number, data?: Record<string, unknown> }>
  }>
  stats?: Record<string, number>
  regionStats?: Record<string, number>
  sysConfig?: Record<string, unknown>
}

/**
 * /api/history/all 僅接受白名單時長；未登入時 hours > 24 會被後端強制 401。
 * 參見 CF-Server-Monitor API.md 2.4。
 */
export const ALLOWED_HISTORY_HOURS = [0.167, 0.5, 1, 6, 12, 24, 48, 96, 168] as const

/** 未登入用戶可用的最大歷史時長（超過會 401） */
export const ANONYMOUS_MAX_HISTORY_HOURS = 24

export function isAdminLoggedIn(): boolean {
  return getLocalStorageValue('jwt_token').length > 0
}

/** 將任意 hours 規整為後端接受的白名單值，並按登入態封頂 */
function normalizeHistoryHours(hours?: number): number {
  const target = Number.isFinite(hours) ? Number(hours) : 24
  let best: number = ALLOWED_HISTORY_HOURS.reduce<number>(
    (acc, value) => (Math.abs(value - target) < Math.abs(acc - target) ? value : acc),
    24,
  )
  if (!isAdminLoggedIn() && best > ANONYMOUS_MAX_HISTORY_HOURS)
    best = ANONYMOUS_MAX_HISTORY_HOURS
  return best
}

/**
 * 將 ISO 時間範圍（start / end）轉換為「小時」數，再交由 normalizeHistoryHours 規整。
 * CFSM 不支援 start/end 區間查詢，只能以 hours 白名單窗口近似。
 * 未提供 end 時回退到 24h（與原始 getNodesLatestStatus 行為一致）。
 */
function hoursFromRange(start?: string, end?: string): number {
  if (!start || !end)
    return 24
  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs)
    return 24
  const hours = Math.ceil((endMs - startMs) / 3600000)
  return normalizeHistoryHours(hours)
}

function finiteNumber(value: unknown): number {
  const number = Number.parseFloat(String(value ?? 0))
  return Number.isFinite(number) ? number : 0
}

function timestamp(value: unknown, fallback = Date.now()): number {
  const number = finiteNumber(value)
  if (!number)
    return fallback
  return number < 1e12 ? number * 1000 : number
}

function enabled(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true'
}

function parseTrafficLimit(value: unknown): number {
  const text = String(value ?? '').trim().toUpperCase()
  const amount = finiteNumber(text)
  if (!amount)
    return 0
  if (text.includes('PB'))
    return amount * 1024 ** 5
  if (text.includes('TB'))
    return amount * 1024 ** 4
  if (text.includes('MB'))
    return amount * 1024 ** 2
  if (text.includes('KB'))
    return amount * 1024
  return amount * 1024 ** 3
}

function trafficLimitType(value: unknown): string {
  const type = String(value ?? '').toLowerCase()
  if (type === 'dl' || type === 'down')
    return 'down'
  if (type === 'ul' || type === 'up')
    return 'up'
  if (type === 'min' || type === 'max')
    return type
  return 'sum'
}

function parsePriceAmount(value: unknown): { price: number, configured: boolean } {
  const text = String(value ?? '').trim()
  if (!text)
    return { price: 0, configured: false }
  if (/^(?:free|免费)$/i.test(text))
    return { price: -1, configured: true }
  const amountText = text.split('/', 1)[0]?.match(/-?[\d.,]+/)?.[0]
  if (!amountText)
    return { price: 0, configured: false }
  const price = Number.parseFloat(amountText.replaceAll(',', ''))
  if (!Number.isFinite(price) || (price < 0 && price !== -1))
    return { price: 0, configured: false }
  return { price, configured: true }
}

function parseBillingCycle(value: unknown): number | null {
  if (value === undefined || value === null || value === '')
    return null
  if (typeof value === 'number')
    return Number.isFinite(value) ? value : null
  const text = String(value).trim().toLowerCase().replaceAll(' ', '_')
  const aliases: Record<string, number> = {
    '月': 30, 'monthly': 30, 'month': 30, 'mo': 30,
    '季': 90, '季度': 90, 'quarterly': 90, 'quarter': 90,
    '半年': 180, 'halfyear': 180, 'half_year': 180, 'half-year': 180,
    '年': 365, '一年': 365, 'annual': 365, 'yearly': 365, 'year': 365,
    '两年': 730, '二年': 730, 'two_years': 730, 'two-years': 730,
    '三年': 1095, 'three_years': 1095, 'three-years': 1095,
    '四年': 1460, 'four_years': 1460, 'four-years': 1460,
    '五年': 1825, 'five_years': 1825, 'five-years': 1825,
  }
  return aliases[text] ?? null
}

function getGpuName(raw: unknown): string {
  if (!raw)
    return ''
  if (Array.isArray(raw))
    return raw.map(g => g.name || g.id || 'GPU').join(' / ')
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.map(g => g.name || g.id || 'GPU').join(' / ') : raw
    }
    catch {
      return raw
    }
  }
  return String(raw)
}

function normalizeTags(value: unknown): string {
  if (Array.isArray(value))
    return value.map(item => String(item).trim()).filter(Boolean).join(';')
  return String(value ?? '')
    .split(/[,;]/)
    .map(tag => tag.trim())
    .filter(Boolean)
    .join(';')
}

function adaptClient(server: CfServerWire): Client {
  const billing = parsePriceAmount(server.price)
  const explicitCycle = parseBillingCycle(server.billing_cycle)
  const legacyCycle = parseBillingCycle(server.price)
  const bootTime = timestamp(server.boot_time, 0)
  const currency = server.currency || (server.price && String(server.price).includes('$') ? 'USD' : 'CNY')

  return {
    uuid: server.id,
    name: server.name || server.id,
    cpu_name: server.cpu_info || '-',
    virtualization: '-',
    arch: server.arch || '-',
    cpu_cores: finiteNumber(server.cpu_cores),
    os: server.os || '-',
    kernel_version: server.kernel_version || '-',
    gpu_name: getGpuName(server.gpu_info),
    ipv4: server.ip_v4 ?? '',
    ipv6: server.ip_v6 ?? '',
    region: String(server.region || '').toUpperCase(),
    public_remark: '',
    mem_total: finiteNumber(server.ram_total) * MB,
    swap_total: finiteNumber(server.swap_total) * MB,
    disk_total: finiteNumber(server.disk_total) * MB,
    version: server.agent_version,
    weight: finiteNumber(server.sort_order),
    price: billing.price,
    billing_cycle: explicitCycle ?? legacyCycle ?? 30,
    auto_renewal: enabled(server.auto_renewal),
    currency: currency || 'CNY',
    expired_at: server.expire_date || '9999-12-31',
    group: server.server_group || '默认分组',
    tags: normalizeTags(server.tags),
    hidden: false,
    traffic_limit: parseTrafficLimit(server.traffic_limit),
    traffic_limit_type: trafficLimitType(server.traffic_calc_type),
    created_at: '',
    updated_at: bootTime ? new Date(bootTime).toISOString() : '',
    boot_time: bootTime ? new Date(bootTime).toISOString() : '',
  }
}

function numberField(source: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = source[key]
    if (value !== undefined && value !== null && value !== '')
      return finiteNumber(value)
  }
  return 0
}

function adaptStatus(server: CfServerWire): NodeStatus {
  const wire = server as unknown as Record<string, unknown>
  const updatedAt = timestamp(wire.report_timestamp ?? server.last_updated ?? server.timestamp, 0)
  const load = String(server.load_avg ?? '').split(/\s+/).map(finiteNumber)
  const now = Date.now()
  const bootTime = timestamp(server.boot_time, 0)
  const online = server.is_online ?? (updatedAt > 0 && now - updatedAt < ONLINE_THRESHOLD_MS)

  return {
    client: server.id,
    time: updatedAt ? new Date(updatedAt).toISOString() : '',
    cpu: finiteNumber(server.cpu),
    gpu: 0,
    ram: finiteNumber(server.ram_used) * MB,
    ram_total: finiteNumber(server.ram_total) * MB,
    swap: finiteNumber(server.swap_used) * MB,
    swap_total: finiteNumber(server.swap_total) * MB,
    load: load[0] ?? 0,
    load5: load[1] ?? 0,
    load15: load[2] ?? 0,
    temp: 0,
    disk: finiteNumber(server.disk_used) * MB,
    disk_total: finiteNumber(server.disk_total) * MB,
    net_in: numberField(wire, 'net_in_speed', 'net_in'),
    net_out: numberField(wire, 'net_out_speed', 'net_out'),
    // CFSM 同時提供總流量（net_tx/net_rx）與月流量（net_tx_monthly/net_rx_monthly）。
    // 本主題將「總流量」欄位語義統一為月流量，以配合流量限額進度條與月流量卡片顯示。
    net_total_up: numberField(wire, 'net_tx_monthly', 'net_tx', 'net_total_up'),
    net_total_down: numberField(wire, 'net_rx_monthly', 'net_rx', 'net_total_down'),
    process: finiteNumber(server.processes),
    connections: finiteNumber(server.tcp_conn),
    connections_udp: finiteNumber(server.udp_conn),
    online,
    uptime: Math.max(0, Math.floor((now - bootTime) / 1000)),
  }
}

function adaptStatusRecord(uuid: string, row: Record<string, unknown>): StatusRecord {
  const load = String(row.load_avg ?? '').split(/\s+/).map(finiteNumber)
  return {
    client: uuid,
    time: new Date(timestamp(row.timestamp)).toISOString(),
    cpu: finiteNumber(row.cpu),
    gpu: finiteNumber(row.gpu),
    ram: finiteNumber(row.ram_used) * MB,
    ram_total: finiteNumber(row.ram_total) * MB,
    swap: finiteNumber(row.swap_used) * MB,
    swap_total: finiteNumber(row.swap_total) * MB,
    load: load[0] ?? 0,
    load5: load[1] ?? 0,
    load15: load[2] ?? 0,
    temp: 0,
    disk: finiteNumber(row.disk_used) * MB,
    disk_total: finiteNumber(row.disk_total) * MB,
    net_in: numberField(row, 'net_in_speed', 'net_in'),
    net_out: numberField(row, 'net_out_speed', 'net_out'),
    // 歷史記錄同樣優先取月流量統計
    net_total_up: numberField(row, 'net_tx_monthly', 'net_tx', 'net_total_up'),
    net_total_down: numberField(row, 'net_rx_monthly', 'net_rx', 'net_total_down'),
    process: finiteNumber(row.processes),
    connections: finiteNumber(row.tcp_conn),
    connections_udp: finiteNumber(row.udp_conn),
  }
}

/* ---------- HTTP 請求 ---------- */

function getApiBases(): string[] {
  const meta = document.querySelector('meta[name="apiBase"]')
  const content = meta?.getAttribute('content')?.trim()
  if (content) {
    const bases = content.split(',').map(item => item.trim()).filter(Boolean)
    if (bases.length > 0)
      return bases
  }
  return [window.location.origin]
}

function normalizeBase(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

function getLocalStorageValue(key: string): string {
  try {
    return localStorage.getItem(key)?.trim() ?? ''
  }
  catch {
    return ''
  }
}

function authHeaders(baseUrl: string): Headers {
  const headers = new Headers()
  const token = getLocalStorageValue('jwt_token')
  if (token)
    headers.set('Authorization', `Bearer ${token}`)
  const turnstileToken = getLocalStorageValue('turnstile_token')
  const verified = getLocalStorageValue('turnstile_verified')
  if (turnstileToken)
    headers.set('X-Turnstile-Token', turnstileToken)
  else if (verified)
    headers.set('X-Turnstile-Verified', verified)
  return headers
}

/**
 * GET 請求去重 + 短 TTL 緩存（按完整 path 當 key）。
 *
 * 解決詳情頁同時渲染「負載圖」與「Ping 圖」時，二者各自打
 * `/api/history/all?id=<uuid>&hours=<h>`（見 getLoadRecords / getPingRecords）
 * 產生的重複請求——同一輪渲染內只發一次真實 HTTP，降低 Cloudflare
 * Worker / D1 請求量。TTL 很短（1.5s），只合併併發請求，不會長期佔用舊數據；
 * 實時更新走 WebSocket，不受此緩存影響。
 */
const RPC_GET_CACHE_TTL_MS = 1500

const rpcGetCache = new Map<string, { at: number, data: unknown }>()
const rpcGetInflight = new Map<string, Promise<unknown>>()

async function cfsmRequest<T>(path: string, timeoutMs = 30000): Promise<T> {
  const cached = rpcGetCache.get(path)
  if (cached && Date.now() - cached.at < RPC_GET_CACHE_TTL_MS)
    return cached.data as T
  const inflight = rpcGetInflight.get(path)
  if (inflight)
    return inflight as Promise<T>

  const promise = (async (): Promise<T> => {
    const bases = getApiBases()
    const baseUrl = normalizeBase(bases[0] ?? window.location.origin)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: authHeaders(baseUrl),
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      if (response.status === 401) {
        throw new RpcError(401, 'Unauthorized')
      }
      if (!response.ok) {
        throw new RpcError(response.status, `HTTP error: ${response.status}`)
      }

      let data: unknown = null
      try {
        data = await response.json()
      }
      catch {
        data = null
      }

      if (data && typeof data === 'object' && 'turnstile_verified' in data) {
        const verified = String((data as { turnstile_verified?: unknown }).turnstile_verified || '')
        if (verified) {
          localStorage.setItem('turnstile_verified', verified)
          localStorage.removeItem('turnstile_token')
        }
      }
      return data as T
    }
    catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof RpcError)
        throw error
      throw new RpcError(-32000, `Network error: ${error instanceof Error ? error.message : String(error)}`)
    }
  })()

  rpcGetInflight.set(path, promise)
  try {
    const result = await promise
    rpcGetCache.set(path, { at: Date.now(), data: result })
    return result
  }
  finally {
    rpcGetInflight.delete(path)
  }
}

/* ---------- /api/servers 共享快照（請求去重 + 短 TTL 緩存） ---------- */

/**
 * getNodes() 與 getNodesLatestStatus() 原本各自請求一次 /api/servers，
 * 疊加輪詢後對 Cloudflare Worker 造成成倍請求量。此處做 in-flight 去重與
 * 短 TTL 緩存，使同一輪數據獲取只產生一次真實 HTTP 請求。
 */
const SERVERS_SNAPSHOT_TTL_MS = 1200

let serversSnapshot: { at: number, data: CfServersResponse } | null = null
let serversInflight: Promise<CfServersResponse> | null = null
const serverBaseById = new Map<string, CfServerWire>()

function rememberServerBase(server: CfServerWire): void {
  serverBaseById.set(server.id, server)
}

async function fetchServersSnapshot(force = false): Promise<CfServersResponse> {
  if (!force && serversSnapshot && Date.now() - serversSnapshot.at < SERVERS_SNAPSHOT_TTL_MS)
    return serversSnapshot.data
  if (serversInflight)
    return serversInflight

  serversInflight = cfsmRequest<CfServersResponse>('/api/servers')
    .then((data) => {
      serversSnapshot = { at: Date.now(), data: data ?? {} }
      for (const server of serversSnapshot.data.servers ?? [])
        rememberServerBase(server)
      return serversSnapshot.data
    })
    .finally(() => {
      serversInflight = null
    })

  return serversInflight
}

/**
 * WS batchUpdate 增量覆蓋層：serverId → 已合併的最新欄位。
 * REST 快照提供靜態與完整欄位，WS 樣本提供高頻指標，二者疊加後生成 NodeStatus。
 */
const liveOverlay = new Map<string, Record<string, unknown>>()

function applyLiveSamples(samples: WsSample[]): string[] {
  const touched = new Set<string>()
  for (const sample of samples) {
    const merged = { ...(liveOverlay.get(sample.serverId) ?? {}), ...sample.data }
    if (sample.ts)
      merged.last_updated = sample.ts
    liveOverlay.set(sample.serverId, merged)
    touched.add(sample.serverId)
  }
  return [...touched]
}

/** 取得疊加了 WS 增量的伺服器物件 */
function withLiveOverlay(server: CfServerWire): CfServerWire {
  const overlay = liveOverlay.get(server.id)
  return overlay ? { ...server, ...overlay } as CfServerWire : server
}

// ==================== RpcClient（接口與原版一致，底層為 CFSM） ====================

/** WebSocket 實時樣本（batchUpdate 解析後的單條增量） */
export interface WsSample {
  serverId: string
  ts: number
  data: Record<string, unknown>
}

/** JSON-RPC 兼容客戶端殼（CFSM 無 RPC2 協議，方法經 HTTP 直連） */
export class RpcClient {
  private timeout: number
  private useWebSocket: boolean
  private ws: WebSocket | null = null
  private wsConnectPromise: Promise<void> | null = null
  /** 已註冊的伺服器 ID（subscribe=all 過濾用） */
  private registeredIds: string[] = []
  /** 最近一次已向服務端發送的訂閱 ID（去重用） */
  private subscribedIdsKey = ''
  /** 當前聚焦的單一節點（詳情頁）；非 null 時 WS URL 用 subscribe=<id> */
  private wsFocusId: string | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  /** batchUpdate 樣本回調（由上層接入 nodesStore） */
  private sampleListeners = new Set<(samples: WsSample[]) => void>()

  constructor(options: RpcClientOptions = {}) {
    this.timeout = options.timeout || 30000
    this.useWebSocket = options.useWebSocket || false
  }

  /** 註冊需要訂閱的伺服器 ID；若已連線且列表變化則即時重發 subscribe */
  setRegisteredIds(ids: string[]): void {
    this.registeredIds = ids
    if (this.ws && this.ws.readyState === WebSocket.OPEN)
      this.sendSubscribe()
  }

  /**
   * 設置當前聚焦的單一節點（詳情頁）：
   * - 詳情頁：WS URL 改為 /api/ws?subscribe=<id>，只接收該節點的實時推送；
   * - 離開詳情頁（null）：回到 subscribe=all。
   * URL 參數變化需要重連 WS，故此處直接關閉並重建連接。
   */
  setWsFocus(uuid: string | null): void {
    if (this.wsFocusId === uuid)
      return
    this.wsFocusId = uuid
    if (this.ws) {
      this.close()
      void this.ensureWebSocketReady()
    }
  }

  /** 訂閱 batchUpdate 實時樣本，返回取消訂閱函數 */
  onSamples(listener: (samples: WsSample[]) => void): () => void {
    this.sampleListeners.add(listener)
    return () => this.sampleListeners.delete(listener)
  }

  /** 向服務端發送 subscribe 消息（帶當前 ids 列表；空列表不發，避免無效訂閱） */
  private sendSubscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
      return
    // 詳情頁聚焦單一節點時只訂閱該節點，配合 URL subscribe=<id>
    const ids = this.wsFocusId ? [this.wsFocusId] : this.registeredIds
    if (ids.length === 0)
      return
    const key = ids.join(',')
    if (key === this.subscribedIdsKey)
      return
    this.subscribedIdsKey = key
    try {
      this.ws.send(JSON.stringify({ type: 'subscribe', scope: 'all', ids }))
    }
    catch { /* 忽略發送失敗，下次 setRegisteredIds 會重試 */ }
  }

  /** 解析並派發 batchUpdate 消息 */
  private handleWsMessage(raw: unknown): void {
    if (typeof raw !== 'string')
      return
    let msg: Record<string, unknown> | null = null
    try {
      msg = JSON.parse(raw) as Record<string, unknown>
    }
    catch {
      return
    }
    if (!msg || msg.type !== 'batchUpdate' || !Array.isArray(msg.updates))
      return

    const samples: WsSample[] = []
    for (const update of msg.updates as Array<Record<string, unknown>>) {
      const serverId = String(update?.serverId ?? '')
      if (!serverId || !Array.isArray(update.samples))
        continue
      // 按時間升序，最後一條為完整報告狀態。
      // CFSM 線上推送的樣本位於 sample.payload（而非 sample.data），需兼容兩者。
      const sorted = [...(update.samples as Array<Record<string, unknown>>)]
        .filter(s => s && typeof s === 'object' && (s.data || s.payload))
        .sort((a, b) => finiteNumber(a.ts) - finiteNumber(b.ts))
      for (const sample of sorted) {
        const sampleData = (sample.data ?? sample.payload) as Record<string, unknown>
        samples.push({
          serverId,
          ts: timestamp(sample.ts ?? sampleData.last_updated),
          data: sampleData,
        })
      }
    }
    if (samples.length === 0)
      return
    for (const listener of this.sampleListeners) {
      try {
        listener(samples)
      }
      catch { /* 單個監聽器異常不影響其它 */ }
    }
  }

  /** 調用方法（CFSM 直接映射到 REST 端點） */
  async call<T>(method: string, params?: Record<string, unknown> | unknown[]): Promise<T> {
    return this.callHttp<T>(method, params)
  }

  private async callHttp<T>(method: string, params?: Record<string, unknown> | unknown[]): Promise<T> {
    const rpc = getSharedRpc()
    switch (method) {
      case 'rpc.ping':
        return (await rpc.ping()) as unknown as T
      case 'rpc.getVersion':
      case 'common:getBackendVersion':
        return (await rpc.getBackendVersion()) as unknown as T
      case 'common:getNodes':
        return (await rpc.getNodes()) as unknown as T
      case 'common:getNodesLatestStatus':
        return (await rpc.getNodesLatestStatus()) as unknown as T
      case 'common:getNodeRecentStatus': {
        const { uuid, limit } = (params ?? {}) as { uuid: string, limit?: number }
        return (await rpc.getNodeRecentStatus(uuid, limit)) as unknown as T
      }
      case 'common:getPublicInfo':
        return (await rpc.getPublicInfo()) as unknown as T
      case 'common:getRecords': {
        const p = (params ?? {}) as {
          type: string
          uuid?: string
          hours?: number
          task_id?: number
          max_count?: number
          start?: string
          end?: string
        }
        // CFSM 不支援 start/end 區間查詢，統一換算為 hours 窗口
        const hours = p.hours ?? hoursFromRange(p.start, p.end)
        if (p.type === 'ping')
          return (await rpc.getPingRecords(p.uuid, hours, p.max_count)) as unknown as T
        return (await rpc.getLoadRecords(p.uuid, hours, undefined, p.max_count)) as unknown as T
      }
      default:
        throw new RpcError(-32601, `Method not found: ${method}`)
    }
  }

  /** 切換傳輸方式（WebSocket 僅用於狀態指示，數據仍走 REST） */
  setTransport(useWebSocket: boolean): void {
    if (this.useWebSocket !== useWebSocket) {
      this.useWebSocket = useWebSocket
      if (!useWebSocket && this.ws) {
        this.ws.close()
        this.ws = null
      }
    }
  }

  /** 確保 WebSocket 連接已建立 */
  async ensureWebSocketConnected(): Promise<void> {
    await this.ensureWebSocketReady()
  }

  /** 確保 WebSocket 連接已建立並通過 ping 驗證 */
  async ensureWebSocketConnectedWithPing(timeoutMs = 10000): Promise<void> {
    const startedAt = Date.now()
    let connectionTimer: ReturnType<typeof setTimeout> | undefined

    try {
      await Promise.race([
        this.ensureWebSocketReady(),
        new Promise<never>((_, reject) => {
          connectionTimer = setTimeout(() => {
            this.close()
            reject(new RpcError(-32001, 'WebSocket connection timeout'))
          }, timeoutMs)
        }),
      ])
    }
    finally {
      if (connectionTimer)
        clearTimeout(connectionTimer)
    }
  }

  private async ensureWebSocketReady(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN)
      return
    if (this.wsConnectPromise)
      return this.wsConnectPromise
    this.wsConnectPromise = this.initWebSocket()
    try {
      await this.wsConnectPromise
    }
    finally {
      this.wsConnectPromise = null
    }
  }

  private buildWsUrl(): string {
    const bases = getApiBases()
    const base = normalizeBase(bases[0] ?? window.location.origin)
    const url = new URL(base)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.pathname = '/api/ws'
    url.searchParams.set('subscribe', this.wsFocusId ?? 'all')
    if (url.host !== window.location.host) {
      const token = getLocalStorageValue('jwt_token')
      if (token)
        url.searchParams.set('token', token)
    }
    return url.toString()
  }

  private initWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws) {
        this.ws.onopen = null
        this.ws.onerror = null
        this.ws.onmessage = null
        this.ws.onclose = null
        if (this.ws.readyState !== WebSocket.CLOSED)
          this.ws.close()
      }

      const socket = new WebSocket(this.buildWsUrl())
      let opened = false
      this.ws = socket

      socket.onopen = () => {
        if (this.ws !== socket) {
          socket.close()
          return
        }
        opened = true
        // CFSM 推送模式：subscribe=all 默認不推送任何更新，必須提交 ids 列表
        this.subscribedIdsKey = ''
        this.sendSubscribe()
        this.heartbeatTimer = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN)
            socket.send(JSON.stringify({ type: 'ping' }))
        }, 30000)
        resolve()
      }

      socket.onerror = () => {
        if (this.ws !== socket)
          return
        reject(new RpcError(-32000, 'WebSocket connection error'))
      }

      socket.onmessage = (event) => {
        if (this.ws !== socket)
          return
        // CFSM 原生實時通道：消費 batchUpdate 增量樣本
        this.handleWsMessage(event.data)
      }

      socket.onclose = () => {
        if (this.ws !== socket)
          return
        this.subscribedIdsKey = ''
        if (this.heartbeatTimer) {
          clearInterval(this.heartbeatTimer)
          this.heartbeatTimer = null
        }
        if (this.ws === socket)
          this.ws = null
        if (!opened)
          reject(new RpcError(-32000, 'WebSocket closed before opening'))
      }
    })
  }

  close(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  getWsReadyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED
  }

  getWebSocket(): WebSocket | null {
    return this.ws
  }

  getTimeout(): number {
    return this.timeout
  }
}

// ==================== KomariRpc（接口與原版一致） ====================

export class KomariRpc {
  private client: RpcClient

  constructor(options: RpcClientOptions = {}) {
    this.client = new RpcClient(options)
  }

  getClient(): RpcClient {
    return this.client
  }

  async getMethods(): Promise<string[]> {
    return []
  }

  async getHelp(): Promise<MethodMeta[]> {
    return []
  }

  async ping(timeoutMs?: number): Promise<string> {
    await fetchCfsmConfig(timeoutMs ?? this.client.getTimeout())
    return 'pong'
  }

  async getVersion(): Promise<VersionInfo> {
    return this.getBackendVersion()
  }

  async getNodes(): Promise<Record<string, Client>> {
    const response = await fetchServersSnapshot()
    const clients: Record<string, Client> = {}
    for (const server of response?.servers ?? [])
      clients[server.id] = adaptClient(server)
    // 提交訂閱列表：subscribe=all 必須帶 ids 才會收到推送
    this.client.setRegisteredIds(Object.keys(clients))
    return clients
  }

  async getNodesLatestStatus(): Promise<Record<string, NodeStatus>> {
    const response = await fetchServersSnapshot()
    const statuses: Record<string, NodeStatus> = {}
    for (const server of response?.servers ?? [])
      statuses[server.id] = adaptStatus(withLiveOverlay(server))
    return statuses
  }

  async getNodeSnapshot(uuid: string): Promise<{ client: Client, status: NodeStatus }> {
    const server = await cfsmRequest<CfServerWire>(`/api/server?id=${encodeURIComponent(uuid)}`)
    rememberServerBase(server)
    this.client.setRegisteredIds([uuid])
    return {
      client: adaptClient(server),
      status: adaptStatus(withLiveOverlay(server)),
    }
  }

  /**
   * 訂閱 WebSocket 實時狀態更新。
   *
   * CFSM 的原生實時機制是 /api/ws 推送 batchUpdate；此處把增量樣本疊加到
   * 已知的 REST 基礎快照上（首頁 /api/servers；詳情頁 /api/server?id=），
   * 生成完整 NodeStatus 交給上層寫入 store，無需 HTTP 定時輪詢。
   */
  onLiveStatus(callback: (statuses: Record<string, NodeStatus>) => void): () => void {
    return this.client.onSamples((samples) => {
      const touched = applyLiveSamples(samples)
      if (touched.length === 0)
        return

      const statuses: Record<string, NodeStatus> = {}
      for (const uuid of touched) {
        const server = serverBaseById.get(uuid)
        if (!server)
          continue
        statuses[server.id] = adaptStatus(withLiveOverlay(server))
      }
      if (Object.keys(statuses).length > 0)
        callback(statuses)
    })
  }

  async getNodeRecentStatus(uuid: string, limit?: number): Promise<{ count: number, records: StatusRecord[] }> {
    const server = await cfsmRequest<CfServerWire>(`/api/server?id=${encodeURIComponent(uuid)}`)
    const status = adaptStatus(server)
    const record: StatusRecord = {
      client: uuid,
      time: status.time,
      cpu: status.cpu,
      gpu: status.gpu,
      ram: status.ram,
      ram_total: status.ram_total,
      swap: status.swap,
      swap_total: status.swap_total,
      load: status.load,
      load5: status.load5,
      load15: status.load15,
      temp: status.temp,
      disk: status.disk,
      disk_total: status.disk_total,
      net_in: status.net_in,
      net_out: status.net_out,
      net_total_up: status.net_total_up,
      net_total_down: status.net_total_down,
      process: status.process,
      connections: status.connections,
      connections_udp: status.connections_udp,
    }
    return { count: 1, records: limit ? [record] : [record] }
  }

  async getPublicInfo(): Promise<PublicInfo> {
    return getSharedApi().getPublicSettings() as unknown as PublicInfo
  }

  async getBackendVersion(): Promise<VersionInfo> {
    const config = await fetchCfsmConfig(this.client.getTimeout())
    return { version: config?.version || '', hash: '' }
  }

  async getRecords(params: {
    type: 'load' | 'ping'
    uuid?: string
    hours?: number
    task_id?: number
    load_type?: string
    max_count?: number
  }): Promise<unknown> {
    if (params.type === 'ping')
      return this.getPingRecords(params.uuid, params.hours, params.max_count)
    return this.getLoadRecords(params.uuid, params.hours, params.load_type, params.max_count)
  }

  async getLoadRecords(uuid?: string, hours?: number, _loadType?: string, _maxCount?: number): Promise<{ records: StatusRecord[] }> {
    if (!uuid)
      return { records: [] }
    const safeHours = normalizeHistoryHours(hours)
    const rows = await cfsmRequest<Array<Record<string, unknown>>>(
      `/api/history/all?id=${encodeURIComponent(uuid)}&hours=${safeHours}`,
    )
    return { records: (rows ?? []).map(row => adaptStatusRecord(uuid, row)) }
  }

  /**
   * 取得 Ping 記錄。
   *
   * - 指定 uuid（詳情頁）：直接回源 /api/history/all?id=<uuid>&hours=，不再先拉整個
   *   /api/servers 快照，避免重複/冗餘請求（CFSM 的 show_three_net_details=false 亦
   *   不會內嵌 ping[]，快照對單節點查詢並無用處）。
   * - 無指定 uuid（首頁摘要）：用 /api/servers 快照內嵌歷史；CFSM 內嵌為空時逐節點
   *   退為當前 ping 與 loss 單點，避免首頁 N+1 歷史請求。
   */
  async getPingRecords(uuid?: string, hours?: number, _maxCount?: number): Promise<{ records: PingRecord[], tasks: Array<{ id: number, name: string, loss: number }> }> {
    const requestedHours = normalizeHistoryHours(hours)

    // CFSM 詳情頁延遲圖固定繪製 電信/聯通/移動 三網（ServerDetail.vue 的 PING_FIELD_DEFS），
    // 不隨 show_three_net_details 開關切換；BGP 亦一併納入以對齊卡片層的 pingList。
    // 因此此處恆定回傳全部 4 個探測任務，由圖表組件決定顯示哪些。
    const PING_TASKS = [
      { id: 1, key: 'ct', name: '电信' },
      { id: 2, key: 'cu', name: '联通' },
      { id: 3, key: 'cm', name: '移动' },
      { id: 4, key: 'bd', name: 'BGP' },
    ] as const
    const activeTasks = PING_TASKS

    const records: PingRecord[] = []
    const taskLoss: Record<number, number[]> = {}

    const pushPoint = (client: string, taskId: number, ts: number, latency: unknown, loss: unknown): void => {
      const hasLatency = latency !== undefined && latency !== null
      const lossValue = loss === undefined || loss === null ? 0 : finiteNumber(loss)
      // 完全無數據（既無延遲也無丟包記錄）視為未探測，跳過
      if (!hasLatency && (loss === undefined || loss === null))
        return
      const latencyValue = hasLatency ? finiteNumber(latency) : 0
      records.push({
        client,
        task_id: taskId,
        time: new Date(ts).toISOString(),
        // -1 表示丟包/探測失敗，由圖表渲染為斷點
        value: lossValue >= 100 || !hasLatency || latencyValue <= 0 ? -1 : latencyValue,
      })
      const losses = taskLoss[taskId] ?? []
      losses.push(lossValue)
      taskLoss[taskId] = losses
    }

    if (uuid) {
      // 單節點（詳情頁）：直接回源歷史接口，不經 /api/servers 快照
      const rows = await cfsmRequest<Array<Record<string, unknown>>>(
        `/api/history/all?id=${encodeURIComponent(uuid)}&hours=${requestedHours}`,
      )
      for (const row of rows ?? []) {
        const ts = timestamp(row.timestamp)
        for (const task of activeTasks)
          pushPoint(uuid, task.id, ts, row[`ping_${task.key}`], row[`loss_${task.key}`])
      }
    }
    else {
      const snapshot = await fetchServersSnapshot()
      const allServers = snapshot?.servers ?? []

      for (const server of allServers) {
        const pingPoints = server.ping ?? []
        const lossPoints = server.loss ?? []

        if (pingPoints.length > 0 || lossPoints.length > 0) {
          const lossByTs = new Map<number, CfPingPoint>()
          for (const point of lossPoints)
            lossByTs.set(finiteNumber(point?.ts), point)

          for (const point of pingPoints) {
            const ts = finiteNumber(point?.ts)
            const lossPoint = lossByTs.get(ts)
            for (const task of activeTasks) {
              pushPoint(
                server.id,
                task.id,
                ts,
                point?.[task.key as keyof CfPingPoint],
                lossPoint?.[task.key as keyof CfPingPoint],
              )
            }
          }
        }
        else {
          const ts = timestamp(server.last_updated || server.timestamp)
          const serverRecord = server as Record<string, unknown>
          for (const task of activeTasks) {
            pushPoint(
              server.id,
              task.id,
              ts,
              serverRecord[`ping_${task.key}`],
              serverRecord[`loss_${task.key}`],
            )
          }
        }
      }
    }

    return {
      records,
      tasks: activeTasks.map(task => ({
        id: task.id,
        name: task.name,
        loss: (taskLoss[task.id] ?? []).reduce((sum, value) => sum + value, 0) / Math.max(1, taskLoss[task.id]?.length ?? 0),
      })),
    }
  }

  async queryMetrics(_params: {
    metric_keys: string[]
    start?: string
    end?: string
    hours?: number
    aggregation?: string
    aggregation_by_metric?: Record<string, string>
    max_points?: number
    fill_empty?: boolean
  }): Promise<QueryMetricsResponse> {
    return { start: '', end: '', series: [], count: 0 }
  }

  async getPublicPingTasks(): Promise<PublicPingTask[]> {
    return [
      { id: 1, name: '电信', interval: 60 },
      { id: 2, name: '联通', interval: 60 },
      { id: 3, name: '移动', interval: 60 },
      { id: 4, name: 'BGP', interval: 60 },
    ]
  }

  async getPingMetricStats(_params: {
    entity_id?: string
    start?: string
    end?: string
    hours?: number
    max_points?: number
  } = {}): Promise<PingMetricStatsResponse> {
    return { start: '', end: '', stats: [], count: 0 }
  }

  close(): void {
    this.client.close()
  }
}

// ==================== 单例 ====================

let sharedRpc: KomariRpc | null = null

export function getSharedRpc(): KomariRpc {
  if (!sharedRpc)
    sharedRpc = new KomariRpc()
  return sharedRpc
}

export function resetSharedRpc(): void {
  if (sharedRpc) {
    sharedRpc.close()
    sharedRpc = null
  }
}
