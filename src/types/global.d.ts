// 构建时注入的全局常量
declare const __BUILD_VERSION__: string
declare const __BUILD_GIT_HASH__: string

export interface MaterialMessageApi {
  success: (content: string) => void
  error: (content: string) => void
  warning: (content: string) => void
  info: (content: string) => void
}

export interface MaterialLoadingBarApi {
  start: () => void
  finish: () => void
  error: () => void
}

export interface MaterialModalOptions {
  title?: string
  content?: () => unknown
  size?: 'medium' | 'large'
  closable?: boolean
  closeOnEsc?: boolean
  maskClosable?: boolean
  [key: string]: unknown
}

export interface MaterialModalApi {
  create: (options: MaterialModalOptions) => void
  destroyAll: () => void
}

export interface MaterialNotificationApi {
  create: (options: { title?: string, content?: string, type?: 'success' | 'error' | 'warning' | 'info' }) => void
  success: (options: { title?: string, content?: string }) => void
  error: (options: { title?: string, content?: string }) => void
  warning: (options: { title?: string, content?: string }) => void
  info: (options: { title?: string, content?: string }) => void
}

export type MaterialDialogApi = MaterialNotificationApi

/** Cloudflare Turnstile 渲染選項（challenges.cloudflare.com/turnstile/api.js） */
export interface TurnstileRenderOptions {
  sitekey: string
  callback?: (token: string) => void
  'error-callback'?: () => void
  'expired-callback'?: () => void
  theme?: 'light' | 'dark' | 'auto'
  language?: string
  size?: 'normal' | 'compact' | 'flexible'
  appearance?: 'always' | 'execute' | 'interaction-only'
}

/** Cloudflare Turnstile 全局 API */
export interface TurnstileApi {
  render: (container: HTMLElement | string, options: TurnstileRenderOptions) => string
  reset: (widgetId?: string) => void
  remove: (widgetId?: string) => void
}

declare global {
  interface Window {
    $message: MaterialMessageApi
    $dialog: MaterialDialogApi
    $notification: MaterialNotificationApi
    $loadingBar: MaterialLoadingBarApi
    $modal: MaterialModalApi
    turnstile?: TurnstileApi
  }
}
