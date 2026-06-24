import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'
import { version } from './package.json'

// Standalone test config — intentionally does NOT load vite.config.ts so the
// PWA/build plugin chain stays out of the unit-test runtime.
export default defineConfig({
  // 注入与 vite.config 一致的构建期常量，供错误诊断等依赖版本号的逻辑在测试下取值。
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __BUILD_HASH__: JSON.stringify(''),
    __BUILD_TIME__: JSON.stringify(''),
  },
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
