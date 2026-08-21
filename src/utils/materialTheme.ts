import {
  argbFromHex,
  hexFromArgb,
  sourceColorFromImage,
  themeFromSourceColor,
} from '@material/material-color-utilities'

export const DEFAULT_MATERIAL_SEED_COLOR = '#006A60'
export type MaterialDensity = 'compact' | 'comfortable'
export type MonetColorMode = 'seed' | 'palette' | 'wallpaper'
export type MonetPaletteName = keyof typeof MONET_PALETTES

export const MONET_PALETTES = {
  'coral-red': {
    name: '珊瑚红',
    seedColor: '#B3261E',
  },
  'sunset-orange': {
    name: '落日橙',
    seedColor: '#A23F00',
  },
  'amber-gold': {
    name: '琥珀',
    seedColor: '#825500',
  },
  'olive-green': {
    name: '金黄',
    seedColor: '#6D5E00',
  },
  'lime-green': {
    name: '青柠',
    seedColor: '#496900',
  },
  'forest-green': {
    name: '森绿',
    seedColor: '#146C2E',
  },
  'material-teal': {
    name: '湖青',
    seedColor: DEFAULT_MATERIAL_SEED_COLOR,
  },
  'sky-blue': {
    name: '天青',
    seedColor: '#00677D',
  },
  'ocean-blue': {
    name: '海蓝',
    seedColor: '#005AC1',
  },
  'indigo-blue': {
    name: '靛蓝',
    seedColor: '#3F51A2',
  },
  'material-purple': {
    name: '经典紫',
    seedColor: '#6750A4',
  },
  'violet-purple': {
    name: '堇紫',
    seedColor: '#7D4698',
  },
  'magenta-pink': {
    name: '洋红',
    seedColor: '#9C3E7C',
  },
  'rose-pink': {
    name: '蔷薇',
    seedColor: '#B71B5C',
  },
  'plum-purple': {
    name: '李紫',
    seedColor: '#8C4A60',
  },
  'earth-brown': {
    name: '大地棕',
    seedColor: '#765849',
  },
  'slate-gray': {
    name: '石板灰',
    seedColor: '#4F616D',
  },
  'graphite-gray': {
    name: '石墨灰',
    seedColor: '#5F5E62',
  },
} as const

export interface MaterialChartColors {
  primary: string
  secondary: string
  tertiary: string
  quaternary: string
  quinary: string
  success: string
  warning: string
  error: string
}

export interface MaterialThemeTokens {
  seedColor: string
  density: MaterialDensity
  isDark: boolean
  colors: Record<string, string>
  cssVars: Record<string, string>
  chartColors: MaterialChartColors
  chartPalette: string[]
}

export interface MaterialTypographyOptions {
  fontFamily: string
  numberFontFamily: string
}

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const IMAGE_LOAD_TIMEOUT_MS = 15000

const COLOR_MAPPINGS: Array<[string, string]> = [
  ['primary', 'primary'],
  ['on-primary', 'onPrimary'],
  ['primary-container', 'primaryContainer'],
  ['on-primary-container', 'onPrimaryContainer'],
  ['secondary', 'secondary'],
  ['on-secondary', 'onSecondary'],
  ['secondary-container', 'secondaryContainer'],
  ['on-secondary-container', 'onSecondaryContainer'],
  ['tertiary', 'tertiary'],
  ['on-tertiary', 'onTertiary'],
  ['tertiary-container', 'tertiaryContainer'],
  ['on-tertiary-container', 'onTertiaryContainer'],
  ['error', 'error'],
  ['on-error', 'onError'],
  ['error-container', 'errorContainer'],
  ['on-error-container', 'onErrorContainer'],
  ['background', 'background'],
  ['on-background', 'onBackground'],
  ['surface', 'surface'],
  ['on-surface', 'onSurface'],
  ['surface-variant', 'surfaceVariant'],
  ['on-surface-variant', 'onSurfaceVariant'],
  ['outline', 'outline'],
  ['outline-variant', 'outlineVariant'],
  ['shadow', 'shadow'],
  ['scrim', 'scrim'],
  ['inverse-surface', 'inverseSurface'],
  ['inverse-on-surface', 'inverseOnSurface'],
  ['inverse-primary', 'inversePrimary'],
  ['surface-dim', 'surfaceDim'],
  ['surface-bright', 'surfaceBright'],
  ['surface-container-lowest', 'surfaceContainerLowest'],
  ['surface-container-low', 'surfaceContainerLow'],
  ['surface-container', 'surfaceContainer'],
  ['surface-container-high', 'surfaceContainerHigh'],
  ['surface-container-highest', 'surfaceContainerHighest'],
]

const LIGHT_FALLBACK_COLORS: Record<string, string> = {
  'primary': '#006A60',
  'on-primary': '#FFFFFF',
  'primary-container': '#9FF2E5',
  'on-primary-container': '#00201C',
  'secondary': '#4A635E',
  'on-secondary': '#FFFFFF',
  'secondary-container': '#CCE8E1',
  'on-secondary-container': '#06201B',
  'tertiary': '#456179',
  'on-tertiary': '#FFFFFF',
  'tertiary-container': '#CCE5FF',
  'on-tertiary-container': '#001E31',
  'error': '#BA1A1A',
  'on-error': '#FFFFFF',
  'error-container': '#FFDAD6',
  'on-error-container': '#410002',
  'background': '#FAFDF9',
  'on-background': '#191C1B',
  'surface': '#FAFDF9',
  'on-surface': '#191C1B',
  'surface-variant': '#DAE5E1',
  'on-surface-variant': '#3F4946',
  'outline': '#6F7976',
  'outline-variant': '#BEC9C5',
  'shadow': '#000000',
  'scrim': '#000000',
  'inverse-surface': '#2E3130',
  'inverse-on-surface': '#EFF1EF',
  'inverse-primary': '#83D5CA',
  'surface-dim': '#DADEDA',
  'surface-bright': '#FAFDF9',
  'surface-container-lowest': '#FFFFFF',
  'surface-container-low': '#F4F7F4',
  'surface-container': '#EEF2EE',
  'surface-container-high': '#E9ECE9',
  'surface-container-highest': '#E3E6E3',
}

const DARK_FALLBACK_COLORS: Record<string, string> = {
  'primary': '#83D5CA',
  'on-primary': '#003731',
  'primary-container': '#005048',
  'on-primary-container': '#9FF2E5',
  'secondary': '#B1CCC5',
  'on-secondary': '#1C3530',
  'secondary-container': '#334B46',
  'on-secondary-container': '#CCE8E1',
  'tertiary': '#ADCAE6',
  'on-tertiary': '#153349',
  'tertiary-container': '#2D4A61',
  'on-tertiary-container': '#CCE5FF',
  'error': '#FFB4AB',
  'on-error': '#690005',
  'error-container': '#93000A',
  'on-error-container': '#FFDAD6',
  'background': '#191C1B',
  'on-background': '#E1E3DE',
  'surface': '#191C1B',
  'on-surface': '#E1E3DE',
  'surface-variant': '#3F4946',
  'on-surface-variant': '#BEC9C5',
  'outline': '#89938F',
  'outline-variant': '#3F4946',
  'shadow': '#000000',
  'scrim': '#000000',
  'inverse-surface': '#E1E3DE',
  'inverse-on-surface': '#2E3130',
  'inverse-primary': '#006A60',
  'surface-dim': '#111411',
  'surface-bright': '#373A37',
  'surface-container-lowest': '#0C0F0C',
  'surface-container-low': '#191C1B',
  'surface-container': '#1D201D',
  'surface-container-high': '#282B28',
  'surface-container-highest': '#333532',
}

const SURFACE_TONES = {
  light: {
    'surface-dim': 87,
    'surface-bright': 98,
    'surface-container-lowest': 100,
    'surface-container-low': 96,
    'surface-container': 94,
    'surface-container-high': 92,
    'surface-container-highest': 90,
  },
  dark: {
    'surface-dim': 6,
    'surface-bright': 24,
    'surface-container-lowest': 4,
    'surface-container-low': 10,
    'surface-container': 12,
    'surface-container-high': 17,
    'surface-container-highest': 22,
  },
} as const

function getFallbackColors(isDark: boolean) {
  return isDark ? DARK_FALLBACK_COLORS : LIGHT_FALLBACK_COLORS
}

function applySurfaceToneColors(
  colors: Record<string, string>,
  neutralPalette: { tone: (tone: number) => number },
  isDark: boolean,
) {
  const tones = isDark ? SURFACE_TONES.dark : SURFACE_TONES.light
  for (const [name, tone] of Object.entries(tones)) {
    colors[name] = hexFromArgb(neutralPalette.tone(tone))
  }
}

export function normalizeHexColor(value: unknown, fallback = DEFAULT_MATERIAL_SEED_COLOR): string {
  if (typeof value !== 'string')
    return fallback

  const trimmed = value.trim()
  if (!HEX_COLOR_RE.test(trimmed))
    return fallback

  if (trimmed.length === 4) {
    const [, r, g, b] = trimmed
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }

  return trimmed.toUpperCase()
}

export function isMonetColorMode(value: unknown): value is MonetColorMode {
  return value === 'seed' || value === 'palette' || value === 'wallpaper'
}

export function resolveMonetPaletteSeed(value: unknown, fallback = DEFAULT_MATERIAL_SEED_COLOR): string {
  if (typeof value !== 'string') {
    return fallback
  }

  const palette = MONET_PALETTES[value as MonetPaletteName]
  return palette ? palette.seedColor : fallback
}

function loadImageForColorExtraction(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const timeoutId = window.setTimeout(() => {
      image.onload = null
      image.onerror = null
      reject(new Error('Image color extraction timed out'))
    }, IMAGE_LOAD_TIMEOUT_MS)

    image.crossOrigin = 'anonymous'
    image.onload = () => {
      window.clearTimeout(timeoutId)
      resolve(image)
    }
    image.onerror = () => {
      window.clearTimeout(timeoutId)
      reject(new Error('Image color extraction failed'))
    }
    image.src = url
  })
}

export async function extractMaterialSeedColorFromImageUrl(url: string): Promise<string> {
  const trimmedUrl = url.trim()
  if (!trimmedUrl) {
    throw new Error('Image URL is empty')
  }

  const image = await loadImageForColorExtraction(trimmedUrl)
  return hexFromArgb(await sourceColorFromImage(image)).toUpperCase()
}

export function buildMaterialThemeTokens(
  seedColor: string,
  isDark: boolean,
  density: MaterialDensity,
  typography: MaterialTypographyOptions,
): MaterialThemeTokens {
  const normalizedSeed = normalizeHexColor(seedColor)
  const colors: Record<string, string> = {}
  const fallbackColors = getFallbackColors(isDark)

  try {
    const theme = themeFromSourceColor(argbFromHex(normalizedSeed))
    const scheme = isDark ? theme.schemes.dark : theme.schemes.light
    const schemeJson = scheme.toJSON() as Record<string, number>

    for (const [cssName, jsonName] of COLOR_MAPPINGS) {
      const value = schemeJson[jsonName]
      colors[cssName] = typeof value === 'number' ? hexFromArgb(value) : fallbackColors[cssName]!
    }
    applySurfaceToneColors(colors, theme.palettes.neutral, isDark)
  }
  catch {
    Object.assign(colors, fallbackColors)
  }

  const chartColors: MaterialChartColors = {
    primary: colors.primary!,
    secondary: colors.secondary!,
    tertiary: colors.tertiary!,
    quaternary: colors['inverse-primary']!,
    quinary: isDark ? '#8FCBFF' : '#006CBA',
    success: isDark ? '#8DD7A5' : '#006D3B',
    warning: isDark ? '#FFB95C' : '#8B5000',
    error: colors.error!,
  }

  const cssVars: Record<string, string> = {}
  for (const [name, value] of Object.entries(colors)) {
    cssVars[`--md-sys-color-${name}`] = value
  }

  Object.assign(cssVars, {
    '--md-ref-seed-color': normalizedSeed,
    '--md-app-density-scale': density === 'compact' ? '0' : '1',
    '--md-app-card-padding': density === 'compact' ? '14px' : '18px',
    '--md-app-grid-gap': density === 'compact' ? '12px' : '16px',
    '--md-app-row-height': density === 'compact' ? '56px' : '68px',
    '--md-app-card-radius': '12px',
    '--md-app-card-radius-small': '8px',
    '--md-app-card-radius-large': '16px',
    '--md-app-control-radius': '999px',
    '--md-sys-shape-corner-none': '0',
    '--md-sys-shape-corner-extra-small': '4px',
    '--md-sys-shape-corner-small': '8px',
    '--md-sys-shape-corner-medium': '12px',
    '--md-sys-shape-corner-large': '16px',
    '--md-sys-shape-corner-large-increased': '20px',
    '--md-sys-shape-corner-extra-large': '28px',
    '--md-sys-shape-corner-full': '9999px',
    '--md-app-elevation-1': `0 1px 2px color-mix(in srgb, ${colors.shadow} 30%, transparent), 0 1px 3px 1px color-mix(in srgb, ${colors.shadow} 15%, transparent)`,
    '--md-app-elevation-2': `0 1px 2px color-mix(in srgb, ${colors.shadow} 30%, transparent), 0 2px 6px 2px color-mix(in srgb, ${colors.shadow} 15%, transparent)`,
    '--md-app-elevation-3': `0 4px 8px 3px color-mix(in srgb, ${colors.shadow} 15%, transparent), 0 1px 3px color-mix(in srgb, ${colors.shadow} 30%, transparent)`,
    '--md-app-state-hover': '0.08',
    '--md-app-state-focus': '0.12',
    '--md-app-state-pressed': '0.12',
    '--md-app-state-dragged': '0.16',
    '--md-app-motion-easing-standard': 'cubic-bezier(0.2, 0, 0, 1)',
    '--md-app-motion-easing-emphasized': 'cubic-bezier(0.2, 0, 0, 1)',
    '--md-app-motion-duration-short': '150ms',
    '--md-app-motion-duration-medium': '250ms',
    '--md-app-font-family': typography.fontFamily,
    '--md-app-number-font-family': typography.numberFontFamily,
    '--md-ref-typeface-brand': typography.fontFamily,
    '--md-ref-typeface-plain': typography.fontFamily,
    '--md-ref-typeface-weight-regular': '400',
    '--md-ref-typeface-weight-medium': '500',
    '--md-ref-typeface-weight-bold': '700',
    '--md-sys-typescale-display-large-font': 'var(--md-ref-typeface-brand)',
    '--md-sys-typescale-display-large-size': '57px',
    '--md-sys-typescale-display-large-line-height': '64px',
    '--md-sys-typescale-display-large-weight': '700',
    '--md-sys-typescale-display-large-tracking': '-0.25px',
    '--md-sys-typescale-display-medium-font': 'var(--md-ref-typeface-brand)',
    '--md-sys-typescale-display-medium-size': '45px',
    '--md-sys-typescale-display-medium-line-height': '52px',
    '--md-sys-typescale-display-medium-weight': '700',
    '--md-sys-typescale-display-medium-tracking': '0',
    '--md-sys-typescale-display-small-font': 'var(--md-ref-typeface-brand)',
    '--md-sys-typescale-display-small-size': '36px',
    '--md-sys-typescale-display-small-line-height': '44px',
    '--md-sys-typescale-display-small-weight': '700',
    '--md-sys-typescale-display-small-tracking': '0',
    '--md-sys-typescale-headline-large-font': 'var(--md-ref-typeface-brand)',
    '--md-sys-typescale-headline-large-size': '32px',
    '--md-sys-typescale-headline-large-line-height': '40px',
    '--md-sys-typescale-headline-large-weight': '700',
    '--md-sys-typescale-headline-large-tracking': '0',
    '--md-sys-typescale-headline-medium-font': 'var(--md-ref-typeface-brand)',
    '--md-sys-typescale-headline-medium-size': '28px',
    '--md-sys-typescale-headline-medium-line-height': '36px',
    '--md-sys-typescale-headline-medium-weight': '700',
    '--md-sys-typescale-headline-medium-tracking': '0',
    '--md-sys-typescale-headline-small-font': 'var(--md-ref-typeface-brand)',
    '--md-sys-typescale-headline-small-size': '24px',
    '--md-sys-typescale-headline-small-line-height': '32px',
    '--md-sys-typescale-headline-small-weight': '700',
    '--md-sys-typescale-headline-small-tracking': '0',
    '--md-sys-typescale-title-large-font': 'var(--md-ref-typeface-brand)',
    '--md-sys-typescale-title-large-size': '22px',
    '--md-sys-typescale-title-large-line-height': '28px',
    '--md-sys-typescale-title-large-weight': '700',
    '--md-sys-typescale-title-large-tracking': '0',
    '--md-sys-typescale-title-medium-font': 'var(--md-ref-typeface-plain)',
    '--md-sys-typescale-title-medium-size': '16px',
    '--md-sys-typescale-title-medium-line-height': '24px',
    '--md-sys-typescale-title-medium-weight': '700',
    '--md-sys-typescale-title-medium-tracking': '0.15px',
    '--md-sys-typescale-title-small-font': 'var(--md-ref-typeface-plain)',
    '--md-sys-typescale-title-small-size': '14px',
    '--md-sys-typescale-title-small-line-height': '20px',
    '--md-sys-typescale-title-small-weight': '700',
    '--md-sys-typescale-title-small-tracking': '0.1px',
    '--md-sys-typescale-body-large-font': 'var(--md-ref-typeface-plain)',
    '--md-sys-typescale-body-large-size': '16px',
    '--md-sys-typescale-body-large-line-height': '24px',
    '--md-sys-typescale-body-large-weight': '600',
    '--md-sys-typescale-body-large-tracking': '0.5px',
    '--md-sys-typescale-body-medium-font': 'var(--md-ref-typeface-plain)',
    '--md-sys-typescale-body-medium-size': '14px',
    '--md-sys-typescale-body-medium-line-height': '20px',
    '--md-sys-typescale-body-medium-weight': '600',
    '--md-sys-typescale-body-medium-tracking': '0.25px',
    '--md-sys-typescale-body-small-font': 'var(--md-ref-typeface-plain)',
    '--md-sys-typescale-body-small-size': '12px',
    '--md-sys-typescale-body-small-line-height': '16px',
    '--md-sys-typescale-body-small-weight': '600',
    '--md-sys-typescale-body-small-tracking': '0.4px',
    '--md-sys-typescale-label-large-font': 'var(--md-ref-typeface-plain)',
    '--md-sys-typescale-label-large-size': '14px',
    '--md-sys-typescale-label-large-line-height': '20px',
    '--md-sys-typescale-label-large-weight': '700',
    '--md-sys-typescale-label-large-tracking': '0.1px',
    '--md-sys-typescale-label-medium-font': 'var(--md-ref-typeface-plain)',
    '--md-sys-typescale-label-medium-size': '12px',
    '--md-sys-typescale-label-medium-line-height': '16px',
    '--md-sys-typescale-label-medium-weight': '700',
    '--md-sys-typescale-label-medium-tracking': '0.5px',
    '--md-sys-typescale-label-small-font': 'var(--md-ref-typeface-plain)',
    '--md-sys-typescale-label-small-size': '11px',
    '--md-sys-typescale-label-small-line-height': '16px',
    '--md-sys-typescale-label-small-weight': '700',
    '--md-sys-typescale-label-small-tracking': '0.5px',
    '--md-chart-primary': chartColors.primary,
    '--md-chart-secondary': chartColors.secondary,
    '--md-chart-tertiary': chartColors.tertiary,
    '--md-chart-quaternary': chartColors.quaternary,
    '--md-chart-quinary': chartColors.quinary,
    '--md-chart-success': chartColors.success,
    '--md-chart-warning': chartColors.warning,
    '--md-chart-error': chartColors.error,
  })

  return {
    seedColor: normalizedSeed,
    density,
    isDark,
    colors,
    cssVars,
    chartColors,
    chartPalette: [
      chartColors.primary,
      chartColors.tertiary,
      chartColors.secondary,
      chartColors.quinary,
      chartColors.quaternary,
      chartColors.success,
      chartColors.warning,
      '#C36C9A',
    ],
  }
}

export function applyMaterialThemeTokens(tokens: MaterialThemeTokens, root = document.documentElement) {
  for (const [name, value] of Object.entries(tokens.cssVars)) {
    root.style.setProperty(name, value)
  }

  root.style.setProperty('--primary-color', tokens.colors.primary!)
  root.style.setProperty('--primary-color-hover', tokens.colors['primary-container']!)
  root.style.setProperty('--primary-color-pressed', tokens.colors['on-primary-container']!)
  root.style.setProperty('--secondary-color', tokens.colors.secondary!)

  // 兼容少量旧样式变量，迁移期避免遗漏处直接崩样式。
  root.style.setProperty('--n-color', tokens.colors.surface!)
  root.style.setProperty('--n-color-hover', tokens.colors['surface-container-high']!)
  root.style.setProperty('--n-border-radius', '12px')
  root.style.setProperty('--n-border-color', tokens.colors['outline-variant']!)
  root.style.setProperty('--n-text-color-1', tokens.colors['on-surface']!)
  root.style.setProperty('--n-text-color-2', tokens.colors['on-surface-variant']!)
  root.style.setProperty('--n-text-color-3', tokens.colors.outline!)
  root.style.setProperty('--n-tab-color-active', tokens.colors['secondary-container']!)
}
