import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import SemiPlugin from '@douyinfe/semi-vite-plugin'
import path from 'path'
import { devLoggerPlugin } from './scripts/dev-logger-plugin'
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
    devLoggerPlugin()
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



