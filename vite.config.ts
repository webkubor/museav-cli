import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { devLoggerPlugin } from './scripts/dev-logger-plugin'
import { version } from './package.json'

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [react(), devLoggerPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5175,
  },
})



