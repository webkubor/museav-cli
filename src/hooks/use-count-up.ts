import { useState, useEffect, useRef } from 'react'

/**
 * 数值补间。**只有真实的数值变化才补间**——「还没拿到数据」不是一次数值变化。
 *
 * `target` 传 `undefined` 表示数据未就绪：此时不渲染动画、不推进数值；首次拿到真实值
 * 直接落定（无补间），之后 target 再变才走 700ms 补间。
 *
 * 两次踩坑都源自把「加载/挂载」误当成「数值变化」：
 * - prd#631 轮1：路由切回时组件重挂载，从 0 重放 0→target，整排 KPI 卡集体重滚 → 首帧
 *   直接呈现目标值修掉。
 * - prd#631 轮2：仍然闪。因为调用方在 loading 期间喂 0、数据到达再喂真值，等于制造了一次
 *   并不存在的 0→382.14 变化，照样补间 700ms；期间每帧都是高精度小数（金额格式化上限
 *   4 位），文本宽度随之抖动、卡片高度跟着跳。test 实测序列：
 *   `CNY 0` → `CNY 382.1396` → `CNY 382.14`，下方内容位移 4px。
 */
export function useCountUp(target: number | undefined, duration = 700): number {
  const [value, setValue] = useState(target ?? 0)
  const valueRef = useRef(target ?? 0)
  // 是否已经落定过一个真实值——未落定前的 target 变化属于「数据到达」，不是数值变化
  const settledRef = useRef(target !== undefined)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    // 数据未就绪：保持现值，不动画
    if (target === undefined) return

    // 首次拿到真实值（含挂载即有值、缓存命中、loading → 数据到达）：直接落定
    if (!settledRef.current) {
      settledRef.current = true
      valueRef.current = target
      setValue(target)
      return
    }

    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)

    const from = valueRef.current
    const startTime = performance.now()

    const tick = (now: number) => {
      // 下界必须 clamp：jsdom/happy-dom 的 rAF 时钟偶发给出比 startTime 更早的 now
      // （首帧 now < startTime），progress 会成为一个很大的负数，三次缓动把它放大成
      // 一个跟 target 毫无关系的诡异负数（真实浏览器里几乎不会发生，但测试环境常见）。
      const progress = Math.max(0, Math.min((now - startTime) / duration, 1))
      const eased = 1 - Math.pow(1 - progress, 3)
      const next = progress < 1 ? from + (target - from) * eased : target
      valueRef.current = next
      setValue(next)
      if (progress < 1) rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [target, duration])

  return value
}
