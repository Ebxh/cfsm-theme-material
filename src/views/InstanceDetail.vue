<script setup lang="ts">
import { computed, defineAsyncComponent, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import type { HistoryRowWire } from '@/utils/api'
import { useAppStore } from '@/stores/app'
import { useNodesStore } from '@/stores/nodes'
import { adaptHistoryRowsToLoadRecords, adaptHistoryRowsToPingRecords, getSharedApi } from '@/utils/api'
import { setFocusedNodeId } from '@/utils/init'
import { formatBytesPerSecondWithConfig, formatBytesWithConfig, formatDateTime, formatUptimeWithFormat } from '@/utils/helper'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getRegionCode, getRegionDisplayName } from '@/utils/regionHelper'
import { getSharedRpc } from '@/utils/rpc'

const LoadChart = defineAsyncComponent(() => import('@/components/LoadChart.vue'))
const PingChart = defineAsyncComponent(() => import('@/components/PingChart.vue'))

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const nodesStore = useNodesStore()
const chartView = ref<'load' | 'ping'>('load')
const api = getSharedApi()
const rpc = getSharedRpc()

// CFSM /api/history/all 支持的固定窗口；详情页负载和延迟共享同一选择状态。
const historyViews = [
  { label: '10M', hours: 0.167 },
  { label: '30M', hours: 0.5 },
  { label: '1H', hours: 1 },
  { label: '6H', hours: 6 },
  { label: '12H', hours: 12 },
  { label: '24H', hours: 24 },
  { label: '2D', hours: 48 },
  { label: '4D', hours: 96 },
  { label: '7D', hours: 168 },
]
const selectedHistoryView = ref('10M')
const selectedHistoryHours = computed(() => {
  const view = historyViews.find(item => item.label === selectedHistoryView.value)
  return view?.hours ?? 0.167
})
const historyRows = shallowRef<HistoryRowWire[]>([])
const historyLoading = ref(false)
const historyError = ref<string | null>(null)
let latestHistoryFetchId = 0
let stopHistorySamples: (() => void) | null = null

// 詳情頁聚焦單一節點：WS 改為 subscribe=<id>，只接收該節點的實時推送
watch(
  () => route.params.id,
  (id) => {
    const uuid = typeof id === 'string' && id ? id : null
    setFocusedNodeId(uuid)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  setFocusedNodeId(null)
  latestHistoryFetchId += 1
  stopHistorySamples?.()
  stopHistorySamples = null
})

onMounted(() => {
  window.scrollTo({ top: 0, behavior: 'instant' })
  stopHistorySamples = rpc.getClient().onSamples(appendLiveHistoryRows)
})

const formatBytes = (bytes: number) => formatBytesWithConfig(bytes, appStore.byteDecimals)
const formatBytesPerSecond = (bytes: number) => formatBytesPerSecondWithConfig(bytes, appStore.byteDecimals)
const formatUptime = (seconds: number) => formatUptimeWithFormat(seconds, appStore.uptimeFormat)

const data = computed(() => nodesStore.nodes.find(node => node.uuid === route.params.id))
const loadHistoryRecords = computed(() => data.value ? adaptHistoryRowsToLoadRecords(data.value.uuid, historyRows.value) : [])
const pingHistory = computed(() => data.value ? adaptHistoryRowsToPingRecords(data.value.uuid, historyRows.value) : { count: 0, records: [], tasks: [] })
const hasBackgroundBlur = computed(() => appStore.backgroundEnabled && appStore.cardBlurRadius > 0)
const blurClass = computed(() => {
  if (!hasBackgroundBlur.value)
    return ''
  const radius = appStore.cardBlurRadius
  if (radius <= 8)
    return 'glass-8'
  if (radius <= 12)
    return 'glass-12'
  if (radius <= 16)
    return 'glass-16'
  if (radius <= 20)
    return 'glass-20'
  return `glass-${radius}`
})

interface InfoItem {
  label: string
  value: string | undefined
  icon?: string
}

const hardwareInfo = computed<InfoItem[]>(() => [
  { label: 'CPU', value: data.value ? `${data.value.cpu_name} (x${data.value.cpu_cores})` : '-', icon: 'memory' },
  { label: '架构', value: data.value?.arch ?? '-', icon: 'developer_board' },
  { label: '内核', value: data.value?.kernel_version ?? '-', icon: 'code' },
  { label: 'GPU', value: data.value?.gpu_name || '-', icon: 'videocam' },
])

const systemInfo = computed<InfoItem[]>(() => [
  { label: '操作系统', value: data.value?.os ?? '-', icon: 'computer' },
  { label: '启动时间', value: formatDateTime(data.value?.boot_time), icon: 'timer' },
  { label: '运行时间', value: formatUptime(data.value?.uptime ?? 0), icon: 'schedule' },
  { label: '最后上报', value: formatDateTime(data.value?.time), icon: 'update' },
])

const storageInfo = computed<InfoItem[]>(() => [
  { label: '内存', value: formatBytes(data.value?.mem_total ?? 0), icon: 'memory_alt' },
  { label: '内存交换', value: formatBytes(data.value?.swap_total ?? 0), icon: 'swap_horiz' },
  { label: '硬盘', value: formatBytes(data.value?.disk_total ?? 0), icon: 'hard_drive' },
])

function rowTimestamp(row: HistoryRowWire): number {
  const value = Number.parseFloat(String(row.timestamp ?? 0))
  if (!Number.isFinite(value) || value <= 0)
    return 0
  return value < 1e12 ? value * 1000 : value
}

function trimAndSortHistoryRows(rows: HistoryRowWire[]): HistoryRowWire[] {
  const latestTs = rows.reduce((max, row) => Math.max(max, rowTimestamp(row)), Date.now())
  const cutoff = latestTs - selectedHistoryHours.value * 3600_000
  const byTimestamp = new Map<number, HistoryRowWire>()

  for (const row of rows) {
    const ts = rowTimestamp(row)
    if (!ts || ts < cutoff)
      continue
    byTimestamp.set(ts, row)
  }

  return [...byTimestamp.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, row]) => row)
}

async function fetchHistoryData(): Promise<void> {
  const uuid = typeof route.params.id === 'string' ? route.params.id : ''
  if (!uuid) {
    historyRows.value = []
    historyLoading.value = false
    historyError.value = null
    return
  }

  const requestId = ++latestHistoryFetchId
  historyLoading.value = true
  historyError.value = null

  try {
    const rows = await api.getHistoryRecords(uuid, selectedHistoryHours.value)
    if (requestId !== latestHistoryFetchId)
      return
    historyRows.value = trimAndSortHistoryRows(rows ?? [])
  }
  catch (error) {
    if (requestId !== latestHistoryFetchId)
      return
    historyRows.value = []
    historyError.value = error instanceof Error ? error.message : '获取数据失败'
  }
  finally {
    if (requestId === latestHistoryFetchId)
      historyLoading.value = false
  }
}

function appendLiveHistoryRows(samples: Array<{ serverId: string, ts: number, data: Record<string, unknown> }>): void {
  const uuid = typeof route.params.id === 'string' ? route.params.id : ''
  if (!uuid)
    return

  const rows = samples
    .filter(sample => sample.serverId === uuid)
    .map((sample) => {
      const ts = sample.ts || Number(sample.data.last_updated) || Date.now()
      return {
        ...sample.data,
        timestamp: ts,
      } as HistoryRowWire
    })

  if (rows.length === 0)
    return

  historyRows.value = trimAndSortHistoryRows([...historyRows.value, ...rows])
}

watch(
  [() => route.params.id, selectedHistoryHours],
  () => {
    void fetchHistoryData()
  },
  { immediate: true },
)
</script>

<template>
  <div class="instance-detail">
    <div v-if="appStore.loading" class="instance-detail__empty" role="status" aria-live="polite" aria-busy="true">
      <div class="instance-detail__skeleton md-card">
        <div class="instance-detail__skeleton-line instance-detail__skeleton-line--title" />
        <div class="instance-detail__skeleton-line" />
        <div class="instance-detail__skeleton-grid">
          <div v-for="index in 6" :key="index" class="instance-detail__skeleton-block" />
        </div>
        <div class="instance-detail__skeleton-chart" />
      </div>
    </div>

    <div v-else-if="!data" class="instance-detail__empty">
      <div class="md-card md-empty">
        <span class="material-symbols-rounded">search_off</span>
        <span>节点不存在或已被删除</span>
        <md-filled-button @click="router.push('/')">
          返回首页
        </md-filled-button>
      </div>
    </div>

    <template v-else>
      <header class="instance-hero">
        <button class="material-icon-button" type="button" aria-label="返回首页" @click="router.push('/')">
          <span class="material-symbols-rounded">arrow_back</span>
        </button>
        <img class="instance-hero__flag" :src="`/flags/${getRegionCode(data.region).toLowerCase()}.svg`" :alt="getRegionDisplayName(data.region)">
        <div class="instance-hero__title">
          <h1>{{ data.name }}</h1>
          <span class="md-body-small">{{ data.uuid }}</span>
        </div>
        <span class="md-chip" :class="data.online ? 'md-chip--success' : 'md-chip--error'">
          {{ data.online ? '在线' : '离线' }}
        </span>
      </header>

      <section class="instance-info-grid">
        <article class="md-card instance-info-card" :class="[{ 'md-surface-glass': hasBackgroundBlur }, blurClass]">
          <h2 class="md-title-medium">
            硬件信息
          </h2>
          <div class="instance-info-card__grid">
            <div v-for="item in hardwareInfo" :key="item.label" class="instance-info-item">
              <span class="material-symbols-rounded">{{ item.icon }}</span>
              <span class="md-label">{{ item.label }}</span>
              <strong>{{ item.value }}</strong>
            </div>
          </div>
        </article>

        <article class="md-card instance-info-card" :class="[{ 'md-surface-glass': hasBackgroundBlur }, blurClass]">
          <h2 class="md-title-medium">
            系统信息
          </h2>
          <div class="instance-info-card__grid">
            <div v-for="item in systemInfo" :key="item.label" class="instance-info-item">
              <span class="material-symbols-rounded">{{ item.icon }}</span>
              <span class="md-label">{{ item.label }}</span>
              <strong class="instance-info-item__value" :class="{ 'md-number': item.label === '运行时间' || item.label === '最后上报' }">
                <img v-if="item.label === '操作系统'" :src="getOSImage(data.os)" :alt="getOSName(data.os)">
                {{ item.value }}
              </strong>
            </div>
          </div>
        </article>

        <article class="md-card instance-info-card" :class="[{ 'md-surface-glass': hasBackgroundBlur }, blurClass]">
          <h2 class="md-title-medium">
            存储信息
          </h2>
          <div class="instance-info-card__grid instance-info-card__grid--three">
            <div v-for="item in storageInfo" :key="item.label" class="instance-info-item">
              <span class="material-symbols-rounded">{{ item.icon }}</span>
              <span class="md-label">{{ item.label }}</span>
              <strong class="md-number">{{ item.value }}</strong>
            </div>
          </div>
        </article>

        <article class="md-card instance-info-card" :class="[{ 'md-surface-glass': hasBackgroundBlur }, blurClass]">
          <h2 class="md-title-medium">
            网络信息
          </h2>
          <div class="instance-info-card__grid">
            <div class="instance-info-item">
              <span class="material-symbols-rounded">swap_vert</span>
              <span class="md-label">月流量</span>
              <strong class="md-number">↑ {{ formatBytes(data?.net_total_up ?? 0) }} ｜ ↓ {{ formatBytes(data?.net_total_down ?? 0) }}</strong>
            </div>
            <div class="instance-info-item">
              <span class="material-symbols-rounded">speed</span>
              <span class="md-label">网络速率</span>
              <strong class="md-number">↑ {{ formatBytesPerSecond(data?.net_out ?? 0) }} ｜ ↓ {{ formatBytesPerSecond(data?.net_in ?? 0) }}</strong>
            </div>
          </div>
        </article>
      </section>

      <div class="instance-detail__divider md-wavy-divider" />

      <section class="instance-charts">
        <div class="md-control-row instance-charts__range-row">
          <button
            v-for="view in historyViews"
            :key="view.label"
            class="md-control-button"
            :class="{ 'is-active': selectedHistoryView === view.label }"
            type="button"
            :aria-pressed="selectedHistoryView === view.label"
            @click="selectedHistoryView = view.label"
          >
            {{ view.label }}
          </button>
        </div>

        <div class="md-segmented-control instance-charts__tabs" role="group" aria-label="图表类型">
          <button
            class="md-segmented-control__button instance-charts__tab"
            :class="{ 'is-active': chartView === 'load' }"
            type="button"
            @click="chartView = 'load'"
          >
            负载
          </button>
          <button
            class="md-segmented-control__button instance-charts__tab"
            :class="{ 'is-active': chartView === 'ping' }"
            type="button"
            @click="chartView = 'ping'"
          >
            延迟
          </button>
        </div>

        <LoadChart
          v-show="chartView === 'load'"
          :uuid="data.uuid"
          :records="loadHistoryRecords"
          :hours="selectedHistoryHours"
          :loading="historyLoading"
          :error="historyError"
        />
        <PingChart
          v-show="chartView === 'ping'"
          :uuid="data.uuid"
          :records="pingHistory.records"
          :tasks="pingHistory.tasks"
          :hours="selectedHistoryHours"
          :loading="historyLoading"
          :error="historyError"
        />
      </section>
    </template>
  </div>
</template>

<style scoped lang="scss">
.instance-detail__empty {
  padding: 16px;
}

.instance-hero {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
}

.instance-hero__flag {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  object-fit: cover;
}

.instance-hero__title {
  min-width: 0;
  flex: 1;

  h1 {
    overflow: hidden;
    margin: 0;
    color: var(--md-sys-color-on-surface);
    font-family: var(--md-sys-typescale-title-large-font);
    font-size: var(--md-sys-typescale-title-large-size);
    font-weight: 800;
    line-height: var(--md-sys-typescale-title-large-line-height);
    letter-spacing: var(--md-sys-typescale-title-large-tracking);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.instance-info-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--md-app-grid-gap);
  padding: 16px;

  @media (min-width: 1024px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.instance-info-card {
  padding: var(--md-app-card-padding);

  h2 {
    margin-bottom: 16px;
  }
}

.instance-info-card__grid {
  display: grid;
  grid-template-columns: repeat(1, minmax(0, 1fr));
  gap: 14px;

  @media (min-width: 640px) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.instance-info-card__grid--three {
  @media (min-width: 640px) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.instance-info-item {
  display: grid;
  min-width: 0;
  grid-template-columns: 20px 1fr;
  gap: 4px 8px;
  align-items: center;

  .material-symbols-rounded {
    color: var(--md-sys-color-primary);
    font-size: 18px;
  }

  strong {
    min-width: 0;
    grid-column: 2;
    overflow-wrap: anywhere;
    color: var(--md-sys-color-on-surface);
    font-family: var(--md-sys-typescale-title-small-font);
    font-size: var(--md-sys-typescale-title-small-size);
    font-weight: 800;
    line-height: var(--md-sys-typescale-title-small-line-height);
    letter-spacing: var(--md-sys-typescale-title-small-tracking);
  }
}

.instance-info-item__value {
  display: inline-flex;
  align-items: center;
  gap: 6px;

  img {
    width: 18px;
    height: 18px;
  }
}

.instance-detail__divider {
  margin: 0 16px;
}

.instance-charts {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}

.instance-charts__tabs {
  align-self: center;
}

.instance-charts__tab {
  width: auto;
  min-width: 86px;
  padding: 0 20px;
  font-weight: 500;
}

.instance-detail__skeleton {
  display: flex;
  width: min(100%, 960px);
  flex-direction: column;
  gap: 16px;
  padding: var(--md-app-card-padding);
}

.instance-detail__skeleton-line,
.instance-detail__skeleton-block,
.instance-detail__skeleton-chart {
  position: relative;
  overflow: hidden;
  border-radius: 12px;
  background: color-mix(
    in srgb,
    var(--md-sys-color-surface-container-highest) 88%,
    var(--md-sys-color-outline-variant)
  );

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    transform: translateX(-100%);
    background: linear-gradient(
      90deg,
      transparent 0%,
      color-mix(in srgb, var(--md-sys-color-surface) 55%, transparent) 50%,
      transparent 100%
    );
    animation: instance-skeleton-shimmer 1.4s ease-in-out infinite;
  }
}

.instance-detail__skeleton-line {
  width: 48%;
  height: 14px;
}

.instance-detail__skeleton-line--title {
  width: 36%;
  height: 28px;
}

.instance-detail__skeleton-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}

.instance-detail__skeleton-block {
  height: 72px;
}

.instance-detail__skeleton-chart {
  height: 280px;
  border-radius: 16px;
}

@keyframes instance-skeleton-shimmer {
  100% {
    transform: translateX(100%);
  }
}
</style>
