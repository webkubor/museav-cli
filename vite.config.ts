import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import SemiPlugin from '@douyinfe/semi-vite-plugin'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { devLoggerPlugin } from './scripts/dev-logger-plugin'
import { devRequirementsPlugin } from './scripts/dev-requirements-plugin'
import { version } from './package.json'

// Vite 8 + rolldown 严格检查 package exports，semi-ui 未声明 CSS 导出条件，需手动 bypass
const semiCssResolverPlugin = {
  name: 'resolve-semi-css',
  enforce: 'pre' as const,
  resolveId(id: string) {
    if (id === '@douyinfe/semi-ui/dist/css/semi.css') {
      return path.resolve(__dirname, 'node_modules/@douyinfe/semi-ui/dist/css/semi.css')
    }
  },
}

export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    'process.env.NODE_ENV': JSON.stringify(mode === 'test' ? 'development' : 'production'),
  },
  plugins: [
    semiCssResolverPlugin,
    react(),
    SemiPlugin({
      theme: '@douyinfe/semi-theme-default'
    }),
    devLoggerPlugin(),
    devRequirementsPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'brand/**'],
      manifest: {
        name: 'ModelGo Console',
        short_name: 'ModelGo',
        description: 'ModelGo AI Platform Console',
        theme_color: '#3b82f6',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: '/brand/modelgo-app-icon-dark.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/brand/modelgo-app-icon-light.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
            },
          },
        ],
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('react-dom') || id.includes('/react/')) return 'vendor-react'
          if (id.includes('react-router')) return 'vendor-router'
          if (id.includes('@tanstack/react-query')) return 'vendor-query'
          if (id.includes('@douyinfe/semi-ui') || id.includes('@douyinfe/semi-icons')) return 'vendor-semi'
          if (id.includes('i18next')) return 'vendor-i18n'
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'https://test.modelgo.com',
        changeOrigin: true,
        secure: true,
        cookieDomainRewrite: { 'test.modelgo.com': '' },
      },
    },
  },
}))



