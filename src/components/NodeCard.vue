<script setup lang="ts">
import type { NodeData } from '@/stores/nodes'
import { computed, defineAsyncComponent, h } from 'vue'
import NodePingSummary from '@/components/NodePingSummary.vue'
import TrafficProgress from '@/components/TrafficProgress.vue'
import { useAppStore } from '@/stores/app'
import { formatBytesWithConfig, formatDateTime, getStatus } from '@/utils/helper'
import { getOSImage, getOSName } from '@/utils/osImageHelper'
import { getRegionCode, getRegionDisplayName } from '@/utils/regionHelper'
import { formatPriceWithCycle, getDaysUntilExpired, getExpireStatus, getExpireStatusHexColor, parseTags } from '@/utils/tagHelper'

const props = defineProps<{
  node: NodeData
}>()

const emit = defineEmits<{
  click: []
}>()

// 懒加载：PingChart 引入 echarts（~552KB），仅在点击按钮打开图表时才需要。
// 静态 import 会把它拖进首屏 chunk，改异步后 echarts 不再阻塞首屏。
const PingChart = defineAsyncComponent(() => import('@/components/PingChart.vue'))

const appStore = useAppStore()
const themeColors = computed(() => appStore.materialThemeTokens.chartColors)

const formatBytes = (bytes: number) => formatBytesWithConfig(bytes, appStore.byteDecimals)
const offlineTime = computed(() => formatDateTime(props.node.time))

const cpuStatus = computed(() => getStatus(props.node.cpu ?? 0))
const memPercentage = computed(() => (props.node.ram ?? 0) / (props.node.mem_total || 1) * 100)
const memStatus = computed(() => getStatus(memPercentage.value))
const diskPercentage = computed(() => (props.node.disk ?? 0) / (props.node.disk_total || 1) * 100)
const diskStatus = computed(() => getStatus(diskPercentage.value))
const showTrafficProgress = computed(() => props.node.traffic_limit > 0)

const trafficUsedPercentage = computed(() => {
  if (props.node.traffic_limit <= 0)
    return 0

  const { net_total_up = 0, net_total_down = 0, traffic_limit_type } = props.node
  let used = 0

  switch (traffic_limit_type) {
    case 'up':
      used = net_total_up
      break
    case 'down':
      used = net_total_down
      break
    case 'min':
      used = Math.min(net_total_up, net_total_down)
      break
    case 'max':
      used = Math.max(net_total_up, net_total_down)
      break
    case 'sum':
    default:
      used = net_total_up + net_total_down
      break
  }

  return Math.min((used / props.node.traffic_limit) * 100, 100)
})

const trafficUsed = computed(() => {
  const { net_total_up = 0, net_total_down = 0, traffic_limit_type } = props.node
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
})

const priceTags = computed(() => {
  const tags: Array<{ text: string, color: string }> = []
  const lang = appStore.lang
  const node = props.node

  if (node.price !== 0) {
    const days = getDaysUntilExpired(node.expired_at)
    const status = getExpireStatus(node.expired_at)
    const color = getExpireStatusHexColor(status)

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

  return tags
})

const customTags = computed(() => {
  return parseTags(props.node.tags).map(tag => ({ text: tag.text, color: tag.hex }))
})

const mergedTags = computed(() => [...customTags.value, ...priceTags.value])
const hasBackgroundBlur = computed(() => appStore.backgroundEnabled && appStore.cardBlurRadius > 0)
const cardBlurClass = computed(() => {
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

function tagStyle(color: string) {
  return {
    color,
    backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
    borderColor: `color-mix(in srgb, ${color} 32%, var(--md-sys-color-outline-variant))`,
  }
}

function openPingChart() {
  window.$modal.create({
    title: `${props.node.name} - 延迟监控`,
    content: () => h(PingChart, { uuid: props.node.uuid }),
    size: 'large',
  })
}
</script>

<template>
  <article
    class="md-card md-card--interactive node-card"
    :class="[
      props.node.online ? 'node-card--online' : 'node-card--offline',
      { 'md-surface-glass': hasBackgroundBlur },
      cardBlurClass,
    ]"
    role="button"
    tabindex="0"
    @click="emit('click')"
    @keydown.enter.self="emit('click')"
    @keydown.space.self.prevent="emit('click')"
  >
    <header class="node-card__header">
      <div class="node-card__identity">
        <img class="node-card__flag" :src="`/flags/${getRegionCode(props.node.region).toLowerCase()}.svg`" :alt="getRegionDisplayName(props.node.region)">
        <h3 class="node-card__name">
          {{ props.node.name }}
        </h3>
      </div>

      <div class="node-card__actions">
        <button
          v-if="appStore.showPingChartButton"
          class="material-icon-button node-card__chart-button"
          type="button"
          title="查看延迟图表"
          aria-label="查看延迟图表"
          @click.stop="openPingChart"
        >
          <span class="material-symbols-rounded">show_chart</span>
        </button>
        <img
          class="node-card__os-logo"
          :src="getOSImage(props.node.os)"
          :alt="getOSName(props.node.os)"
          :title="`${getOSName(props.node.os)} / ${props.node.arch}`"
        >
      </div>
    </header>

    <div class="node-card__content">
      <div v-if="!props.node.online" class="node-card__offline-overlay" aria-hidden="true">
        <div class="node-card__offline-content">
          <div class="node-card__offline-title">
            <img class="node-card__flag" :src="`/flags/${getRegionCode(props.node.region).toLowerCase()}.svg`" :alt="getRegionDisplayName(props.node.region)">
            <span>{{ props.node.name }}</span>
          </div>
          <strong>节点已离线</strong>
          <span class="md-number">最后在线 {{ offlineTime }}</span>
          <div v-if="mergedTags.length > 0" class="node-card__tag-row node-card__tag-row--center">
            <span v-for="(tag, index) in mergedTags" :key="index" class="md-chip" :style="tagStyle(tag.color)">
              {{ tag.text }}
            </span>
          </div>
        </div>
      </div>

      <div class="node-card__resource-grid" :class="appStore.cardProgressLayout === '1col' ? 'node-card__resource-grid--single' : ''">
        <div class="node-card__resource">
          <div class="node-card__resource-head">
            <span class="md-label">CPU</span>
            <span class="md-number">{{ (props.node.cpu ?? 0).toFixed(1) }}%</span>
          </div>
          <md-linear-progress
            class="md-progress"
            :value="progressValue(props.node.cpu ?? 0)"
            aria-label="CPU"
            :style="{ '--md-linear-progress-active-indicator-color': statusColor(cpuStatus) }"
          />
          <span class="node-card__hint md-number">{{ (node.load ?? 0).toFixed(2) }}, {{ (node.load5 ?? 0).toFixed(2) }}, {{ (node.load15 ?? 0).toFixed(2) }}</span>
        </div>

        <div class="node-card__resource">
          <div class="node-card__resource-head">
            <span class="md-label">内存</span>
            <span class="md-number">{{ memPercentage.toFixed(1) }}%</span>
          </div>
          <md-linear-progress
            class="md-progress"
            :value="progressValue(memPercentage)"
            aria-label="内存"
            :style="{ '--md-linear-progress-active-indicator-color': statusColor(memStatus) }"
          />
          <span class="node-card__hint md-number">{{ formatBytes(props.node.ram ?? 0) }} / {{ formatBytes(props.node.mem_total ?? 0) }}</span>
        </div>

        <div class="node-card__resource">
          <div class="node-card__resource-head">
            <span class="md-label">硬盘</span>
            <span class="md-number">{{ diskPercentage.toFixed(1) }}%</span>
          </div>
          <md-linear-progress
            class="md-progress"
            :value="progressValue(diskPercentage)"
            aria-label="硬盘"
            :style="{ '--md-linear-progress-active-indicator-color': statusColor(diskStatus) }"
          />
          <span class="node-card__hint md-number">{{ formatBytes(props.node.disk ?? 0) }} / {{ formatBytes(props.node.disk_total ?? 0) }}</span>
        </div>

        <div class="node-card__resource">
          <div class="node-card__resource-head">
            <span class="md-label">流量</span>
            <span class="md-number">{{ showTrafficProgress ? `${trafficUsedPercentage.toFixed(1)}%` : '∞' }}</span>
          </div>
          <TrafficProgress
            :upload="props.node.net_total_up ?? 0"
            :download="props.node.net_total_down ?? 0"
            :traffic-limit="props.node.traffic_limit"
            :traffic-limit-type="(props.node.traffic_limit_type || 'sum')"
          />
          <span class="node-card__hint md-number">
            <template v-if="showTrafficProgress">{{ formatBytes(trafficUsed) }} / {{ formatBytes(props.node.traffic_limit) }}</template>
            <template v-else>
              <span :style="{ color: appStore.trafficSplitColor ? themeColors.success : undefined }">↑ {{ formatBytes(props.node.net_total_up ?? 0) }}</span>
              <span class="node-card__split" />
              <span :style="{ color: appStore.trafficSplitColor ? themeColors.primary : undefined }">↓ {{ formatBytes(props.node.net_total_down ?? 0) }}</span>
            </template>
          </span>
        </div>
      </div>

      <NodePingSummary
        :uuid="props.node.uuid"
        :upload-speed="props.node.net_out ?? 0"
        :download-speed="props.node.net_in ?? 0"
      />

      <div v-if="mergedTags.length > 0" class="node-card__row node-card__row--tags">
        <span class="md-label">标签</span>
        <span class="node-card__tag-row">
          <span v-for="(tag, index) in mergedTags" :key="index" class="md-chip" :style="tagStyle(tag.color)">
            {{ tag.text }}
          </span>
        </span>
      </div>
    </div>
  </article>
</template>

<style scoped lang="scss">
.node-card {
  min-height: 100%;
}

.node-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: var(--md-app-card-padding) var(--md-app-card-padding) 8px;
}

.node-card__identity {
  position: relative;
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.node-card__flag {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 5px;
  object-fit: cover;
}

.node-card__name {
  overflow: hidden;
  margin: 0;
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-sys-typescale-title-medium-font);
  font-size: var(--md-sys-typescale-title-medium-size);
  font-weight: 800;
  line-height: var(--md-sys-typescale-title-medium-line-height);
  letter-spacing: var(--md-sys-typescale-title-medium-tracking);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-card__actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
}

.node-card__chart-button {
  width: 48px;
  height: 48px;
}

.node-card__os-logo {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  object-fit: contain;
}

.node-card__content {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 8px var(--md-app-card-padding) var(--md-app-card-padding);
}

.node-card__row,
.node-card__resource-head {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.node-card__tag-row {
  display: inline-flex;
  min-width: 0;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  color: var(--md-sys-color-on-surface);
  font-family: var(--md-sys-typescale-body-medium-font);
  font-size: var(--md-sys-typescale-body-medium-size);
  line-height: var(--md-sys-typescale-body-medium-line-height);
  letter-spacing: var(--md-sys-typescale-body-medium-tracking);
}

.node-card__resource-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 18px;
}

.node-card__resource-grid--single {
  grid-template-columns: 1fr;
}

.node-card__resource {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.node-card__resource-head {
  font-family: var(--md-sys-typescale-body-medium-font);
  font-size: var(--md-sys-typescale-body-medium-size);
  line-height: var(--md-sys-typescale-body-medium-line-height);
  letter-spacing: var(--md-sys-typescale-body-medium-tracking);

  > .md-number {
    font-weight: 800;
  }
}

.node-card__hint {
  overflow: hidden;
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--md-sys-typescale-body-small-font);
  font-size: var(--md-sys-typescale-body-small-size);
  line-height: var(--md-sys-typescale-body-small-line-height);
  letter-spacing: var(--md-sys-typescale-body-small-tracking);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-card__split::before {
  content: ' ';
  display: inline-block;
  width: 6px;
}

.node-card__offline-overlay {
  position: absolute;
  inset: 0;
  z-index: 4;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  border-radius: 0 0 var(--md-app-card-radius) var(--md-app-card-radius);
  background: var(--md-sys-color-surface-container-high);
  pointer-events: none;
  transition: opacity var(--md-app-motion-duration-short) var(--md-app-motion-easing-standard);
}

.node-card:hover .node-card__offline-overlay {
  opacity: 0;
}

.node-card__offline-content {
  display: flex;
  max-width: 100%;
  flex-direction: column;
  gap: 7px;
  align-items: center;
  color: var(--md-sys-color-on-surface-variant);
  font-family: var(--md-sys-typescale-body-small-font);
  font-size: var(--md-sys-typescale-body-small-size);
  line-height: var(--md-sys-typescale-body-small-line-height);
  letter-spacing: var(--md-sys-typescale-body-small-tracking);
  text-align: center;

  strong {
    color: var(--md-sys-color-error);
    font-family: var(--md-sys-typescale-title-small-font);
    font-size: var(--md-sys-typescale-title-small-size);
    font-weight: var(--md-sys-typescale-title-small-weight);
    line-height: var(--md-sys-typescale-title-small-line-height);
    letter-spacing: var(--md-sys-typescale-title-small-tracking);
  }
}

.node-card__offline-title {
  display: flex;
  max-width: 100%;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--md-sys-color-on-surface);
  font-weight: 500;
}

.node-card__tag-row--center {
  justify-content: center;
}
</style>
