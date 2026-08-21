/**
 * CF-Server-Monitor API 適配層
 *
 * 保持原版 Komari-Material `utils/api.ts` 的完整接口簽名
 * （KomariApi / RealtimeWebSocket / getSharedApi），底層替換為 CFSM 公開 API：
 *  - getPublicSettings → GET /api/config（theme_options 解析為 theme_settings）
 *  - getMe             → GET /api/config（authorization → logged_in）
 *  - getVersion        → GET /api/config
 *  - getLoadRecords    → GET /api/history/all?id=&hours=
 *  - getPingRecords    → GET /api/history/all（ping_ct/cu/cm/bd）
 *  - login/oauth       → CFSM 登錄在 /admin，此處跳轉
 *  - updateThemeSettings → CFSM theme_options 只讀，拋出提示
 *
 * 原始版權：Komari-Material Copyright (c) 2026 Liebesfreud（MIT）
 */
import type { PublicInfo } from '@/utils/rpc'
import { adaptThemeOptions } from '@/utils/cfsmTheme'
import type { ThemeSettings } from '@/utils/cfsmTheme'

// ==================== 类型定义（与原版一致） ====================

/** API 响应基础结构（適配層保留，兼容調用方） */
interface ApiResponse<T = unknown> {
  status: 'success' | 'error'
  message: string
  data: T
}

/** 用户信息 */
export interface MeInfo {
  'logged_in': boolean
  'username': string
  '2fa_enabled'?: boolean
  'sso_id'?: string
  'sso_type'?: string
  'uuid'?: string
}

/** 公开站点属性 */
export interface PublicSettings {
  allow_cors: boolean
  custom_body: string
  custom_head: string
  description: string
  disable_password_login: boolean
  oauth_enable: boolean
  oauth_provider: string | null
  ping_record_preserve_time: number
  private_site: boolean
  record_enabled: boolean
  record_preserve_time: number
  sitename: string
  theme: string
  theme_settings?: Record<string, unknown> | null
  /** 数据更新间隔（秒），主题配置项 */
  dataUpdateInterval?: number
}

/** 版本信息 */
export interface VersionInfo {
  hash: string
  version: string
}

/** 节点信息 */
export interface NodeInfo {
  uuid: string
  name: string
  cpu_name: string
  virtualization: string
  arch: string
  cpu_cores: number
  os: string
  kernel_version: string
  gpu_name: string
  region: string
  mem_total: number
  swap_total: number
  disk_total: number
  weight: number
  price: number
  billing_cycle: number
  auto_renewal: boolean
  currency: string
  expired_at: string | null
  group: string
  tags: string
  public_remark: string
  hidden: boolean
  traffic_limit: number
  traffic_limit_type: string
  created_at: string
  updated_at: string
}

/** 实时状态数据（嵌套结构） */
export interface RealtimeStatus {
  cpu: {
    usage: number
  }
  ram: {
    total: number
    used: number
  }
  swap: {
    total: number
    used: number
  }
  load: {
    load1: number
    load5: number
    load15: number
  }
  disk: {
    total: number
    used: number
  }
  network: {
    up: number
    down: number
    totalUp: number
    totalDown: number
  }
  connections: {
    tcp: number
    udp: number
  }
  uptime: number
  process: number
  message: string
  updated_at: string
}

/** WebSocket 实时状态响应 */
export interface WebSocketRealtimeResponse {
  status: 'success' | 'error'
  data: {
    online: string[]
    data: Record<string, RealtimeStatus>
  }
}

/** 负载历史记录（扁平结构） */
export interface LoadRecord {
  client: string
  time: string
  cpu: number
  gpu: number
  ram: number
  ram_total: number
  swap: number
  swap_total: number
  load: number
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

/** 负载历史记录响应 */
export interface LoadRecordsResponse {
  count: number
  records: LoadRecord[]
}

/** Ping 历史记录 */
export interface PingRecord {
  task_id: number
  time: string
  value: number
}

/** Ping 任务信息 */
export interface PingTask {
  id: number
  interval: number
  name: string
  loss: number
}

/** Ping 历史记录响应 */
export interface PingRecordsResponse {
  count: number
  records: PingRecord[]
  tasks: PingTask[]
}

/** 管理后台数据库占用信息 */
export interface DatabaseSizeInfo {
  main?: {
    size?: number
  }
  monitoring?: {
    size?: number
  }
}

/** 登录请求 */
export interface LoginRequest {
  'username': string
  'password': string
  '2fa_code'?: string
}

/** API 客户端配置 */
export interface ApiClientOptions {
  /** 基础路径，默认 '/api' */
  baseUrl?: string
  /** 超时时间（毫秒），默认 30000 */
  timeout?: number
}

/** API 错误 */
export class ApiError extends Error {
  status: string
  code?: number

  constructor(message: string, status: string = 'error', code?: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

// ==================== CFSM 底層適配 ====================

const MB = 1024 * 1024

interface SiteConfigWire {
  version?: string
  last_workers_version?: string | null
  last_agent_version?: string | null
  is_public?: boolean | string
  authorization?: boolean
  turnstile_enabled?: boolean | string
  turnstile_site_key?: string
  site_title?: string
  theme_options?: unknown
  show_long_history?: boolean
  frontend_ws_timeout_minutes?: number
  long_history_points?: number
}

interface ServersResponseWire {
  servers?: Array<Record<string, unknown>>
  stats?: { total?: number, online?: number, offline?: number }
  sysConfig?: Record<string, unknown>
}

interface HistoryRowWire extends Record<string, unknown> {
  timestamp: number | string
}

function enabled(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'true'
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

function normalizeBase(value: string): string {
  return value.trim().replace(/\/+$/, '')
}

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

async function cfsmFetch<T>(path: string, options: RequestInit = {}, timeoutMs = 30000): Promise<T> {
  const bases = getApiBases()
  const baseUrl = normalizeBase(bases[0] ?? window.location.origin)
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: authHeaders(baseUrl),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!response.ok) {
      let message = `HTTP error: ${response.status}`
      try {
        const data = await response.json()
        if (data && typeof data === 'object' && 'error' in data)
          message = String((data as { error: unknown }).error)
      }
      catch {
        // ignore
      }
      throw new ApiError(message, 'error', response.status)
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
    if (error instanceof ApiError)
      throw error
    throw new ApiError(`Network error: ${error instanceof Error ? error.message : String(error)}`, 'error')
  }
}

// ==================== API 客户端（接口與原版一致） ====================

/** CFSM API 客户端 */
export class KomariApi {
  private baseUrl: string
  private timeout: number

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = options.baseUrl || ''
    this.timeout = options.timeout || 30000
  }

  private async get<T>(path: string, params?: Record<string, string | number>): Promise<T> {
    let url = path
    if (params) {
      const searchParams = new URLSearchParams()
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null)
          searchParams.append(key, String(value))
      })
      const queryString = searchParams.toString()
      if (queryString)
        url += `?${queryString}`
    }
    return cfsmFetch<T>(url, {}, this.timeout)
  }

  private async getRaw<T>(path: string): Promise<T> {
    return cfsmFetch<T>(path, {}, this.timeout)
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    return cfsmFetch<T>(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    }, this.timeout)
  }

  /** 獲取當前用戶信息（CFSM：/api/config.authorization） */
  async getMe(): Promise<MeInfo> {
    const config = await cfsmFetch<SiteConfigWire>('/api/config')
    return {
      logged_in: Boolean(config?.authorization),
      username: '',
    }
  }

  /** 獲取站點公開屬性（CFSM：/api/config） */
  async getPublicSettings(): Promise<PublicSettings> {
    const config = await cfsmFetch<SiteConfigWire>('/api/config')
    const themeSettings: ThemeSettings = adaptThemeOptions(config?.theme_options)
    return {
      allow_cors: true,
      custom_body: '',
      custom_head: '',
      description: '',
      disable_password_login: false,
      oauth_enable: false,
      oauth_provider: null,
      ping_record_preserve_time: 24,
      private_site: config ? !enabled(config.is_public) : false,
      record_enabled: true,
      record_preserve_time: 24,
      sitename: config?.site_title || document.title || 'CF Server Monitor',
      theme: 'material',
      theme_settings: themeSettings as unknown as Record<string, unknown>,
      dataUpdateInterval: themeSettings.dataUpdateInterval,
    }
  }

  /** 更新主題配置（CFSM theme_options 只讀，提示到後台修改） */
  async updateThemeSettings(_theme: string, _settings: Record<string, unknown>): Promise<void> {
    throw new ApiError('CF-Server-Monitor 主題配置為只讀，請到後台「主題自定義配置 JSON」修改', 'error')
  }

  /** 獲取服務端版本信息 */
  async getVersion(): Promise<VersionInfo> {
    const config = await cfsmFetch<SiteConfigWire>('/api/config')
    return { version: config?.version || '', hash: '' }
  }

  /** 登錄（CFSM 登錄在 /admin，跳轉） */
  async login(_username: string, _password: string, _twoFactorCode?: string): Promise<{ 'set-cookie': { session_token: string } }> {
    window.location.href = `${window.location.origin}/admin`
    throw new ApiError('請到管理後台登錄', 'error')
  }

  /** 登出（跳轉 /admin） */
  logout(): void {
    window.location.href = `${window.location.origin}/admin`
  }

  /** OAuth 登錄（跳轉 /admin） */
  oauthLogin(): void {
    window.location.href = `${window.location.origin}/admin`
  }

  /** 獲取所有節點基本信息（CFSM：/api/servers） */
  async getNodes(): Promise<NodeInfo[]> {
    const response = await cfsmFetch<ServersResponseWire>('/api/servers')
    return (response?.servers ?? []).map((server) => {
      const uuid = String(server.id)
      const expiredAt = String(server.expire_date || '9999-12-31')
      return {
        uuid,
        name: String(server.name || uuid),
        cpu_name: String(server.cpu_info || '-'),
        virtualization: '-',
        arch: String(server.arch || '-'),
        cpu_cores: finiteNumber(server.cpu_cores),
        os: String(server.os || '-'),
        kernel_version: String(server.kernel_version || '-'),
        gpu_name: '',
        region: String(server.region || '').toUpperCase(),
        mem_total: finiteNumber(server.ram_total) * MB,
        swap_total: finiteNumber(server.swap_total) * MB,
        disk_total: finiteNumber(server.disk_total) * MB,
        weight: finiteNumber(server.sort_order),
        price: finiteNumber(server.price),
        billing_cycle: finiteNumber(server.billing_cycle),
        auto_renewal: enabled(server.auto_renewal),
        currency: String(server.currency || 'CNY'),
        expired_at: expiredAt,
        group: String(server.server_group || '默认分组'),
        tags: String(server.tags || ''),
        public_remark: '',
        hidden: false,
        traffic_limit: finiteNumber(server.traffic_limit),
        traffic_limit_type: String(server.traffic_calc_type || 'sum'),
        created_at: '',
        updated_at: '',
      }
    })
  }

  /** 獲取指定節點最近狀態（CFSM：/api/server?id=） */
  async getNodeRecentStatus(uuid: string): Promise<RealtimeStatus[]> {
    const server = await cfsmFetch<Record<string, unknown>>(`/api/server?id=${encodeURIComponent(uuid)}`)
    const cpu = finiteNumber(server.cpu)
    const ramTotal = finiteNumber(server.ram_total) * MB
    const ramUsed = finiteNumber(server.ram_used) * MB
    return [{
      cpu: { usage: cpu },
      ram: { total: ramTotal, used: ramUsed },
      swap: { total: finiteNumber(server.swap_total) * MB, used: finiteNumber(server.swap_used) * MB },
      load: {
        load1: finiteNumber(String(server.load_avg || '').split(/\s+/)[0]),
        load5: finiteNumber(String(server.load_avg || '').split(/\s+/)[1]),
        load15: finiteNumber(String(server.load_avg || '').split(/\s+/)[2]),
      },
      disk: { total: finiteNumber(server.disk_total) * MB, used: finiteNumber(server.disk_used) * MB },
      network: {
        up: finiteNumber(server.net_out_speed),
        down: finiteNumber(server.net_in_speed),
        totalUp: finiteNumber(server.net_tx),
        totalDown: finiteNumber(server.net_rx),
      },
      connections: { tcp: finiteNumber(server.tcp_conn), udp: finiteNumber(server.udp_conn) },
      uptime: Math.max(0, Math.floor((Date.now() - timestamp(server.boot_time, 0)) / 1000)),
      process: finiteNumber(server.processes),
      message: '',
      updated_at: new Date(timestamp(server.last_updated ?? server.timestamp, Date.now())).toISOString(),
    }]
  }

  /** 獲取指定節點負載歷史（CFSM：/api/history/all） */
  async getLoadRecords(uuid: string, hours: number): Promise<LoadRecordsResponse> {
    const rows = await cfsmFetch<HistoryRowWire[]>(`/api/history/all?id=${encodeURIComponent(uuid)}&hours=${hours}`)
    const records: LoadRecord[] = (rows ?? []).map(row => ({
      client: uuid,
      time: new Date(timestamp(row.timestamp)).toISOString(),
      cpu: finiteNumber(row.cpu),
      gpu: finiteNumber(row.gpu),
      ram: finiteNumber(row.ram_used) * MB,
      ram_total: finiteNumber(row.ram_total) * MB,
      swap: finiteNumber(row.swap_used) * MB,
      swap_total: finiteNumber(row.swap_total) * MB,
      load: finiteNumber(String(row.load_avg || '').split(/\s+/)[0]),
      temp: 0,
      disk: finiteNumber(row.disk_used) * MB,
      disk_total: finiteNumber(row.disk_total) * MB,
      net_in: finiteNumber(row.net_in_speed ?? row.net_in),
      net_out: finiteNumber(row.net_out_speed ?? row.net_out),
      net_total_up: finiteNumber(row.net_tx ?? row.net_total_up),
      net_total_down: finiteNumber(row.net_rx ?? row.net_total_down),
      process: finiteNumber(row.processes ?? row.process),
      connections: finiteNumber(row.tcp_conn ?? row.connections),
      connections_udp: finiteNumber(row.udp_conn ?? row.connections_udp),
    }))
    return { count: records.length, records }
  }

  /** 獲取指定節點 Ping 歷史（CFSM：/api/history/all 的 ping_* 字段） */
  async getPingRecords(uuid: string, hours: number): Promise<PingRecordsResponse> {
    const rows = await cfsmFetch<HistoryRowWire[]>(`/api/history/all?id=${encodeURIComponent(uuid)}&hours=${hours}`)
    const PING_TASKS = [
      { id: 1, key: 'ping_ct', name: '电信' },
      { id: 2, key: 'ping_cu', name: '联通' },
      { id: 3, key: 'ping_cm', name: '移动' },
      { id: 4, key: 'ping_bd', name: 'BGP' },
    ] as const

    const records: PingRecord[] = []
    const taskLoss: Record<number, number[]> = {}

    for (const row of rows ?? []) {
      const time = new Date(timestamp(row.timestamp)).toISOString()
      for (const task of PING_TASKS) {
        const latencyValue = row[task.key]
        const lossValue = finiteNumber(row[`loss_${task.key.replace('ping_', '')}`])
        if (latencyValue === undefined)
          continue
        const latency = finiteNumber(latencyValue)
        records.push({ task_id: task.id, time, value: lossValue >= 100 || latency <= 0 ? -1 : latency })
        const losses = taskLoss[task.id] ?? []
        losses.push(lossValue)
        taskLoss[task.id] = losses
      }
    }

    const tasks: PingTask[] = PING_TASKS.map(task => ({
      id: task.id,
      interval: 60,
      name: task.name,
      loss: (taskLoss[task.id] ?? []).reduce((sum, value) => sum + value, 0) / Math.max(1, taskLoss[task.id]?.length ?? 0),
    }))

    return { count: records.length, records, tasks }
  }

  /** 獲取管理後台數據庫占用（CFSM 不提供，返回空） */
  async getDatabaseSize(): Promise<DatabaseSizeInfo> {
    return {}
  }
}

// ==================== WebSocket 实时状态客户端（適配為 CFSM 推送） ====================

/** WebSocket 實時狀態客戶端（CFSM：/api/ws?subscribe=all 推送模式） */
export class RealtimeWebSocket {
  private ws: WebSocket | null = null
  private url: string
  private reconnectInterval: number
  private maxReconnectAttempts: number
  private reconnectAttempts = 0
  private listeners: Set<(data: WebSocketRealtimeResponse) => void> = new Set()
  private errorListeners: Set<(error: Event) => void> = new Set()
  private isOpen = false
  private registeredIds: string[] = []
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null

  constructor(options: {
    baseUrl?: string
    reconnectInterval?: number
    maxReconnectAttempts?: number
  } = {}) {
    const bases = getApiBases()
    const base = normalizeBase(options.baseUrl || bases[0] || window.location.origin)
    const url = new URL(base)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.pathname = '/api/ws'
    url.searchParams.set('subscribe', 'all')
    this.url = url.toString()
    this.reconnectInterval = options.reconnectInterval || 3000
    this.maxReconnectAttempts = options.maxReconnectAttempts || 5
  }

  setRegisteredIds(ids: string[]): void {
    this.registeredIds = ids
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          this.isOpen = true
          this.reconnectAttempts = 0
          if (this.registeredIds.length > 0) {
            this.ws!.send(JSON.stringify({ type: 'subscribe', scope: 'all', ids: this.registeredIds }))
          }
          this.heartbeatTimer = setInterval(() => {
            if (this.ws?.readyState === WebSocket.OPEN)
              this.ws.send(JSON.stringify({ type: 'ping', ts: Date.now() }))
          }, 30000)
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            if (message.type === 'batchUpdate') {
              // 轉換為原版 WebSocketRealtimeResponse 形狀
              const online: string[] = []
              const data: Record<string, RealtimeStatus> = {}
              for (const update of message.updates ?? []) {
                online.push(update.serverId)
                const sample = update.samples?.[update.samples.length - 1]
                const d = sample?.data ?? sample?.payload ?? sample?.metrics ?? {}
                data[update.serverId] = {
                  cpu: { usage: Number(d.cpu ?? 0) },
                  ram: {
                    total: Number(d.ram_total ?? 0) * 1024 * 1024,
                    used: Number(d.ram_used ?? 0) * 1024 * 1024,
                  },
                  swap: {
                    total: Number(d.swap_total ?? 0) * 1024 * 1024,
                    used: Number(d.swap_used ?? 0) * 1024 * 1024,
                  },
                  load: {
                    load1: Number(String(d.load_avg ?? '').split(/\s+/)[0] ?? 0),
                    load5: Number(String(d.load_avg ?? '').split(/\s+/)[1] ?? 0),
                    load15: Number(String(d.load_avg ?? '').split(/\s+/)[2] ?? 0),
                  },
                  disk: {
                    total: Number(d.disk_total ?? 0) * 1024 * 1024,
                    used: Number(d.disk_used ?? 0) * 1024 * 1024,
                  },
                  network: {
                    up: Number(d.net_out_speed ?? d.net_out ?? 0),
                    down: Number(d.net_in_speed ?? d.net_in ?? 0),
                    totalUp: Number(d.net_tx ?? 0),
                    totalDown: Number(d.net_rx ?? 0),
                  },
                  connections: {
                    tcp: Number(d.tcp_conn ?? d.connections ?? 0),
                    udp: Number(d.udp_conn ?? 0),
                  },
                  uptime: Number(d.uptime ?? 0),
                  process: Number(d.processes ?? d.process ?? 0),
                  message: '',
                  updated_at: new Date(Number(sample?.ts ?? Date.now())).toISOString(),
                }
              }
              const payload: WebSocketRealtimeResponse = {
                status: 'success',
                data: { online, data },
              }
              this.listeners.forEach(listener => listener(payload))
            }
          }
          catch {
            // Ignore parse errors
          }
        }

        this.ws.onerror = (error) => {
          this.errorListeners.forEach(listener => listener(error))
          if (!this.isOpen)
            reject(new ApiError('WebSocket connection failed', 'error'))
        }

        this.ws.onclose = () => {
          this.isOpen = false
          if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer)
            this.heartbeatTimer = null
          }
          this.attemptReconnect()
        }
      }
      catch (error) {
        reject(new ApiError(`WebSocket error: ${error instanceof Error ? error.message : String(error)}`, 'error'))
      }
    })
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      setTimeout(() => {
        this.connect().catch(() => {
          // Ignore reconnect errors
        })
      }, this.reconnectInterval)
    }
  }

  requestData(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN && this.registeredIds.length > 0) {
      this.ws.send(JSON.stringify({ type: 'subscribe', scope: 'all', ids: this.registeredIds }))
    }
  }

  subscribe(callback: (data: WebSocketRealtimeResponse) => void): () => void {
    this.listeners.add(callback)
    return () => {
      this.listeners.delete(callback)
    }
  }

  onError(callback: (error: Event) => void): () => void {
    this.errorListeners.add(callback)
    return () => {
      this.errorListeners.delete(callback)
    }
  }

  close(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isOpen = false
    this.listeners.clear()
    this.errorListeners.clear()
  }

  get connected(): boolean {
    return this.isOpen && this.ws?.readyState === WebSocket.OPEN
  }
}

// ==================== 单例实例 ====================

let sharedApiInstance: KomariApi | null = null

export function getSharedApi(options?: ApiClientOptions): KomariApi {
  if (!sharedApiInstance)
    sharedApiInstance = new KomariApi(options)
  return sharedApiInstance
}

export function resetSharedApi(): void {
  sharedApiInstance = null
}

// 為 rpc.ts 提供 PublicInfo 轉換（getPublicInfo 直接返回 PublicSettings 結構）
export type { PublicInfo }
export default KomariApi
