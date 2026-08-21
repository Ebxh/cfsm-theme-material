/**
 * CFSM theme_options → 原版 Komari-Material theme_settings 適配
 *
 * CFSM 後台的「主題自定義配置 JSON」是 { configuration: [{ key, value, options, description }] }，
 * 原版 Komari 的 theme_settings 是 { key: value } 扁平對象。
 * 此模組負責把 CFSM 線格式轉為原版 store 期望的扁平對象。
 */

export type ThemeSettings = Record<string, unknown>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 解析 CFSM theme_options 線格式 → 扁平 { key: value } */
export function adaptThemeOptions(value: unknown): ThemeSettings {
  const values: ThemeSettings = {}

  if (!isRecord(value))
    return values

  // 優先讀取 configuration 數組（CFSM 後台格式）
  const configuration = value.configuration
  if (Array.isArray(configuration)) {
    for (const item of configuration) {
      if (!isRecord(item) || typeof item.key !== 'string')
        continue
      values[item.key] = item.value
    }
  }

  // 兼容直接傳扁平對象的情況
  for (const [key, optionValue] of Object.entries(value)) {
    if (key !== 'configuration')
      values[key] = optionValue
  }

  return values
}
