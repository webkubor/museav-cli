import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

// src/test/setup.ts 把本 hook 全局 mock 成「直接返回 target」，好让别的测试不必处理动画。
// 本文件是这个 hook 自己的测试，必须解除 mock，否则测到的是 mock 而不是实现
// （prd#631 两轮回归都发生在这个 hook 里，却一直没有单测覆盖，正是被这个全局 mock 挡住了）。
vi.unmock('@/hooks/use-count-up')

import { useCountUp } from './use-count-up'

/**
 * 契约：**只有真实的数值变化才补间**。加载完成、组件重挂载都不算数值变化。
 * 这两条是 prd#631 两轮回归的根因，故用例直接钉住它们。
 */
describe('useCountUp', () => {
  it('挂载即有值：首帧就是目标值，不从 0 重放（prd#631 轮1）', () => {
    const { result } = renderHook(() => useCountUp(42))
    expect(result.current).toBe(42)
  })

  it('数据未就绪（undefined）时不推进数值', () => {
    const { result } = renderHook(() => useCountUp(undefined))
    expect(result.current).toBe(0)
  })

  it('loading → 数据到达：直接落定，不产生任何中间值（prd#631 轮2）', () => {
    const { result, rerender } = renderHook(
      ({ t }) => useCountUp(t),
      { initialProps: { t: undefined as number | undefined } }
    )
    act(() => { rerender({ t: 382.14 }) })

    // 一步到位——不会出现 382.1396 这种位数不定的中间帧
    expect(result.current).toBe(382.14)
  })

  it('落定后的真实数值变化仍然补间（动画本身不能被误删）', () => {
    const { result, rerender } = renderHook(
      ({ t }) => useCountUp(t),
      { initialProps: { t: undefined as number | undefined } }
    )
    act(() => { rerender({ t: 100 }) })   // 数据到达：落定
    expect(result.current).toBe(100)

    act(() => { rerender({ t: 200 }) })   // 真实变化：走补间，起点是当前值而不是 0
    expect(result.current).toBeGreaterThanOrEqual(100)
    expect(result.current).toBeLessThanOrEqual(200)
  })
})
