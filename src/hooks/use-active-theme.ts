import { useEffect, useState } from 'react'

import { getActiveTheme } from '@/lib/theme'

/**
 * 响应式读取当前生效主题（'dark' | 'light'）。
 * theme.ts 的 applyTheme 落在 documentElement 的 theme-mode 属性上，
 * 这里用 MutationObserver 监听该属性，用户运行时切主题也能跟上——
 * 供 Toaster 等「主题由 prop 传入、不吃 CSS 变量」的第三方组件消费。
 */
export function useActiveTheme(): 'dark' | 'light' {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => getActiveTheme())

  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(getActiveTheme()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['theme-mode'] })
    return () => observer.disconnect()
  }, [])

  return theme
}
