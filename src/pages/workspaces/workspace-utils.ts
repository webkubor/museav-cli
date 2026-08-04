/**
 * 空间管理页的纯函数与共享常量
 */
import { formatMoney as fmtMoney } from '@/lib/utils'
import type { Money } from '@/types'

export const MAX_INVITE_MEMBERS = 20

/** 名称派生 slug：小写化、空白转短横线，过滤非字母数字短横线的非法字符 */
export function slugify(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]+/g, '')
}

/**
 * 兜底 slug：中文/纯非 ASCII 名称 slugify 后会变成空字符串，后端 slug 必填（minLength 2），
 * 空值直接 400。用「租户 slug + 当前空间序号」拼一个必定合法、大概率不重复的默认值
 * （对齐用户预期：默认填入，少让手动输入；真撞车了已有的手动改 Slug 兜底路径处理）。
 */
export function fallbackSlug(tenantSlug: string | undefined, workspaceCount: number) {
  const base = tenantSlug ? slugify(tenantSlug) : ''
  return `${base || 'space'}-${workspaceCount + 1}`
}

/**
 * 格式化货币显示
 */
export function renderMoney(m?: Money) {
  if (!m) return '—'
  return `${m.currency} ${fmtMoney(m.amount, '')}`
}
