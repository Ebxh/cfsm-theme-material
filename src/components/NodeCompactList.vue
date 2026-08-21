<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { computed, defineAsyncComponent, h } from 'vue'
import NodePingSummary from '@/components/NodePingSummary.vue'
import TrafficProgress from '@/components/TrafficProgress.vue'
import { useAppStore } from '@/stores/app'
import { formatBytesWithConfig, formatDateTime, formatUptimeWithFormat, getStatus } from '@/utils/helper'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getRegionCode, getRegionDisplayName } from '@/utils/regionHelper'
import { formatPriceWithCycle, getDaysUntilExpired, getExpireStatus, parseTags } from '@/utils/tagHelper'

const props = defineProps<{
  nodes: NodeData[]
}>()

const emit = defineEmits<{
  click: [node: NodeData]
}>()

// 懒加载：PingChart 引入 echarts（~552KB），仅在点击按钮打开图表时才需要。
// 静态 import 会把它拖进首屏 chunk，改异步后 echarts 不再阻塞首屏。
const PingChart = defineAsyncComponent(() => import('@/components/PingChart.vue'))

const appStore = useAppStore()
const themeColors = computed(() => appStore.materialThemeTokens.chartColors)

const formatBytes = (bytes: number) => formatBytesWithConfig(bytes, appStore.byteDecimals)
const formatUptime = (seconds: number) => formatUptimeWithFormat(seconds, appStore.uptimeFormat)

const hasBackgroundBlur = computed(() => appStore.backgroundEnabled && appStore.cardBlurRadius > 0)
const compactListBlurClass = computed(() => {
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

function getFlagSrc(region: string): string {
  return `/flags/${getRegionCode(region).toLowerCase()}.svg`
}

function handleClick(node: NodeData) {
  emit('click', node)
}

function openPingChart(node: NodeData) {
  window.$modal.create({
    title: `${node.name} - 延迟监控`,
    content: () => h(PingChart, { uuid: node.uuid }),
    size: 'large',
  })
}

function showTrafficProgress(node: NodeData): boolean {
  return node.traffic_limit > 0
}

function getTrafficUsedPercentage(node: NodeData): number {
  if (node.traffic_limit <= 0)
    return 0

  return Math.min((getTrafficUsed(node) / node.traffic_limit) * 100, 100)
}

function getTrafficUsed(node: NodeData): number {
  const { net_total_up = 0, net_total_down = 0, traffic_limit_type } = node
  switch (traffic_limit_type) {
    case 'up':
      return net_total_up
    case 'down':
      return net_total_down
    case 'min':
      return Math.min(net_total_up, net_total_down)
    case 'max':
      return Math.max(net_total_up, net_total_down)
    case 'sum':
    default:
      return net_total_up + net_total_down
  }
}

function getExpireBadgeColor(status: string): string {
  switch (status) {
    case 'expired':
    case 'critical':
      return 'var(--md-sys-color-error)'
    case 'warning':
      return 'var(--md-chart-warning)'
    case 'long_term':
      return 'var(--md-sys-color-outline)'
    case 'normal':
    default:
      return 'var(--md-chart-success)'
  }
}

function getNodeTags(node: NodeData): Array<{ text: string, color: string }> {
  const tags: Array<{ text: string, color: string }> = []
  const lang = appStore.lang

  if (node.price !== 0) {
    const days = getDaysUntilExpired(node.expired_at)
    const status = getExpireStatus(node.expired_at)
    const color = getExpireBadgeColor(status)

    if (status === 'expired') {
      tags.push({ text: lang === 'zh-CN' ? '已过期' : 'Expired', color })
    }
    else if (status === 'long_term') {
      tags.push({ text: lang === 'zh-CN' ? '长期' : 'Long-term', color })
    }
    else {
      tags.push({ text: lang === 'zh-CN' ? `剩余 ${days} 天` : `${days} days left`, color })
    }

    tags.push({ text: formatPriceWithCycle(node.price, node.billing_cycle, node.currency, lang), color: themeColors.value.primary })
  }

  for (const tag of parseTags(node.tags)) {
    tags.push({ text: tag.text, color: tag.hex })
  }

  return tags
}

function tagStyle(color: string) {
  return {
    color,
    backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} 32%, var(--md-sys-color-outline-variant))`,
  }
}

function statusColor(status: 'success' | 'warning' | 'error') {
  if (status === 'success')
    return themeColors.value.success
  if (status === 'warning')
    return themeColors.value.warning
  return themeColors.value.error
}

function progressValue(percentage: number) {
  return Math.min(Math.max(percentage, 0), 100) / 100
}

function formatLoad(node: NodeData) {
  return `${(node.load ?? 0).toFixed(2)}, ${(node.load5 ?? 0).toFixed(2)}, ${(node.load15 ?? 0).toFixed(2)}`
}

function memPercent(node: NodeData) {
  return (node.ram ?? 0) / (node.mem_total || 1) * 100
}

function diskPercent(node: NodeData) {
  return (node.disk ?? 0) / (node.disk_total || 1) * 100
}
</script>

<template>
  <div class="node-compact-list-wrapper">
    <div class="node-compact-list">
      <article
        v-for="node in props.nodes"
        :key="node.uuid"
        class="md-card md-card--interactive node-compact-card"
        :class="[
          node.online ? 'node-compact-card--online' : 'node-compact-card--offline',
          { 'md-surface-glass': hasBackgroundBlur },
          compactListBlurClass,
        ]"
        role="button"
        tabindex="0"
        @click="handleClick(node)"
        @keydown.enter.self="handleClick(node)"
        @keydown.space.self.prevent="handleClick(node)"
      >
        <header class="node-compact-card__header">
          <div class="node-compact-card__identity">
            <span v-if="appStore.listStatusStyle === 'tag'" class="md-chip node-compact-card__status" :class="node.online ? 'md-chip--success' : 'md-chip--error'">
              {{ node.online ? '在线' : '离线' }}
            </span>
            <span v-else class="node-compact-card__status-badge" :class="{ 'node-compact-card__status-badge--online': node.online }">
              {{ node.online ? '在线' : '离线' }}
            </span>

            <img class="node-compact-card__flag" :src="getFlagSrc(node.region)" :alt="getRegionDisplayName(node.region)">

            <div class="node-compact-card__name-stack">
              <h3 class="node-compact-card__name">
                {{ node.name }}
              </h3>
              <div class="node-compact-card__meta">
                <span>{{ getRegionDisplayName(node.region) }}</span>
                <span>{{ formatUptime(node.uptime ?? 0) }}</span>
              </div>
            </div>
          </div>

          <div class="node-compact-card__actions">
            <button
              v-if="appStore.showPingChartButton"
              class="material-icon-button node-compact-card__chart-button"
              type="button"
              title="查看延迟图表"
              aria-label="查看延迟图表"
              @click.stop="openPingChart(node)"
            >
              <span class="material-symbols-rounded">show_chart</span>
            </button>
            <img
              class="node-compact-card__os-logo"
              :src="getOSImage(node.os)"
              :alt="getOSName(node.os)"
              :title="`${getOSName(node.os)} / ${node.arch}`"
            >
          </div>
        </header>

        <div class="node-compact-card__metrics">
          <div class="node-compact-card__metric">
            <div class="node-compact-card__metric-head">
              <span class="md-label">CPU</span>
              <span class="md-number">{{ (node.cpu ?? 0).toFixed(1) }}%</span>
            </div>
            <md-linear-progress
              class="md-progress"
              :value="progressValue(node.cpu ?? 0)"
              aria-label="CPU"
              :style="{ '--md-linear-progress-active-indicator-color': statusColor(getStatus(node.cpu ?? 0)) }"
            />
            <span class="node-compact-card__hint md-number">{{ formatLoad(node) }}</span>
          </div>

          <div class="node-compact-card__metric">
            <div class="node-compact-card__metric-head">
              <span class="md-label">内存</span>
              <span class="md-number">{{ memPercent(node).toFixed(1) }}%</span>
            </div>
            <md-linear-progress
              class="md-progress"
              :value="progressValue(memPercent(node))"
              aria-label="内存"
              :style="{ '--md-linear-progress-active-indicator-color': statusColor(getStatus(memPercent(node))) }"
            />
            <span class="node-compact-card__hint md-number">{{ formatBytes(node.ram ?? 0) }} / {{ formatBytes(node.mem_total ?? 0) }}</span>
          </div>

          <div class="node-compact-card__metric">
            <div class="node-compact-card__metric-head">
              <span class="md-label">硬盘</span>
              <span class="md-number">{{ diskPercent(node).toFixed(1) }}%</span>
            </div>
            <md-linear-progress
              class="md-progress"
              :value="progressValue(diskPercent(node))"
              aria-label="硬盘"
              :style="{ '--md-linear-progress-active-indicator-color': statusColor(getStatus(diskPercent(node))) }"
            />
            <span class="node-compact-card__hint md-number">{{ formatBytes(node.disk ?? 0) }} / {{ formatBytes(node.disk_total ?? 0) }}</span>
          </div>

          <div class="node-compact-card__metric">
            <div class="node-compact-card__metric-head">
              <span class="md-label">流量</span>
              <span class="md-number">
                <template v-if="showTrafficProgress(node)">{{ getTrafficUsedPercentage(node).toFixed(1) }}%</template>
                <template v-else>∞</template>
              </span>
            </div>
            <TrafficProgress
              :upload="node.net_total_up ?? 0"
              :download="node.net_total_down ?? 0"
              :traffic-limit="node.traffic_limit"
              :traffic-limit-type="(node.traffic_limit_type || 'sum')"
            />
            <span class="node-compact-card__hint md-number">
              {{ formatBytes(getTrafficUsed(node)) }} /
              <template v-if="showTrafficProgress(node)">{{ formatBytes(node.traffic_limit) }}</template>
              <template v-else>∞</template>
            </span>
          </div>
        </div>

        <NodePingSummary
          :uuid="node.uuid"
          :upload-speed="node.net_out ?? 0"
          :download-speed="node.net_in ?? 0"
          density="compact"
        />

        <footer v-if="getNodeTags(node).length > 0" class="node-compact-card__footer">
          <div class="node-compact-card__tags">
            <span v-for="(tag, index) in getNodeTags(node)" :key="index" class="md-chip" :style="tagStyle(tag.color)">
              {{ tag.text }}
            </span>
          </div>
        </footer>

        <div v-if="!node.online" class="node-compact-card__offline-overlay" aria-hidden="true">
          <img class="node-compact-card__flag" :src="getFlagSrc(node.region)" :alt="getRegionDisplayName(node.region)">
          <strong>{{ node.name }}</strong>
          <span class="md-number">最后在线 {{ formatDateTime(node.time) }}</span>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped lang="scss">
.node-compact-list-wrapper {
  min-width: 0;
}

.node-compact-list {
  display: grid;
  min-width: 0;
  grid-template-columns: 1fr;
  gap: var(--md-app-grid-gap);
}

.node-compact-card {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 108px;
  flex-direction: column;
  gap: 8px;
  overflow: hidden;
  padding: 10px;
}

.node-compact-card__header,
.node-compact-card__footer {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.node-compact-card__identity,
.node-compact-card__actions {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
}

.node-compact-card__identity {
  flex: 1 1 auto;
}

.node-compact-card__actions {
  flex: 0 0 auto;
}

.node-compact-card__status {
  min-height: 24px;
  flex: 0 0 auto;
  padding: 2px 8px;
}

.node-compact-card__status-badge {
  display: inline-flex;
  min-height: 24px;
  flex: 0 0 auto;
  align-items: center;
  border-radius: 999px;
  padding: 0 9px;
  color: var(--md-sys-color-on-error-container);
  background: var(--md-sys-color-error-container);
  font-family: var(--md-sys-typescale-label-small-font);
  font-size: var(--md-sys-typescale-label-small-size);
  font-weight: var(--md-sys-typescale-label-small-weight);
  line-height: var(--md-sys-typescale-label-small-line-height);
  letter-spacing: var(--md-sys-typescale-label-small-tracking);
}

.node-compact-card__status-badge--online {
  color: var(--md-chart-success);
  background: color-mix(in srgb, var(--md-chart-success) 18%, transparent);
}

.node-compact-card__flag {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  border-radius: 5px;
  object-fit: cover;
}

.node-compact-card__name-stack {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
}

.node-compact-card__name {
  overflow: hidden;
  margin: 0;
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-sys-typescale-title-small-font);
  font-size: var(--md-sys-typescale-title-small-size);
  font-weight: 800;
  line-height: var(--md-sys-typescale-title-small-line-height);
  letter-spacing: var(--md-sys-typescale-title-small-tracking);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-compact-card__meta {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 3px 7px;
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--md-sys-typescale-label-small-font);
  font-size: var(--md-sys-typescale-label-small-size);
  line-height: var(--md-sys-typescale-label-small-line-height);
  letter-spacing: var(--md-sys-typescale-label-small-tracking);
}

.node-compact-card__chart-button {
  width: 48px;
  height: 48px;
}

.node-compact-card__os-logo {
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  object-fit: contain;
}

.node-compact-card__metrics {
  display: grid;
  min-width: 0;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

.node-compact-card__metric {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.node-compact-card__metric-head {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  font-family: var(--md-sys-typescale-label-small-font);
  font-size: var(--md-sys-typescale-label-small-size);
  line-height: var(--md-sys-typescale-label-small-line-height);
  letter-spacing: var(--md-sys-typescale-label-small-tracking);

  > .md-number {
    font-weight: 800;
  }
}

.node-compact-card__hint {
  overflow: hidden;
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--md-sys-typescale-label-small-font);
  font-size: var(--md-sys-typescale-label-small-size);
  line-height: var(--md-sys-typescale-label-small-line-height);
  letter-spacing: var(--md-sys-typescale-label-small-tracking);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-compact-card__footer {
  align-items: flex-start;
}

.node-compact-card__tags {
  display: flex;
  min-width: 0;
  max-height: 26px;
  flex: 1 1 auto;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 4px;
  overflow: hidden;
}

.node-compact-card__tags .md-chip {
  min-height: 24px;
  padding: 2px 8px;
}

.node-compact-card__offline-overlay {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px;
  color: var(--md-sys-color-on-surface-variant);
  background: var(--md-sys-color-surface-container-high);
  pointer-events: none;
  transition: opacity var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard);

  strong {
    min-width: 0;
    overflow: hidden;
    color: var(--md-sys-color-on-surface);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.node-compact-card:hover .node-compact-card__offline-overlay,
.node-compact-card:focus-visible .node-compact-card__offline-overlay {
  opacity: 0;
}

@media (min-width: 900px) {
  .node-compact-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .node-compact-card__metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .node-compact-card {
    min-height: 0;
  }

  .node-compact-card__header,
  .node-compact-card__footer {
    align-items: flex-start;
  }

  .node-compact-card__identity {
    flex-wrap: wrap;
  }

  .node-compact-card__name-stack {
    flex-basis: calc(100% - 86px);
  }

  .node-compact-card__footer {
    flex-direction: column;
  }

  .node-compact-card__tags {
    justify-content: flex-start;
  }

  .node-compact-card__offline-overlay {
    flex-wrap: wrap;
    text-align: center;
  }
}

@media (max-width: 420px) {
  .node-compact-card__metrics {
    grid-template-columns: 1fr;
  }
}
</style>
