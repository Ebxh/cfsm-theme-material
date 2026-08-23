<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useAppStore } from '@/stores/app'
import { ApiError, getSharedApi } from '@/utils/api'
import { reconnectAfterLogin } from '@/utils/init'

/** Cloudflare Turnstile 官方腳本（顯式渲染模式） */
const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/api.js?render=explicit'

const props = defineProps<{
  forceLogin?: boolean
}>()

const emit = defineEmits<{
  loginSuccess: []
}>()

const appStore = useAppStore()
const api = getSharedApi()

const form = ref({
  username: '',
  password: '',
})

const loading = ref(false)
const showOtpDialog = ref(false)
const otpCode = ref<string[]>(['', '', '', '', '', ''])
const otpLoading = ref(false)

// ---- Cloudflare Turnstile 狀態 ----
const turnstileToken = ref<string | null>(null)
const turnstileWidgetId = ref<string | null>(null)
const turnstileError = ref<string | null>(null)

/** 是否需要在登入前完成 Turnstile 人機驗證（CFSM turnstile_login_enabled） */
const showTurnstile = computed(() => (
  appStore.publicSettings?.turnstile_login_enabled === true
  && !!appStore.publicSettings?.turnstile_site_key
))

function updateUsername(event: Event) {
  form.value.username = (event.target as HTMLInputElement).value
}

function updatePassword(event: Event) {
  form.value.password = (event.target as HTMLInputElement).value
}

function updateOtp(index: number, event: Event) {
  const value = (event.target as HTMLInputElement).value.replace(/\D/g, '').slice(-1)
  otpCode.value[index] = value
}

function validateForm(): boolean {
  if (!form.value.username.trim()) {
    window.$message?.warning('请输入用户名')
    return false
  }
  if (!form.value.password) {
    window.$message?.warning('请输入密码')
    return false
  }
  return true
}

async function finishLogin() {
  window.$message?.success('登录成功')

  if (props.forceLogin) {
    emit('loginSuccess')
  }
  else {
    await reconnectAfterLogin()
    window.$modal?.destroyAll()
  }
}

/** 動態載入 Turnstile 腳本（冪等：已載入直接返回） */
function loadTurnstileScript(): Promise<void> {
  return new Promise((resolve) => {
    if (window.turnstile) {
      resolve()
      return
    }
    if (document.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`)) {
      const check = () => (window.turnstile ? resolve() : setTimeout(check, 100))
      check()
      return
    }
    const script = document.createElement('script')
    script.src = TURNSTILE_SCRIPT_URL
    script.async = true
    script.onload = () => resolve()
    document.head.appendChild(script)
  })
}

/** 渲染 Turnstile widget；容器存在且 sitekey 有效時才執行 */
async function mountTurnstile(): Promise<void> {
  if (!showTurnstile.value)
    return

  const siteKey = appStore.publicSettings?.turnstile_site_key
  if (!siteKey)
    return

  // showTurnstile 可能因 publicSettings 晚載入而剛剛變 true，
  // 等待 v-if 容器完成渲染後再查詢 DOM，避免 getElementById 返回 null 導致 widget 永不掛載。
  await nextTick()

  const container = document.getElementById('turnstile-widget')
  if (!container)
    return

  await loadTurnstileScript()
  if (!window.turnstile) {
    turnstileError.value = 'Turnstile 加载失败，请刷新后重试'
    return
  }

  turnstileWidgetId.value = window.turnstile.render(container, {
    sitekey: siteKey,
    theme: appStore.isDark ? 'dark' : 'light',
    callback: (token) => {
      turnstileToken.value = token
      turnstileError.value = null
    },
    'expired-callback': () => {
      turnstileToken.value = null
    },
    'error-callback': () => {
      turnstileToken.value = null
      turnstileError.value = '人机验证出现错误，请重试'
    },
  })
}

function resetTurnstile(): void {
  turnstileToken.value = null
  if (window.turnstile && turnstileWidgetId.value)
    window.turnstile.reset(turnstileWidgetId.value)
}

async function handleLogin() {
  if (!validateForm())
    return

  if (showTurnstile.value && !turnstileToken.value) {
    window.$message?.warning('请先完成人机验证')
    return
  }

  loading.value = true
  try {
    // CFSM 登入：POST /admin/api（action: login），Turnstile 開啟時帶 X-Turnstile-Token
    await api.adminLogin(
      form.value.username.trim(),
      form.value.password,
      turnstileToken.value ?? undefined,
    )
    await finishLogin()
  }
  catch (error) {
    if (error instanceof ApiError && error.code === 403) {
      window.$message?.error('人机验证失败，请重新验证')
      resetTurnstile()
    }
    else if (error instanceof ApiError && error.code === 401) {
      window.$message?.error('用户名或密码错误')
    }
    else if (error instanceof ApiError && error.code === 400) {
      window.$message?.error('请输入用户名和密码')
    }
    else {
      window.$message?.error(error instanceof Error ? error.message : '登录失败，请稍后重试')
    }
  }
  finally {
    loading.value = false
  }
}

async function handleOtpSubmit() {
  window.$modal?.destroyAll()
  location.href = `${window.location.origin}/admin`
}

function handleOAuth2Login() {
  location.href = `${window.location.origin}/admin`
}

// publicSettings 可能晚於組件掛載載入（並行 bootstrap），載入後再渲染 Turnstile
watch(() => appStore.publicSettings, () => {
  void mountTurnstile()
})

onMounted(() => {
  void mountTurnstile()
})

onBeforeUnmount(() => {
  if (window.turnstile && turnstileWidgetId.value)
    window.turnstile.remove(turnstileWidgetId.value)
})
</script>

<template>
  <div class="login-dialog">
    <div v-if="!showOtpDialog" class="login-dialog__form">
      <label class="md-form-field">
        <span class="md-form-label">用户名</span>
        <md-outlined-text-field
          class="md-text-field"
          type="text"
          autocomplete="username"
          placeholder="请输入用户名"
          :value="form.username"
          :disabled="loading"
          @input="updateUsername"
          @keydown.enter="handleLogin"
        />
      </label>

      <label class="md-form-field">
        <span class="md-form-label">密码</span>
        <md-outlined-text-field
          class="md-text-field"
          type="password"
          autocomplete="current-password"
          placeholder="请输入密码"
          :value="form.password"
          :disabled="loading"
          @input="updatePassword"
          @keydown.enter="handleLogin"
        />
      </label>

      <div v-if="showTurnstile" class="login-dialog__turnstile">
        <div id="turnstile-widget" class="login-dialog__turnstile-widget" />
        <p v-if="turnstileError" class="login-dialog__turnstile-error">{{ turnstileError }}</p>
      </div>

      <md-filled-button class="login-dialog__primary" :disabled="loading" @click="handleLogin">
        <span class="material-symbols-rounded login-dialog__button-icon" aria-hidden="true">login</span>
        <span>{{ loading ? '登录中...' : '登录' }}</span>
      </md-filled-button>

      <template v-if="appStore.publicSettings?.oauth_enable">
        <div class="login-dialog__divider" />
        <md-outlined-button class="login-dialog__primary" @click="handleOAuth2Login">
          <span class="material-symbols-rounded login-dialog__button-icon" aria-hidden="true">open_in_new</span>
          <span>使用 OAuth2 登录</span>
        </md-outlined-button>
      </template>
    </div>

    <div v-else class="login-dialog__otp">
      <div class="login-dialog__otp-copy">
        <h3>两步验证</h3>
        <p>请输入验证器中的 6 位数字验证码</p>
      </div>

      <div class="login-dialog__otp-inputs" aria-label="两步验证码">
        <input
          v-for="(_, index) in otpCode"
          :key="index"
          class="login-dialog__otp-input"
          inputmode="numeric"
          autocomplete="one-time-code"
          maxlength="1"
          :value="otpCode[index]"
          :disabled="otpLoading"
          @input="updateOtp(index, $event)"
          @keydown.enter="handleOtpSubmit"
        >
      </div>

      <div class="login-dialog__otp-actions">
        <md-text-button :disabled="otpLoading" @click="showOtpDialog = false">
          返回
        </md-text-button>
        <md-filled-button :disabled="otpLoading" @click="handleOtpSubmit">
          {{ otpLoading ? '验证中...' : '验证' }}
        </md-filled-button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.login-dialog {
  width: 100%;
}

.login-dialog__form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.login-dialog__primary {
  width: 100%;
}

.login-dialog__button-icon {
  margin-inline-end: 8px;
  font-size: 18px;
  vertical-align: -4px;
}

.login-dialog__divider {
  height: 1px;
  margin: 4px 0;
  background: var(--md-sys-color-outline-variant);
}

.login-dialog__turnstile {
  display: flex;
  min-height: 78px;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.login-dialog__turnstile-widget {
  min-height: 65px;
}

.login-dialog__turnstile-error {
  margin: 0;
  color: var(--md-sys-color-error);
  font-family: var(--md-sys-typescale-body-small-font);
  font-size: var(--md-sys-typescale-body-small-size);
  line-height: var(--md-sys-typescale-body-small-line-height);
  letter-spacing: var(--md-sys-typescale-body-small-tracking);
  text-align: center;
}

.login-dialog__otp {
  display: flex;
  flex-direction: column;
  gap: 18px;
  align-items: center;
}

.login-dialog__otp-copy {
  text-align: center;

  h3 {
    margin: 0 0 6px;
    font-family: var(--md-sys-typescale-title-medium-font);
    font-size: var(--md-sys-typescale-title-medium-size);
    font-weight: var(--md-sys-typescale-title-medium-weight);
    line-height: var(--md-sys-typescale-title-medium-line-height);
    letter-spacing: var(--md-sys-typescale-title-medium-tracking);
  }

  p {
    margin: 0;
    color: var(--md-sys-color-on-surface-variant);
    font-family: var(--md-sys-typescale-body-medium-font);
    font-size: var(--md-sys-typescale-body-medium-size);
    line-height: var(--md-sys-typescale-body-medium-line-height);
    letter-spacing: var(--md-sys-typescale-body-medium-tracking);
  }
}

.login-dialog__otp-inputs {
  display: grid;
  width: 100%;
  grid-template-columns: repeat(6, minmax(34px, 1fr));
  gap: 8px;
}

.login-dialog__otp-input {
  width: 100%;
  height: 48px;
  border: 1px solid var(--md-sys-color-outline);
  border-radius: 4px;
  color: var(--md-sys-color-on-surface);
  background: var(--md-sys-color-surface);
  font-family: var(--md-app-number-font-family);
  font-size: var(--md-sys-typescale-title-large-size);
  font-weight: var(--md-sys-typescale-title-large-weight);
  line-height: var(--md-sys-typescale-title-large-line-height);
  letter-spacing: var(--md-sys-typescale-title-large-tracking);
  text-align: center;

  &:focus {
    border-color: var(--md-sys-color-primary);
    outline: 2px solid color-mix(in srgb, var(--md-sys-color-primary) 24%, transparent);
    outline-offset: 1px;
  }
}

.login-dialog__otp-actions {
  display: flex;
  width: 100%;
  justify-content: flex-end;
  gap: 8px;
}
</style>
