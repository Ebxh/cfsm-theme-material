/**
 * 仅允许可安全导航的 HTTP(S) 和相对地址。
 * 返回原始地址以保留相对路径；无效或危险协议返回 undefined。
 */
export function sanitizeNavigationUrl(value: unknown): string | undefined {
  if (typeof value !== 'string')
    return undefined

  const trimmed = value.trim()
  if (!trimmed)
    return undefined

  try {
    const parsed = new URL(trimmed, 'https://komari.invalid/')
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? trimmed : undefined
  }
  catch {
    return undefined
  }
}
