import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Standalone test config — intentionally does NOT load vite.config.ts so the
// PWA/build plugin chain stays out of the unit-test runtime.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
