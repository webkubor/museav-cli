import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// KpiCard 数字滚动动效（700ms rAF 缓动）：测试里没人关心动画本身，只关心最终值；
// 真等 rAF 走完既慢又在 jsdom 时钟下不稳定（首帧 now 有时早于 startTime，见
// use-count-up.ts 的 clamp 修复）。全局 mock 成直接返回目标值，所有用到 KpiCard
// 的测试都不用各自处理这个动画。
vi.mock('@/hooks/use-count-up', () => ({
  useCountUp: (target: number) => target,
}))

if (typeof globalThis.localStorage === 'undefined' || typeof globalThis.localStorage.getItem !== 'function') {
  const store = new Map<string, string>()
  const storage: Storage = {
    get length() {
      return store.size
    },
    clear() {
      store.clear()
    },
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null
    },
    removeItem(key: string) {
      store.delete(key)
    },
    setItem(key: string, value: string) {
      store.set(key, String(value))
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage,
    configurable: true,
  })
}
