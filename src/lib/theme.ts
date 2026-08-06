import { storageKeys } from '@/lib/storage'
import { getMarket, getMarketQueryOverride } from '@/lib/market'

export type Theme = 'dark' | 'light' | 'system'

/** 无用户偏好时的默认主题随市场：国外(global, modelgo.ai)深色、国内(china)浅色 */
export function getMarketDefaultTheme(): 'dark' | 'light' {
  return getMarket() === 'global' ? 'dark' : 'light'
}
export type BrandThemeMode = 'default' | 'custom'

export interface BrandThemeConfig {
  mode: BrandThemeMode
  /** 后台主题色只需传一个 base 色，前端会生成一组 brand token。 */
  base?: string
}

function isValidTheme(v: string | null): v is Theme {
  return v === 'dark' || v === 'light' || v === 'system'
}

function isValidHexColor(value: string | undefined): value is string {
  return Boolean(value && /^#[0-9a-fA-F]{6}$/.test(value))
}

/** 初始加载时读匿名 key（userId 尚未就绪）；市场默认主题由 getMarketDefaultTheme 决定。 */
export function getSavedTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  // 共享测试域名从国际站带 market=global 进入时，不能沿用国内站留下的浅色偏好。
  if (getMarketQueryOverride()) return getMarketDefaultTheme()
  const saved = localStorage.getItem(storageKeys.theme())
  if (isValidTheme(saved)) return saved
  return getMarketDefaultTheme()
}

/** 读用户 theme，优先用户 key，降级匿名 key */
export function getUserTheme(userId: string): Theme {
  const saved = localStorage.getItem(storageKeys.themeByUser(userId))
  if (isValidTheme(saved)) return saved
  return getSavedTheme()
}

/** 持久化 theme：有 userId 则写用户 key，同时更新匿名 key 作为下次冷启动兜底 */
export function saveTheme(theme: Theme, userId?: string | null) {
  if (typeof window !== 'undefined') {
    if (userId) localStorage.setItem(storageKeys.themeByUser(userId), theme)
    localStorage.setItem(storageKeys.theme(), theme)
    localStorage.setItem(storageKeys.themeModified(), 'true')
  }
}

export function resolveTheme(theme: Theme): 'dark' | 'light' {
  if (theme !== 'system') return theme
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

/** 当前页面实际生效的主题（读 DOM 真值，反映用户的即时切换） */
export function getActiveTheme(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.getAttribute('theme-mode') === 'dark' ? 'dark' : 'light'
}

/**
 * 给跨站链接（文档站）拼上当前主题参数，实现跳转时主题同步。
 * 文档站读 `?theme=dark|light` 初始化自身主题；非法或异常时原样返回。
 */
export function appendThemeParam(url: string): string {
  if (!url) return url
  try {
    const u = new URL(url)
    u.searchParams.set('theme', getActiveTheme())
    return u.toString()
  } catch {
    return url
  }
}

/** 跳转来源（文档站）通过 `?theme=` 带来的主题，仅接受合法值 */
export function readThemeFromUrl(): 'dark' | 'light' | null {
  if (typeof window === 'undefined') return null
  const v = new URLSearchParams(window.location.search).get('theme')
  return v === 'dark' || v === 'light' ? v : null
}

export function applyTheme(theme: Theme) {
  const resolved = resolveTheme(theme)
  if (resolved === 'dark') {
    document.documentElement.setAttribute('theme-mode', 'dark')
    document.body.setAttribute('theme-mode', 'dark')
    // 同步共享 token 的主题开关（modelgo-design-tokens 用 [data-theme] 切深浅）
    document.documentElement.setAttribute('data-theme', 'dark')
  } else {
    document.documentElement.removeAttribute('theme-mode')
    document.body.removeAttribute('theme-mode')
    document.documentElement.removeAttribute('data-theme')
  }
  // 重新计算并应用品牌色，以适配新主题的莫兰迪转换
  applyBrandTheme(getSavedBrandTheme())
}

export function getSavedBrandTheme(): BrandThemeConfig {
  if (typeof window === 'undefined') return { mode: 'default' }
  try {
    const raw = localStorage.getItem(storageKeys.brandTheme())
    if (!raw) return { mode: 'default' }
    const parsed = JSON.parse(raw) as Partial<BrandThemeConfig>
    if (parsed.mode === 'custom' && isValidHexColor(parsed.base)) {
      return { mode: 'custom', base: parsed.base }
    }
  } catch {
    /* ignore invalid local cache */
  }
  return { mode: 'default' }
}

export function saveBrandTheme(config: BrandThemeConfig) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(storageKeys.brandTheme(), JSON.stringify(config))
  } catch {
    /* ignore */
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.slice(1)
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ]
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`
}

function mixColor(hex: string, target: [number, number, number], amount: number): string {
  const source = hexToRgb(hex)
  return rgbToHex([
    source[0] + (target[0] - source[0]) * amount,
    source[1] + (target[1] - source[1]) * amount,
    source[2] + (target[2] - source[2]) * amount,
  ])
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  let h = 0, s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break
      case g: h = (b - r) / d + 2; break
      case b: h = (r - g) / d + 4; break
    }
    h /= 6
  }
  return [h * 360, s, l]
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  let r: number
  let g: number
  let b: number
  h /= 360
  if (s === 0) {
    r = g = b = l // achromatic
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1
      if (t > 1) t -= 1
      if (t < 1/6) return p + (q - p) * 6 * t
      if (t < 1/2) return q
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6
      return p
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h + 1/3)
    g = hue2rgb(p, q, h)
    b = hue2rgb(p, q, h - 1/3)
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)]
}

function adjustColorForDark(hex: string): string {
  const [r, g, b] = hexToRgb(hex)
  const [h, rawS, rawL] = rgbToHsl(r, g, b)
  // 不大幅降低饱和度，只乘以 0.92 保持高饱满度的品牌色，与 Logo 一致
  const s = Math.max(0, rawS * 0.92)
  // 亮度调整: 限制在 46% - 58% 之间，既能在暗底上有活力，又防刺眼
  const l = Math.max(0.46, Math.min(0.58, rawL))
  const [nr, ng, nb] = hslToRgb(h, s, l)
  return rgbToHex([nr, ng, nb])
}

function buildBrandPalette(base: string, isDark: boolean) {
  const adjustedBase = isDark ? adjustColorForDark(base) : base
  const [r, g, b] = hexToRgb(adjustedBase)
  return {
    '--brand-deep': isDark ? mixColor(adjustedBase, [0, 0, 0], 0.25) : mixColor(adjustedBase, [0, 0, 0], 0.18),
    '--brand-base': adjustedBase,
    '--brand-mid': isDark ? mixColor(adjustedBase, [255, 255, 255], 0.12) : mixColor(adjustedBase, [255, 255, 255], 0.22),
    '--brand-light': isDark ? mixColor(adjustedBase, [255, 255, 255], 0.25) : mixColor(adjustedBase, [255, 255, 255], 0.48),
    '--brand-pale': isDark ? `color-mix(in srgb, ${adjustedBase} 12%, var(--mg-bg-0-solid))` : `color-mix(in srgb, ${adjustedBase} 10%, var(--mg-bg-0-solid))`,
    '--brand-glow': `rgba(${r}, ${g}, ${b}, 0.16)`,
    '--brand-selected-bg': `color-mix(in srgb, ${adjustedBase} 10%, transparent)`,
  }
}

export function applyBrandTheme(config: BrandThemeConfig) {
  if (typeof document === 'undefined') return
  const rootStyle = document.documentElement.style
  const tokenNames = [
    '--brand-deep',
    '--brand-base',
    '--brand-mid',
    '--brand-light',
    '--brand-pale',
    '--brand-glow',
    '--brand-selected-bg',
  ]

  if (config.mode === 'default' || !isValidHexColor(config.base)) {
    tokenNames.forEach((name) => rootStyle.removeProperty(name))
    return
  }

  const isDark = document.documentElement.getAttribute('theme-mode') === 'dark' || document.body.getAttribute('theme-mode') === 'dark'
  const palette = buildBrandPalette(config.base, isDark)
  Object.entries(palette).forEach(([name, value]) => {
    rootStyle.setProperty(name, value)
  })
}
