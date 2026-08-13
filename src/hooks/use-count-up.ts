import { useState, useEffect, useRef } from 'react'

export function useCountUp(target: number, duration = 700): number {
  // 首帧直接呈现目标值：路由切回时组件重挂载、react-query 缓存命中的场景下
  // 不重放 0→target 的滚动（prd#631 每次切页 KPI 卡集体重滚被感知为"页面闪烁"）；
  // 首次真实加载仍有动画——挂载时 loading 态 target=0，数据到达后 target 变化触发下方补间。
  const [value, setValue] = useState(target)
  const valueRef = useRef(target)
  const mountedRef = useRef(false)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true
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
