import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { devLoggerPlugin } from './scripts/dev-logger-plugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devLoggerPlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})


