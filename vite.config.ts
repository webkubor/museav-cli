import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { devLoggerPlugin } from './scripts/dev-logger-plugin'
import { version } from './package.json'

export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    'process.env.NODE_ENV': JSON.stringify(mode === 'test' ? 'development' : 'production'),
  },
  plugins: [react(), devLoggerPlugin()],
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



