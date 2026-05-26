import { getMarket } from './market'

export type Theme = 'dark' | 'light' | 'system'

const ANON_KEY = 'mg-theme'

function userKey(userId: string) {
  return `mg-theme:${userId}`
}

function isValidTheme(v: string | null): v is Theme {
  return v === 'dark' || v === 'light' || v === 'system'
}

/** 初始加载时读匿名 key（userId 尚未就绪），默认优先：国内浅色(light)，国外深色(dark) */
export function getSavedTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  const saved = localStorage.getItem(ANON_KEY)
  if (isValidTheme(saved)) return saved

  const market = getMarket()
  return market === 'domestic' ? 'light' : 'dark'
}

/** 读用户 theme，优先用户 key，降级匿名 key */
export function getUserTheme(userId: string): Theme {
  const saved = localStorage.getItem(userKey(userId))
  if (isValidTheme(saved)) return saved
  return getSavedTheme()
}

/** 持久化 theme：有 userId 则写用户 key，同时更新匿名 key 作为下次冷启动兜底 */
export function saveTheme(theme: Theme, userId?: string | null) {
  if (typeof window !== 'undefined') {
    if (userId) localStorage.setItem(userKey(userId), theme)
    localStorage.setItem(ANON_KEY, theme)
    localStorage.setItem('mg-theme-user-modified', 'true')
  }
}

export function resolveTheme(theme: Theme): 'dark' | 'light' {
  if (theme !== 'system') return theme
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function applyTheme(theme: Theme) {
  const resolved = resolveTheme(theme)
  document.documentElement.classList.toggle('light', resolved === 'light')
}
