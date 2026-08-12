import { useState, useEffect, useRef } from 'react'

export function useCountUp(target: number, duration = 700): number {
  const [value, setValue] = useState(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)

    const startTime = performance.now()

    const tick = (now: number) => {
      // 下界必须 clamp：jsdom/happy-dom 的 rAF 时钟偶发给出比 startTime 更早的 now
      // （首帧 now < startTime），progress 会成为一个很大的负数，三次缓动把它放大成
      // 一个跟 target 毫无关系的诡异负数（真实浏览器里几乎不会发生，但测试环境常见）。
      const progress = Math.max(0, Math.min((now - startTime) / duration, 1))
      const eased = 1 - Math.pow(1 - progress, 3)
      setValue(eased * target)
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setValue(target)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [target, duration])

  return value
}
