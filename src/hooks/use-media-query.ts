import { useEffect, useState } from 'react'

/**
 * 响应式断点判断（CSS matchMedia 的 React 封装）。
 * 用于「桌面持久面板 / 移动端退化为 Modal」等需要在 JS 侧感知断点的场景
 * （纯 CSS 的 `hidden lg:block` 无法驱动 Modal 这类靠 open prop 控制的组件）。
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false
  )

  useEffect(() => {
    const mql = window.matchMedia(query)
    const handleChange = () => setMatches(mql.matches)
    handleChange()
    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [query])

  return matches
}
