import presetWind4 from '@unocss/preset-wind4'
import { defineConfig, transformerDirectives, transformerVariantGroup } from 'unocss'

export default defineConfig({
  presets: [
    presetWind4(),
  ],
  transformers: [
    transformerDirectives(),
    transformerVariantGroup(),
  ],
  theme: {
    colors: {
      primary: 'var(--primary-color)',
      secondary: 'var(--secondary-color)',
    },
  },
  rules: [
    // 毛玻璃效果 - 动态模糊半径（仅声明半径变量，由 .md-surface-glass 统一消费 backdrop-filter）
    [
      /^glass-(\d+)$/,
      ([, d]) => ({ '--md-app-card-blur': `${d}px` }),
    ],
  ],
  shortcuts: {
    'flex-center': 'flex items-center justify-center',
    'flex-between': 'flex items-center justify-between',
    'flex-col-center': 'flex flex-col items-center justify-center',
  },
})
