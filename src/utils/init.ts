/**
 * 应用初始化模块
 * 负责应用启动时的初始化流程和 WebSocket 连接管理
 */

import type { Client, KomariRpc, NodeStatus } from '@/utils/rpc'
import { h } from 'vue'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { getSharedApi } from '@/utils/api'
import { getSharedRpc, RpcError } from '@/utils/rpc'

/** 初始化配置 */
interface InitConfig {
  /** WebSocket 重连间隔（毫秒） */
  wsReconnectInterval?: number
  /** WebSocket 最大重连次数（失败后暂停实时更新） */
  wsMaxReconnectAttempts?: number
  /** 后端健康检查超时（毫秒） */
  healthCheckTimeout?: number
}

const DEFAULT_CONFIG: Required<InitConfig> = {
  wsReconnectInterval: 3000,
  wsMaxReconnectAttempts: 5,
  healthCheckTimeout: 5000,
}

/**
 * 首页实时更新只使用 /api/ws?subscribe=all。
 * 详情页进入时只请求一次 /api/server?id=<id> 作为基础快照，后续更新由
 * /api/ws?subscribe=<id> 的 batchUpdate 推送驱动。
 */
let pendingFocusedNodeId: string | null = null

/** 初始化状态管理 */
class InitManager {
  private config: Required<InitConfig>
  private rpc: KomariRpc
  private appStore: ReturnType<typeof useAppStore>
  private nodesStore: ReturnType<typeof useNodesStore>
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private isInitialized = false
  private isDestroyed = false
  private useWebSocket: boolean | null = null
  private postFailureCount = 0
  private focusedNodeId: string | null = pendingFocusedNodeId
  /** WebSocket 實時狀態訂閱的取消函數（常駐，註冊一次） */
  private wsLiveStatusOff: (() => void) | null = null

  constructor(config: InitConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.rpc = getSharedRpc()
    this.appStore = useAppStore()
    this.nodesStore = useNodesStore()
  }

  /**
   * 执行初始化流程
   */
  async init(): Promise<void> {
    if (this.isInitialized) {
      console.warn('[InitManager] Already initialized')
      return
    }

    this.isDestroyed = false

    try {
      // 健康检查与首屏数据并行，避免公开站点额外等待一次网络往返。
      // allSettled 同时避免私有站点的数据请求在 401 时产生未处理的拒绝。
      const [healthResult, bootstrapResult] = await Promise.allSettled([
        this.healthCheck(),
        this.fetchBootstrapData(),
      ])

      if (this.isDestroyed) {
        return
      }

      if (healthResult.status === 'rejected') {
        throw healthResult.reason
      }

      // 私有站强制登录时保留骨架，等待登录后重入
      if (this.appStore.requireLogin) {
        return
      }

      if (bootstrapResult.status === 'rejected') {
        throw bootstrapResult.reason
      }

      // 3. 解除加载状态
      this.appStore.loading = false

      // 4. 建立 WebSocket 连接并开始轮询
      this.startWebSocketAndPolling()

      this.isInitialized = true
    }
    catch (error) {
      console.error('[InitManager] Initialization failed:', error)
      // 即使失败也解除加载状态，显示错误页面
      this.appStore.loading = false
      throw error
    }
  }

  /**
   * 健康检查 - 测试后端服务是否正常
   * 如果返回 401，说明是私有站点，需要强制登录
   */
  private async healthCheck(): Promise<void> {
    try {
      const result = await this.rpc.ping(this.config.healthCheckTimeout)
      if (result !== 'pong') {
        throw new RpcError(-32000, 'Unexpected health check response')
      }
    }
    catch (error) {
      // 检查是否为 401 错误（私有站点需要登录）
      if (error instanceof RpcError && error.code === 401) {
        console.warn('[InitManager] Private site detected, requiring login')
        this.appStore.requireLogin = true
        await this.showForceLoginModal()
        return
      }
      console.error('[InitManager] Health check failed:', error)
      this.appStore.connectionError = true
      throw new Error('Backend service unavailable')
    }
  }

  /**
   * 显示强制登录 Modal
   * 用于私有站点，用户必须登录才能访问
   */
  private async showForceLoginModal(): Promise<void> {
    const { default: LoginDialog } = await import('@/components/LoginDialog.vue')

    // 保留 loading，壳层骨架继续展示在登录遮罩后方
    window.$modal.create({
      title: '登录',
      preset: 'dialog',
      showIcon: false,
      closeOnEsc: false,
      maskClosable: false,
      closable: false,
      autoFocus: true,
      content: () => h(LoginDialog, {
        forceLogin: true,
        onLoginSuccess: () => {
          // 登录成功后重新初始化
          this.reinitAfterForceLogin()
        },
      }),
    })
  }

  /**
   * 强制登录成功后重新初始化
   */
  private async reinitAfterForceLogin(): Promise<void> {
    // 重置登录要求状态
    this.appStore.requireLogin = false
    this.appStore.loading = true

    // 关闭登录 Modal
    window.$modal?.destroyAll()

    try {
      // 重新并行执行初始化数据拉取
      await this.fetchBootstrapData()

      // 解除加载状态
      this.appStore.loading = false

      // 建立 WebSocket 连接并开始轮询
      this.startWebSocketAndPolling()

      this.isInitialized = true
    }
    catch (error) {
      console.error('[InitManager] Re-initialization after login failed:', error)
      this.appStore.connectionError = true
      this.appStore.loading = false
    }
  }

  /**
   * 并行拉取首屏所需的配置、用户与节点数据
   */
  private async fetchBootstrapData(): Promise<void> {
    const results = await Promise.allSettled([
      this.fetchPublicSettings(),
      this.fetchUserInfo(),
      this.fetchNodesData(),
    ])

    const nodesResult = results[2]
    if (nodesResult.status === 'rejected') {
      throw nodesResult.reason
    }
  }

  /**
   * 获取服务端公开属性
   */
  private async fetchPublicSettings(): Promise<void> {
    try {
      const api = getSharedApi()
      const publicSettings = await api.getPublicSettings()
      this.appStore.publicSettings = publicSettings
    }
    catch (error) {
      console.error('[InitManager] Failed to fetch public settings:', error)
      // 非关键错误，继续初始化
    }
  }

  /**
   * 获取用户信息
   */
  private async fetchUserInfo(): Promise<void> {
    try {
      const api = getSharedApi()
      const userInfo = await api.getMe()
      this.appStore.setUserInfo(userInfo)
    }
    catch (error) {
      console.error('[InitManager] Failed to fetch user info:', error)
      // 非关键错误，继续初始化
    }
  }

  /**
   * 获取节点数据和最新状态
   */
  private async fetchNodesData(): Promise<void> {
    try {
      if (this.focusedNodeId) {
        await this.fetchFocusedNodeData(this.focusedNodeId, true)
        return
      }

      // 并行获取节点信息和最新状态
      const [clientsResult, statusesResult] = await Promise.all([
        this.rpc.getNodes() as Promise<Record<string, Client>>,
        this.rpc.getNodesLatestStatus() as Promise<Record<string, NodeStatus>>,
      ])

      // 初始化节点数据
      this.nodesStore.initNodes(clientsResult, statusesResult)
    }
    catch (error) {
      console.error('[InitManager] Failed to fetch nodes data:', error)
      throw error
    }
  }

  private async fetchFocusedNodeData(uuid: string, replace = false): Promise<void> {
    const snapshot = await this.rpc.getNodeSnapshot(uuid)
    if (replace)
      this.nodesStore.initNodes({ [uuid]: snapshot.client }, { [uuid]: snapshot.status })
    else
      this.nodesStore.upsertNode(snapshot.client, snapshot.status)
  }

  /**
   * 启动 WebSocket 连接；首页和详情页实时更新都只走 WS
   */
  private startWebSocketAndPolling(): void {
    this.useWebSocket = true

    // 訂閱 WebSocket 實時狀態推送（僅註冊一次；監聽器常駐於 RpcClient 單例）。
    // 首頁由 /api/ws?subscribe=all 推送更新，不再啟動 HTTP 全量輪詢。
    if (!this.wsLiveStatusOff) {
      this.wsLiveStatusOff = this.rpc.onLiveStatus((statuses) => {
        if (this.isDestroyed)
          return
        this.nodesStore.updateNodeStatuses(statuses)
        this.postFailureCount = 0
        this.appStore.connectionError = false
      })
    }

    this.connectWebSocket()
  }

  /**
   * 建立 WebSocket 连接
   */
  private async connectWebSocket(): Promise<void> {
    // 实时更新只使用 WebSocket；关闭或销毁后不再尝试连接
    if (this.useWebSocket !== true) {
      return
    }

    const client = this.rpc.getClient()

    // 切换到 WebSocket 模式
    client.setTransport(true)
    this.nodesStore.updateWsState('connecting', this.nodesStore.wsReconnectAttempts)

    try {
      // 使用 ping 验证连接，10 秒超时
      await client.ensureWebSocketConnectedWithPing(10000)
      if (this.isDestroyed || this.useWebSocket !== true) {
        client.close()
        return
      }

      this.clearReconnectTimer()
      this.nodesStore.updateWsState('connected', 0)
      this.postFailureCount = 0

      // 连接成功，重置错误状态
      this.appStore.connectionError = false

      // 监听连接状态变化
      this.monitorWebSocketConnection()
    }
    catch (error) {
      if (this.isDestroyed || this.useWebSocket !== true) {
        return
      }

      console.error('[InitManager] WebSocket connection failed:', error)
      this.nodesStore.updateWsState('disconnected')
      this.scheduleReconnect()
    }
  }

  /**
   * 监控 WebSocket 连接状态
   */
  private monitorWebSocketConnection(): void {
    const client = this.rpc.getClient()
    const ws = client.getWebSocket()

    if (!ws) {
      return
    }

    ws.addEventListener('close', () => {
      // 如果当前是已连接状态且还在使用 WebSocket 模式，触发重连
      if (this.useWebSocket === true && this.nodesStore.wsConnectionState === 'connected') {
        this.nodesStore.updateWsState('disconnected')
        this.scheduleReconnect()
      }
    })

    ws.addEventListener('error', () => {
      console.error('[InitManager] WebSocket error')
    })
  }

  /**
   * 安排重连
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.useWebSocket !== true) {
      return
    }

    const attempts = this.nodesStore.wsReconnectAttempts

    // 达到最大重连次数后停止重连，不回落到全量 HTTP 轮询
    if (attempts >= this.config.wsMaxReconnectAttempts) {
      console.error('[InitManager] Max reconnect attempts reached')
      this.nodesStore.updateWsState('disconnected', this.config.wsMaxReconnectAttempts)
      this.appStore.connectionError = true
      window.$message?.warning('WebSocket 无法连接，实时更新已暂停。')
      return
    }

    // 首次失败时显示提示
    if (attempts === 0) {
      window.$message?.error('WebSocket 建立失败，正在尝试重连。')
    }

    this.nodesStore.updateWsState('reconnecting', attempts + 1)

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (this.useWebSocket !== true) {
        return
      }

      const client = this.rpc.getClient()
      client.close()
      void this.connectWebSocket()
    }, this.config.wsReconnectInterval)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  setFocusedNodeId(uuid: string | null): void {
    if (this.focusedNodeId === uuid)
      return

    this.focusedNodeId = uuid

    if (!this.isInitialized || this.isDestroyed)
      return

    if (uuid)
      void this.fetchFocusedNodeData(uuid)
  }

  /**
   * 登录后重新连接 WebSocket
   * 断开现有连接，重置状态，重新建立连接
   */
  async reconnectAfterLogin(): Promise<void> {
    this.clearReconnectTimer()
    const client = this.rpc.getClient()

    // 关闭现有 WebSocket 连接
    if (client.getWsReadyState() !== WebSocket.CLOSED) {
      client.close()
    }

    // 登录后仍只使用 WebSocket 实时更新，不回落到全量 HTTP 轮询
    this.useWebSocket = true
    this.nodesStore.updateWsState('disconnected', 0)

    // 重新获取用户信息
    await this.fetchUserInfo()

    if (this.isDestroyed) {
      return
    }

    void this.connectWebSocket()
  }

  /**
   * 销毁管理器
   */
  destroy(): void {
    this.isDestroyed = true
    this.clearReconnectTimer()
    this.useWebSocket = false
    this.postFailureCount = 0
    this.wsLiveStatusOff?.()
    this.wsLiveStatusOff = null
    this.rpc.close()
    this.nodesStore.clearNodes()
    this.isInitialized = false
  }
}

// 单例实例
let initManager: InitManager | null = null

/**
 * 初始化应用
 */
export async function initApp(): Promise<void> {
  if (!initManager) {
    initManager = new InitManager()
  }

  await initManager.init()
}

/**
 * 获取初始化管理器实例
 */
export function getInitManager(): InitManager | null {
  return initManager
}

export function setFocusedNodeId(uuid: string | null): void {
  pendingFocusedNodeId = uuid
  getSharedRpc().getClient().setWsFocus(uuid)
  initManager?.setFocusedNodeId(uuid)
}

/**
 * 销毁初始化管理器
 */
export function destroyInitManager(): void {
  if (initManager) {
    initManager.destroy()
    initManager = null
  }
  pendingFocusedNodeId = null
}

/**
 * 登录后重新连接
 * 断开现有 WebSocket 连接并以登录状态重新建立
 */
export async function reconnectAfterLogin(): Promise<void> {
  if (initManager) {
    await initManager.reconnectAfterLogin()
  }
}
