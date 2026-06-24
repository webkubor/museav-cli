import { useRef, useEffect } from 'react'

/**
 * 高性能鼠标流光追踪 Hook。
 * 通过直接修改 CSS 自定义变量，不触发 React 重新渲染（Re-render），
 * 保证 120Hz 满帧率 GPU 硬件加速渲染。
 */
export function useMouseGlow<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const handleMouseMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      el.style.setProperty('--mouse-x', `${x}px`)
      el.style.setProperty('--mouse-y', `${y}px`)
    }

    el.addEventListener('mousemove', handleMouseMove, { passive: true })
    return () => {
      el.removeEventListener('mousemove', handleMouseMove)
    }
  }, [])

  return ref
}
