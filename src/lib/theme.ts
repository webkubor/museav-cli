import { storageKeys } from '@/lib/storage'

export type Theme = 'dark' | 'light' | 'system'
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

/** 初始加载时读匿名 key（userId 尚未就绪），无偏好默认浅色 */
export function getSavedTheme(): Theme {
  if (typeof window === 'undefined') return 'system'
  const saved = localStorage.getItem(storageKeys.theme())
  if (isValidTheme(saved)) return saved
  return 'light'
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

export function applyTheme(theme: Theme) {
  const resolved = resolveTheme(theme)
  if (resolved === 'dark') {
    document.body.setAttribute('theme-mode', 'dark')
  } else {
    document.body.removeAttribute('theme-mode')
  }
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

function buildBrandPalette(base: string) {
  const [r, g, b] = hexToRgb(base)
  return {
    '--brand-deep': mixColor(base, [0, 0, 0], 0.18),
    '--brand-base': base,
    '--brand-mid': mixColor(base, [255, 255, 255], 0.22),
    '--brand-light': mixColor(base, [255, 255, 255], 0.48),
    '--brand-pale': `color-mix(in srgb, ${base} 10%, var(--mg-bg-0))`,
    '--brand-glow': `rgba(${r}, ${g}, ${b}, 0.18)`,
    '--brand-selected-bg': `color-mix(in srgb, ${base} 9%, transparent)`,
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

  const palette = buildBrandPalette(config.base)
  Object.entries(palette).forEach(([name, value]) => {
    rootStyle.setProperty(name, value)
  })
}
