import type { CursorPage } from '@/types'

/**
 * 从后端响应中安全提取列表数据。
 * 兼容两种实际返回结构：
 *   - CursorPage<T>：{ items: T[], has_more, next_cursor }
 *   - 直接数组：T[]
 */
export function pageItems<T>(data: CursorPage<T> | T[] | null | undefined): T[] {
  if (!data) return []
  if (Array.isArray(data)) return data
  return Array.isArray(data.items) ? data.items : []
}


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

/** 格式化计费价格，若零额或空则返回 "免费"，带货币符号及自适应后缀 */
export function formatModelPrice(
  amount: number | string | null | undefined,
  currency = '$',
  suffix = '/M'
): string {
  if (amount == null || amount === '') return '免费'
  const parsed = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(parsed) || parsed <= 0) return '免费'
  return `${currency}${parsed.toFixed(2)}${suffix}`
}

/** 提取名称首字母并大写做为备选头像文字 */
export function getFallbackAvatarText(name: string | null | undefined): string {
  if (!name) return '?'
  return name.trim().charAt(0).toUpperCase()
}

/** 获取浏览器语言偏好 */
export function getBrowserLanguage(): string {
  if (typeof navigator === 'undefined') return 'en'
  return navigator.language || (navigator as any).userLanguage || 'en'
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
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return '—'

  // 处理极小数值（如单个 API 调用花费、Token 单价），保留更高精度
  if (num > 0 && num < 0.01) {
    const decimals = opts?.maxDecimals ?? 6
    const str = num.toFixed(decimals)
    const trimmed = str.replace(/0+$/, '') // 去除冗余尾随零
    const finalDecimals = Math.max(opts?.minDecimals ?? 2, trimmed.split('.')[1]?.length ?? 2)
    return `${currencySymbol}${num.toFixed(finalDecimals)}`
  }

  // 标准金额数值，采用千分位分隔并默认保留 2 位小数
  return `${currencySymbol}${num.toLocaleString('en-US', {
    minimumFractionDigits: opts?.minDecimals ?? 2,
    maximumFractionDigits: opts?.maxDecimals ?? 2,
  })}`
}



