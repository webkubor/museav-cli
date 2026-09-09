/**
 * Vitest 统一配置。
 * 隔离 Vite 插件链并覆盖前端单元测试。
 */

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
    /**
     * 默认 5s 在本仓的全量跑下不够用。
     *
     * 98 个测试文件各起一套 jsdom + React 渲染，vitest 默认按 CPU 核数并发，机器
     * 饱和时单个 waitFor / findBy 轻易超过 5s。表现是「全量跑挂几条、单独跑必过」，
     * 而且每次挂的还不是同一批——2026-09-02 实测一次全量 15 条失败，其中 14 条是
     * `Test timed out in 5000ms`，散落在 customer-service / guardrails / models 等
     * 互不相干的模块里。这类假红会掩盖真回归，所以放宽到 15s。
     *
     * 阈值取 20s：实测被并发拖慢时单条用例可达 17.6s（organization 那条单独跑只要
     * 663ms，慢了 23 倍），15s 会卡在边缘上继续假红。
     *
     * 放宽的代价只有「真卡死的测试要多等一会儿才报错」，不影响正常用例的耗时。
     */
    testTimeout: 20_000,
    hookTimeout: 20_000,
    /**
     * 并发上限压到性能核数（本机 12 逻辑核 / 6 性能核）。
     *
     * 默认按逻辑核并发，12 个 fork 各建一套 jsdom 同时抢 CPU——实测全量 118s 里
     * environment 累计 627s，环境创建才是大头，争抢下单个用例被拖慢 20 倍以上
     * （organization 那条单独跑 663ms、并发下 15.5s）。压低并发让每个 fork 跑得动，
     * 反而更快也更稳。
     */
    poolOptions: {
      forks: { maxForks: 6 },
    },
  },
})
