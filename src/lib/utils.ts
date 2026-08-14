import i18n from 'i18next'


/** 格式化大数字为带千分位的字符串，如 1234567 → "1,234,567" */
export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString()
}

/** 截断字符串，超出部分显示省略号 */
export function truncate(str: string, maxLen = 30): string {
  return str.length <= maxLen ? str : str.slice(0, maxLen) + '…'
}

import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

/** 合并并处理 Tailwind CSS 类名的通用工具函数 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** 格式化上下文长度，如 128000 -> "128K", 1000000 -> "1M" */
export function formatContextLength(length: number | null | undefined): string {
  if (length == null || isNaN(length)) return '—'
  if (length >= 1_000_000) {
    return `${(length / 1_000_000).toFixed(0)}M`
  }
  if (length >= 1000) {
    return `${(length / 1000).toFixed(0)}K`
  }
  return String(length)
}

/** 模型展示名兜底：缺 display_name（或与 model_id 相同）时，取 model_id 末段转标题式。
 *  deepseek-v4-flash → DeepSeek V4 Flash；modelgo/web_fetch → Web Fetch */
/** 归一化厂商串用于比对：小写 + 去掉非字母数字（moonshot / MoonshotAI / Z.ai → moonshot / moonshotai / zai） */
function normalizeVendorKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * @param vendor 传入时，会剥掉 display_name 里与厂商重复的 `厂商: ` 前缀。
 *   线上（OpenRouter 风格）display_name 形如 `MoonshotAI: Kimi K3`，而 UI 紧邻位置
 *   本来就单独渲染一遍 provider，前缀纯属重复且白吃掉近 100px 宽度，导致模型名被截断
 *   （原型 App.tsx 的行结构是 `<strong>纯模型名</strong>` + 第二行 `provider · 任务`）。
 *   只在前缀确实等于该厂商时才剥，避免误伤名字里本就带冒号的模型；不传则行为不变。
 */
export function prettyModelName(displayName?: string | null, modelId?: string | null, vendor?: string | null): string {
  const dn = (displayName ?? '').trim()
  const id = (modelId ?? '').trim()
  if (dn && dn !== id) {
    const v = (vendor ?? '').trim()
    if (v) {
      const m = dn.match(/^([^:]{1,24}):\s*(.+)$/)
      if (m) {
        const prefixKey = normalizeVendorKey(m[1])
        const vendorKey = normalizeVendorKey(v)
        if (prefixKey && vendorKey && (prefixKey === vendorKey || prefixKey.startsWith(vendorKey) || vendorKey.startsWith(prefixKey))) {
          return m[2].trim()
        }
      }
    }
    return dn
  }
  const last = (id.split('/').pop() || id).trim()
  if (!last) return dn || id
  return last
    .replace(/[-_]+/g, ' ')
    .replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase())
}

/** 格式化计费价格，若零额或空则返回 "免费"，带货币符号及自适应后缀 */
/**
 * 裁掉后端 NUMERIC 的尾随零，保留有效小数。
 *
 * 后端下发的是全精度字符串（"30.000000000000"、"7.200000000000"），直接拼进 UI
 * 会显示成「¥30.000000000000/M」。这里只做**显示层**裁剪，不做四舍五入 —— 价格
 * 不能被前端改写，只能去掉不携带信息的尾零。
 */
export function trimPriceZeros(amount: number | string): string {
  const raw = String(amount)
  if (!raw.includes('.')) return raw
  const trimmed = raw.replace(/0+$/, '').replace(/\.$/, '')
  return trimmed === '' || trimmed === '-' ? '0' : trimmed
}

export function formatModelPrice(
  amount: number | string | null | undefined,
  currency = '$',
  suffix = '/M'
): string {
  const freeLabel = i18n.t('common.free', { ns: 'common' })
  if (amount == null || amount === '') return freeLabel
  const parsed = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(parsed) || parsed <= 0) return freeLabel
  // 不舍入，只裁尾零；parsed 仅用于判断免费/有效
  return `${currency}${trimPriceZeros(amount)}${suffix}`
}

/** 提取名称首字母并大写做为备选头像文字 */
export function getFallbackAvatarText(name: string | null | undefined): string {
  if (!name) return '?'
  return name.trim().charAt(0).toUpperCase()
}

/** 获取浏览器语言偏好 */
export function getBrowserLanguage(): string {
  if (typeof navigator === 'undefined') return 'en'
  return navigator.language || (navigator as Navigator & { userLanguage?: string }).userLanguage || 'en'
}

/** 获取浏览器时区 (IANA 规范格式，如 "Asia/Shanghai") */
export function getBrowserTimeZone(): string {
  if (typeof Intl === 'undefined' || !Intl.DateTimeFormat) return 'UTC'
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** 浏览器屏幕与视口特性定义 */
export interface BrowserScreenInfo {
  width: number
  height: number
  dpr: number
  viewWidth: number
  viewHeight: number
}

/** 获取浏览器屏幕与视口尺寸信息 */
export function getBrowserScreenInfo(): BrowserScreenInfo {
  if (typeof window === 'undefined') {
    return { width: 0, height: 0, dpr: 1, viewWidth: 0, viewHeight: 0 }
  }
  return {
    width: window.screen?.width ?? 0,
    height: window.screen?.height ?? 0,
    dpr: window.devicePixelRatio ?? 1,
    viewWidth: window.innerWidth ?? 0,
    viewHeight: window.innerHeight ?? 0,
  }
}

/** 根据系统媒体查询获取浏览器当前的亮/暗色主题偏好 ('dark' | 'light') */
export function getSystemThemePreference(): 'dark' | 'light' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  return isDark ? 'dark' : 'light'
}

/**
 * 金额展示（与 referral #273 同口径，全站统一）：
 * 最多 4 位小数 + 千分位；正向极小值（0<n<0.0001）显示 "< {symbol}0.0001" 而非舍入成 0；
 * 非数字按 0。symbol 传 '' 则只出数字（调用方自带货币符号时用）。
 */
/** 金额格式化。symbol 由调用方从 useCurrency()（platform-config.settlement_currency）传入；
 *  默认 '¥' 只是历史兜底，新代码一律显式传 symbol（#372）。 */
export function formatMoney(amount: string | number | null | undefined, symbol = '¥'): string {
  const v = Number(amount)
  if (!Number.isFinite(v)) return `${symbol}0`
  if (v > 0 && v < 0.0001) return `< ${symbol}0.0001`
  return `${symbol}${v.toLocaleString('zh-CN', { maximumFractionDigits: 4 })}`
}

/**
 * 格式化金额为千分位亲和性显示格式，自适应处理高精度小数与标准货币小数
 * 比如：
 *   - 12800.5 => "12,800.50"
 *   - 0.002135 => "0.002135"
 *   - 0 => "0.00"
 */
export function formatFriendlyAmount(
  amount: number | string | null | undefined,
  currencySymbol = '',
  opts?: { minDecimals?: number; maxDecimals?: number }
): string {
  if (amount == null || amount === '') return '—'

  const n = typeof amount === 'string' ? Number(amount.trim()) : amount
  if (!Number.isFinite(n)) return '—'

  const maxDecimals = opts?.maxDecimals ?? 2
  const minDecimals = Math.min(opts?.minDecimals ?? 2, maxDecimals)

  // 千分位逗号 + 四舍五入到指定小数位（常规货币显示）
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  }).format(n)

  return `${currencySymbol}${formatted}`
}


