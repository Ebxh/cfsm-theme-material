import type { Client, NodeStatus } from '@/utils/rpc'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/** 流量限制类型 */
export type TrafficLimitType = 'up' | 'down' | 'min' | 'max' | 'sum'

/** 节点完整信息（合并 Client 和 Status） */
export interface NodeData {
  uuid: string
  // Client 信息
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
  traffic_limit_type: TrafficLimitType
  created_at: string
  updated_at: string
  boot_time: string
  // Status 信息
  online: boolean
  time: string
  cpu: number
  gpu: number
  ram: number
  swap: number
  load: number
  load5: number
  load15: number
  temp: number
  disk: number
  net_in: number
  net_out: number
  net_total_up: number
  net_total_down: number
  process: number
  connections: number
  connections_udp: number
  uptime: number
}

/** WebSocket 连接状态 */
export type WsConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

/** 首页速率曲线的时间窗口（30 秒） */
export const NETWORK_RATE_HISTORY_WINDOW_MS = 30 * 1000

/** 速率 EMA 平滑系数：越小越平滑，越大越跟手（0.3 ≈ 兼顾响应与平滑） */
const RATE_SMOOTHING_ALPHA = 0.3

export interface NetworkRateHistoryPoint {
  time: string
  up: number
  down: number
}

/** 状态数据（用于更新） */
interface StatusData {
  online: boolean
  time: string
  cpu: number
  gpu: number
  ram: number
  swap: number
  load: number
  load5: number
  load15: number
  temp: number
  disk: number
  net_in: number
  net_out: number
  net_total_up: number
  net_total_down: number
  process: number
  connections: number
  connections_udp: number
  uptime: number
}

const useNodesStore = defineStore('nodes', () => {
  // ===== 状态 =====
  const nodes = ref<NodeData[]>([])
  const networkRateHistory = ref<NetworkRateHistoryPoint[]>([])
  const wsConnectionState = ref<WsConnectionState>('disconnected')
  const wsReconnectAttempts = ref<number>(0)
  /** 速率 EMA 平滑緩衝（未初始化時為 null） */
  let smoothedRate: { up: number, down: number } | null = null
  /**
   * 節點顯示速率平滑緩衝（uuid → EMA 平滑後的 net_in/net_out）。
   * CFSM 每秒推送一次瞬時速率（實測抖動可達 300 倍），
   * 卡片與總覽的速率數字若直接顯示原始值會劇烈跳動，故統一用此緩衝。
   */
  const displayRates = reactive<Record<string, { netIn: number, netOut: number }>>({})

  /** 首次取得該節點速率時直接賦值（無歷史可平滑） */
  function setDisplayRate(uuid: string, netIn: number, netOut: number): void {
    displayRates[uuid] = { netIn, netOut }
  }

  /** 對節點速率做 EMA 平滑並寫入顯示緩衝 */
  function smoothDisplayRate(uuid: string, netIn: number, netOut: number): void {
    const prev = displayRates[uuid]
    if (!prev) {
      displayRates[uuid] = { netIn, netOut }
      return
    }
    const alpha = RATE_SMOOTHING_ALPHA
    displayRates[uuid] = {
      netIn: alpha * netIn + (1 - alpha) * prev.netIn,
      netOut: alpha * netOut + (1 - alpha) * prev.netOut,
    }
  }

  // ===== 计算属性 =====
  /** 在线节点数量 */
  const onlineCount = computed(() => nodes.value.filter(n => n.online).length)

  /** 总节点数量 */
  const totalCount = computed(() => nodes.value.length)

  /** 所有分组 */
  const groups = computed(() => {
    const groupSet = new Set<string>()
    nodes.value.forEach((n) => {
      if (n.group)
        groupSet.add(n.group)
    })
    return Array.from(groupSet)
  })

  /** 按 UUID 索引的节点映射 */
  const nodesByUuid = computed(() => {
    const map = new Map<string, NodeData>()
    nodes.value.forEach((n) => {
      map.set(n.uuid, n)
    })
    return map
  })

  function recordNetworkRateSample(): void {
    const timestamp = Date.now()
    const rawUp = nodes.value.reduce((sum, node) => {
      if (!node.online || !Number.isFinite(node.net_out))
        return sum
      return sum + Math.max(0, node.net_out)
    }, 0)
    const rawDown = nodes.value.reduce((sum, node) => {
      if (!node.online || !Number.isFinite(node.net_in))
        return sum
      return sum + Math.max(0, node.net_in)
    }, 0)

    // CFSM 實時推送的瞬時速率抖動明顯，對樣本做 EMA 平滑，
    // 令首頁速率曲線不再隨單個採樣點劇烈跳動。
    const alpha = RATE_SMOOTHING_ALPHA
    const up = smoothedRate ? alpha * rawUp + (1 - alpha) * smoothedRate.up : rawUp
    const down = smoothedRate ? alpha * rawDown + (1 - alpha) * smoothedRate.down : rawDown
    smoothedRate = { up, down }

    const cutoff = timestamp - NETWORK_RATE_HISTORY_WINDOW_MS

    networkRateHistory.value = [
      ...networkRateHistory.value.filter(point => Date.parse(point.time) >= cutoff),
      {
        time: new Date(timestamp).toISOString(),
        up,
        down,
      },
    ]
  }

  // ===== 方法 =====

  /**
   * 从 Client 对象创建节点数据
   */
  function createNodeFromClient(client: Client): NodeData {
    return {
      uuid: client.uuid,
      name: client.name,
      cpu_name: client.cpu_name,
      virtualization: client.virtualization,
      arch: client.arch,
      cpu_cores: client.cpu_cores,
      os: client.os,
      kernel_version: client.kernel_version,
      gpu_name: client.gpu_name,
      ipv4: client.ipv4,
      ipv6: client.ipv6,
      region: client.region,
      remark: client.remark,
      public_remark: client.public_remark,
      mem_total: client.mem_total,
      swap_total: client.swap_total,
      disk_total: client.disk_total,
      version: client.version,
      weight: client.weight,
      price: client.price,
      billing_cycle: client.billing_cycle,
      auto_renewal: client.auto_renewal,
      currency: client.currency,
      expired_at: client.expired_at,
      group: client.group,
      tags: client.tags,
      hidden: client.hidden,
      traffic_limit: client.traffic_limit,
      traffic_limit_type: client.traffic_limit_type as TrafficLimitType,
      created_at: client.created_at,
      updated_at: client.updated_at,
      boot_time: client.boot_time,
      // Status 默认值
      online: false,
      time: '',
      cpu: 0,
      gpu: 0,
      ram: 0,
      swap: 0,
      load: 0,
      load5: 0,
      load15: 0,
      temp: 0,
      disk: 0,
      net_in: 0,
      net_out: 0,
      net_total_up: 0,
      net_total_down: 0,
      process: 0,
      connections: 0,
      connections_udp: 0,
      uptime: 0,
    }
  }

  /**
   * 更新节点的状态数据
   */
  function updateNodeStatus(node: NodeData, status: StatusData): NodeData {
    return {
      ...node,
      online: status.online,
      time: status.time,
      cpu: status.cpu,
      gpu: status.gpu,
      ram: status.ram,
      swap: status.swap,
      load: status.load,
      load5: status.load5,
      load15: status.load15,
      temp: status.temp,
      disk: status.disk,
      net_in: status.net_in,
      net_out: status.net_out,
      net_total_up: status.net_total_up,
      net_total_down: status.net_total_down,
      process: status.process,
      connections: status.connections,
      connections_udp: status.connections_udp,
      uptime: status.uptime,
    }
  }

  /**
   * 从 NodeStatus 提取状态数据
   */
  function extractStatusData(status: NodeStatus): StatusData {
    return {
      online: status.online,
      time: status.time,
      cpu: status.cpu,
      gpu: status.gpu,
      ram: status.ram,
      swap: status.swap,
      load: status.load,
      load5: status.load5,
      load15: status.load15,
      temp: status.temp,
      disk: status.disk,
      net_in: status.net_in,
      net_out: status.net_out,
      net_total_up: status.net_total_up,
      net_total_down: status.net_total_down,
      process: status.process,
      connections: status.connections,
      connections_udp: status.connections_udp,
      uptime: status.uptime,
    }
  }

  /**
   * 初始化节点数据（首次加载）
   */
  function initNodes(clients: Record<string, Client>, statuses: Record<string, NodeStatus>): void {
    networkRateHistory.value = []
    smoothedRate = null
    const uuids = Object.keys(clients)
    const existingUuids = new Set(nodes.value.map(n => n.uuid))

    // 更新现有节点或添加新节点
    uuids.forEach((uuid) => {
      const client = clients[uuid]
      if (!client)
        return

      const status = statuses[uuid]
      const index = nodes.value.findIndex(n => n.uuid === uuid)

      if (existingUuids.has(uuid) && index !== -1) {
        // 更新现有节点
        const baseNode = createNodeFromClient(client)
        nodes.value[index] = status
          ? updateNodeStatus(baseNode, extractStatusData(status))
          : baseNode
      }
      else {
        // 添加新节点
        const newNode = createNodeFromClient(client)
        nodes.value.push(status
          ? updateNodeStatus(newNode, extractStatusData(status))
          : newNode,
        )
      }
    })

    // 移除不存在的节点
    const newUuids = new Set(uuids)
    for (let i = nodes.value.length - 1; i >= 0; i--) {
      const node = nodes.value[i]
      if (node && !newUuids.has(node.uuid)) {
        nodes.value.splice(i, 1)
      }
    }

    // 按 weight 升序排序（weight 越小越靠前）
    sortNodesByWeight()
    // 首幀直接賦值顯示速率（無歷史可平滑）
    for (const node of nodes.value)
      setDisplayRate(node.uuid, node.net_in, node.net_out)
    recordNetworkRateSample()
  }

  /**
   * 按 weight 升序排序节点（weight 越小越靠前）
   */
  function sortNodesByWeight(): void {
    nodes.value.sort((a, b) => a.weight - b.weight)
  }

  /**
   * 更新节点状态（实时更新）
   */
  function updateNodeStatuses(statuses: Record<string, NodeStatus>): void {
    Object.entries(statuses).forEach(([uuid, status]) => {
      const index = nodes.value.findIndex(n => n.uuid === uuid)
      if (index === -1)
        return

      const node = nodes.value[index]
      if (!node)
        return

      nodes.value[index] = updateNodeStatus(node, extractStatusData(status))
      smoothDisplayRate(uuid, status.net_in, status.net_out)
    })
    recordNetworkRateSample()
  }

  /**
   * 更新节点基本信息
   */
  function updateNodeClients(clients: Record<string, Client>): void {
    const newUuids = new Set(Object.keys(clients))

    // 更新现有节点信息或添加新节点
    Object.entries(clients).forEach(([uuid, client]) => {
      const index = nodes.value.findIndex(n => n.uuid === uuid)

      if (index !== -1) {
        // 更新现有节点，保留状态信息
        const currentNode = nodes.value[index]
        if (!currentNode)
          return

        const baseNode = createNodeFromClient(client)
        nodes.value[index] = updateNodeStatus(baseNode, {
          online: currentNode.online,
          time: currentNode.time,
          cpu: currentNode.cpu,
          gpu: currentNode.gpu,
          ram: currentNode.ram,
          swap: currentNode.swap,
          load: currentNode.load,
          load5: currentNode.load5,
          load15: currentNode.load15,
          temp: currentNode.temp,
          disk: currentNode.disk,
          net_in: currentNode.net_in,
          net_out: currentNode.net_out,
          net_total_up: currentNode.net_total_up,
          net_total_down: currentNode.net_total_down,
          process: currentNode.process,
          connections: currentNode.connections,
          connections_udp: currentNode.connections_udp,
          uptime: currentNode.uptime,
        })
      }
      else {
        // 添加新节点（不带状态）
        nodes.value.push(createNodeFromClient(client))
      }
    })

    // 移除不存在的节点
    for (let i = nodes.value.length - 1; i >= 0; i--) {
      const node = nodes.value[i]
      if (node && !newUuids.has(node.uuid)) {
        nodes.value.splice(i, 1)
      }
    }

    // 按 weight 升序排序
    sortNodesByWeight()
  }

  /**
   * 更新或插入单个节点，不移除其他节点。
   * 详情页聚焦单节点时用于合并 /api/server?id= 返回值，避免触发全量 /api/servers。
   */
  function upsertNode(client: Client, status?: NodeStatus): void {
    const index = nodes.value.findIndex(n => n.uuid === client.uuid)
    const baseNode = createNodeFromClient(client)
    const nextNode = status
      ? updateNodeStatus(baseNode, extractStatusData(status))
      : baseNode

    if (index !== -1) {
      const currentNode = nodes.value[index]
      if (!currentNode)
        return
      nodes.value[index] = status
        ? nextNode
        : updateNodeStatus(nextNode, {
            online: currentNode.online,
            time: currentNode.time,
            cpu: currentNode.cpu,
            gpu: currentNode.gpu,
            ram: currentNode.ram,
            swap: currentNode.swap,
            load: currentNode.load,
            load5: currentNode.load5,
            load15: currentNode.load15,
            temp: currentNode.temp,
            disk: currentNode.disk,
            net_in: currentNode.net_in,
            net_out: currentNode.net_out,
            net_total_up: currentNode.net_total_up,
            net_total_down: currentNode.net_total_down,
            process: currentNode.process,
            connections: currentNode.connections,
            connections_udp: currentNode.connections_udp,
            uptime: currentNode.uptime,
          })
    }
    else {
      nodes.value.push(nextNode)
    }

    // 有實時狀態時平滑更新顯示速率；僅更新基本資料時保留原顯示速率
    if (status)
      smoothDisplayRate(client.uuid, status.net_in, status.net_out)

    sortNodesByWeight()
    recordNetworkRateSample()
  }

  /**
   * 更新 WebSocket 连接状态
   */
  function updateWsState(state: WsConnectionState, attempts?: number): void {
    wsConnectionState.value = state
    if (attempts !== undefined) {
      wsReconnectAttempts.value = attempts
    }
  }

  /**
   * 清空所有节点数据
   */
  function clearNodes(): void {
    nodes.value = []
    networkRateHistory.value = []
    smoothedRate = null
    for (const key of Object.keys(displayRates))
      delete displayRates[key]
  }

  return {
    // 状态
    nodes,
    networkRateHistory,
    displayRates,
    wsConnectionState,
    wsReconnectAttempts,
    // 计算属性
    onlineCount,
    totalCount,
    groups,
    nodesByUuid,
    // 方法
    initNodes,
    updateNodeStatuses,
    updateNodeClients,
    upsertNode,
    sortNodesByWeight,
    updateWsState,
    clearNodes,
  }
})

export { useNodesStore }
