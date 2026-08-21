<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'

const appStore = useAppStore()

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function toPercent(value: number) {
  return `${Math.round(value * 1000) / 10}%`
}

// 背景加载状态
const isLoaded = ref(false)
const hasError = ref(false)

// 计算背景样式
const backgroundStyle = computed(() => {
  const blur = appStore.backgroundBlur
  return {
    filter: blur > 0 ? `blur(${blur}px)` : 'none',
  }
})

// 计算遮罩样式
const overlayStyle = computed(() => {
  const baseOpacity = clamp(appStore.backgroundOverlay, 0, 100) / 100
  const overlayOpacity = baseOpacity > 0 && appStore.backgroundType === 'video'
    ? clamp(baseOpacity + 0.1, 0, 1)
    : baseOpacity
  const edgeOpacity = overlayOpacity > 0
    ? clamp(overlayOpacity * 0.55 + 0.08, 0, 0.52)
    : 0
  const surfaceTintOpacity = overlayOpacity > 0
    ? clamp(overlayOpacity * 0.38, 0, 0.32)
    : 0

  return {
    '--background-overlay-weight': toPercent(overlayOpacity),
    '--background-edge-weight': toPercent(edgeOpacity),
    '--background-surface-tint-weight': toPercent(surfaceTintOpacity),
  }
})

// 是否启用自定义背景
const showBackground = computed(() => {
  return appStore.backgroundEnabled
})

// 当前背景 URL
const currentUrl = computed(() => appStore.currentBackgroundUrl)

// 背景类型
const backgroundType = computed(() => appStore.backgroundType)

// 视频必须先挂载才能触发 loadeddata；图片则等预加载完成后再显示。
const showMediaBackground = computed(() => {
  return showBackground.value
    && currentUrl.value
    && !hasError.value
    && (backgroundType.value === 'video' || isLoaded.value)
})

// 是否显示默认背景（未启用自定义背景、未配置 URL、或加载失败时）
const showDefaultBackground = computed(() => {
  if (!showBackground.value) {
    return false
  }
  // 没有配置 URL 时显示默认背景
  if (!currentUrl.value) {
    return true
  }
  // 加载失败时显示默认背景
  if (hasError.value) {
    return true
  }
  return false
})

// 是否显示加载中状态（有 URL 但未加载完成且未失败）
const showLoadingBackground = computed(() => {
  return showBackground.value && currentUrl.value && !isLoaded.value && !hasError.value
})

// 图片加载处理
let imageLoader: HTMLImageElement | null = null

function loadImage(url: string) {
  // 重置状态
  isLoaded.value = false
  hasError.value = false

  // 清理之前的加载器
  if (imageLoader) {
    imageLoader.onload = null
    imageLoader.onerror = null
    imageLoader = null
  }

  // 创建新的图片加载器
  imageLoader = new Image()
  imageLoader.onload = () => {
    isLoaded.value = true
    hasError.value = false
  }
  imageLoader.onerror = () => {
    isLoaded.value = false
    hasError.value = true
  }
  imageLoader.src = url
}

// 视频加载处理
const videoRef = ref<HTMLVideoElement | null>(null)

function handleVideoLoaded() {
  isLoaded.value = true
  hasError.value = false
}

function handleVideoError() {
  isLoaded.value = false
  hasError.value = true
}

// 监听 URL 变化
watch(currentUrl, (url) => {
  if (url && backgroundType.value === 'image') {
    loadImage(url)
  }
  else if (url && backgroundType.value === 'video') {
    // 视频通过事件处理
    isLoaded.value = false
    hasError.value = false
  }
  else {
    // 没有 URL 时重置状态
    isLoaded.value = false
    hasError.value = false
  }
}, { immediate: true })

// 监听背景类型变化
watch(backgroundType, (type) => {
  if (type === 'image' && currentUrl.value) {
    loadImage(currentUrl.value)
  }
})

// 组件卸载时清理
onUnmounted(() => {
  if (imageLoader) {
    imageLoader.onload = null
    imageLoader.onerror = null
    imageLoader = null
  }
})
</script>

<template>
  <div v-if="showBackground" class="background-container" :class="{ 'is-dark': appStore.isDark }">
    <!-- 默认背景（渐变背景，用于未配置或加载失败时） -->
    <Transition name="fade">
      <div v-if="showDefaultBackground" class="background-default" />
    </Transition>

    <!-- 加载中占位（渐变背景） -->
    <Transition name="fade">
      <div v-if="showLoadingBackground" class="background-loading" />
    </Transition>

    <!-- 自定义背景媒体层 -->
    <Transition name="fade">
      <div v-if="showMediaBackground" class="background-media" :style="backgroundStyle">
        <!-- 图片背景 -->
        <div
          v-if="backgroundType === 'image'"
          class="background-image"
          :style="{ backgroundImage: `url(${currentUrl})` }"
        />
        <!-- 视频背景 -->
        <video
          v-else-if="backgroundType === 'video'"
          ref="videoRef"
          class="background-video"
          :src="currentUrl"
          autoplay
          loop
          muted
          playsinline
          @loadeddata="handleVideoLoaded"
          @error="handleVideoError"
        />
      </div>
    </Transition>

    <!-- 遮罩层 -->
    <div class="background-overlay" :style="overlayStyle" />
  </div>
</template>

<style scoped lang="scss">
.background-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: -1;
  overflow: hidden;
}

.background-default,
.background-loading {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

// 默认背景：使用 Material tonal surface，避免在未配置壁纸时引入额外视觉风格。
.background-default {
  background: var(--md-sys-color-surface-container-lowest);
}

.background-container.is-dark .background-default {
  background: var(--md-sys-color-surface-dim);
}

.background-loading {
  background: var(--md-sys-color-surface-container-low);
}

.background-container.is-dark .background-loading {
  background: var(--md-sys-color-surface-container);
}

.background-media {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  transform: scale(1.1); // 防止模糊边缘露出白边
}

.background-image {
  width: 100%;
  height: 100%;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
}

.background-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.background-overlay {
  --background-overlay-weight: 0%;
  --background-edge-weight: 0%;
  --background-surface-tint-weight: 0%;

  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: color-mix(in srgb, var(--md-sys-color-surface) var(--background-overlay-weight), transparent);
  background-image:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--md-sys-color-surface-container-lowest) var(--background-edge-weight), transparent) 0%,
      transparent 36%,
      color-mix(in srgb, var(--md-sys-color-surface) var(--background-edge-weight), transparent) 100%
    ),
    radial-gradient(
      ellipse at center,
      transparent 58%,
      color-mix(in srgb, var(--md-sys-color-surface) var(--background-edge-weight), transparent) 100%
    );
  pointer-events: none;
}

.background-container.is-dark .background-overlay {
  background-color: color-mix(in srgb, var(--md-sys-color-scrim) var(--background-overlay-weight), transparent);
  background-image:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--md-sys-color-surface) var(--background-surface-tint-weight), transparent) 0%,
      transparent 34%,
      color-mix(in srgb, var(--md-sys-color-scrim) var(--background-edge-weight), transparent) 100%
    ),
    radial-gradient(
      ellipse at center,
      transparent 54%,
      color-mix(in srgb, var(--md-sys-color-scrim) var(--background-edge-weight), transparent) 100%
    ),
    linear-gradient(
      0deg,
      color-mix(in srgb, var(--md-sys-color-surface) var(--background-surface-tint-weight), transparent),
      color-mix(in srgb, var(--md-sys-color-surface) var(--background-surface-tint-weight), transparent)
    );
}

// 过渡动画
.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--md-app-motion-duration-medium) var(--md-app-motion-easing-standard);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
