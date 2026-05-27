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

/** 格式化人民币金额，保留两位小数，如 "¥12.50" */
export function formatCNY(amount: number | string | null | undefined): string {
  if (amount == null || amount === '') return '—'
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(n)) return '—'
  return `¥${n.toFixed(2)}`
}

/** 格式化大数字为带千分位的字符串，如 1234567 → "1,234,567" */
export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—'
  return n.toLocaleString('zh-CN')
}

/** 截断字符串，超出部分显示省略号 */
export function truncate(str: string, maxLen = 30): string {
  return str.length <= maxLen ? str : str.slice(0, maxLen) + '…'
}
