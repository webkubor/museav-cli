import { useRef, useEffect } from 'react'

/**
 * 高性能 3D 倾斜跟随 Hook。
 * 鼠标在元素上移动时，按光标位置写 CSS 变量 --tilt-x/--tilt-y（deg），由 CSS
 * `transform: perspective() rotateX/rotateY` 消费——只动合成属性，不触发布局/重绘、不引起 React 重渲染。
 * mouseenter 缓存 rect（避免逐帧读 layout）、rAF 节流、mouseleave 归位；prefers-reduced-motion 下不启用。
 */
export function useTilt<T extends HTMLElement>(maxDeg = 6) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    let rect: DOMRect | null = null
    let raf = 0
    let nx = 0
    let ny = 0

    const apply = () => {
      raf = 0
      el.style.setProperty('--tilt-x', `${nx.toFixed(2)}deg`)
      el.style.setProperty('--tilt-y', `${ny.toFixed(2)}deg`)
    }
    const onEnter = () => {
      rect = el.getBoundingClientRect()
    }
    const onMove = (e: MouseEvent) => {
      if (!rect) rect = el.getBoundingClientRect()
      const px = (e.clientX - rect.left) / rect.width // 0..1
      const py = (e.clientY - rect.top) / rect.height // 0..1
      ny = (px - 0.5) * 2 * maxDeg // 横向 → rotateY
      nx = -(py - 0.5) * 2 * maxDeg // 纵向 → rotateX（反向，符合"抬头看"直觉）
      if (!raf) raf = requestAnimationFrame(apply)
    }
    const onLeave = () => {
      rect = null
      if (raf) {
        cancelAnimationFrame(raf)
        raf = 0
      }
      el.style.setProperty('--tilt-x', '0deg')
      el.style.setProperty('--tilt-y', '0deg')
    }

    el.addEventListener('mouseenter', onEnter, { passive: true })
    el.addEventListener('mousemove', onMove, { passive: true })
    el.addEventListener('mouseleave', onLeave, { passive: true })
    return () => {
      el.removeEventListener('mouseenter', onEnter)
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseleave', onLeave)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [maxDeg])

  return ref
}
