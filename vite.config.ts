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
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'https://test.modelgo.com',
        changeOrigin: true,
      },
    },
  },
}))



