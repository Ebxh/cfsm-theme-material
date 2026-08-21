import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig, loadEnv } from 'vite'

function splitList(value: string | undefined): string[] {
  return value?.split(',').map(item => item.trim()).filter(Boolean) ?? []
}

function normalizeOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol))
      return null
    return url.origin
  }
  catch {
    return null
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiBases = splitList(env.API_BASE).map(normalizeOrigin).filter((value): value is string => Boolean(value))

  return {
    // 默認相對路徑，同源部署 / 子路徑部署均可直接使用
    base: env.BASE_PATH || './',
    define: {
      __BUILD_VERSION__: JSON.stringify(process.env.npm_package_version || '1.2.0'),
      __BUILD_GIT_HASH__: JSON.stringify('cfsm'),
    },
    plugins: [
      vue({
        template: {
          compilerOptions: {
            isCustomElement: tag => tag.startsWith('md-'),
          },
        },
      }),
      UnoCSS(),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: env.API_BASE && apiBases.length === 1
        ? {
            '/api': {
              target: apiBases[0],
              changeOrigin: true,
              ws: true,
            },
            '^/(flags|os-icons|favicon.ico)': {
              target: apiBases[0],
              changeOrigin: true,
              configure(proxy) {
                proxy.on('proxyRes', (response) => {
                  if (response.statusCode && response.statusCode >= 200 && response.statusCode < 400)
                    response.headers['cache-control'] = 'public, max-age=31536000, immutable'
                })
              },
            },
          }
        : undefined,
    },
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks: {
            'vue-vendor': ['vue', 'vue-router', 'pinia'],
            'echarts': ['echarts', 'vue-echarts'],
            'material-web': [
              '@material/web/button/filled-button.js',
              '@material/web/button/outlined-button.js',
              '@material/web/button/text-button.js',
              '@material/web/progress/circular-progress.js',
              '@material/web/progress/linear-progress.js',
              '@material/web/textfield/outlined-text-field.js',
            ],
            'vueuse': ['@vueuse/core'],
          },
        },
      },
    },
  }
})
