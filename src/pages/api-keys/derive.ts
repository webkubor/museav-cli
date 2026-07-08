/**
 * API Keys 派生工具（PRD v1.0.3）
 * 后端 #382-384 字段未全交付前，这里统一「有则用、无则回退」，让 UI 先按 PRD 跑起来，
 * 后端字段落地即自动切换真值。禁止在组件里散落这套回退逻辑。
 */
import type {
  ApiKeyItem,
  ApiKeyMember,
  ApiKeyStatus,
  ApiKeySummary,
  ApiKeyType,
  Money,
} from '@/types'

/** scope → key_type 回退映射（personal→私有 / member→成员 / workspace→服务） */
const SCOPE_TO_TYPE: Record<ApiKeyItem['scope'], ApiKeyType> = {
  personal: 'personal',
  member: 'member',
  workspace: 'service',
}

export const KEY_TYPE_LABEL: Record<ApiKeyType, string> = {
  personal: '私有 Key',
  member: '成员 Key',
  service: '服务 Key',
}

export const KEY_TYPE_DESC: Record<ApiKeyType, string> = {
  personal: '当前成员负责，适合个人开发、测试或本地接入。',
  member: '管理员代建，指定成员负责和接收通知。',
  service: '工作空间服务或生产系统使用。',
}

export const STATUS_LABEL: Record<ApiKeyStatus, string> = {
  active: '启用中',
  rotation_required: '待轮转',
  limited: '已达限额',
  expired: '已过期',
  disabled: '已停用',
  revoked: '已撤销',
}

/** key 类型：后端 key_type 优先，否则由 scope 派生 */
export function deriveKeyType(item: ApiKeyItem): ApiKeyType {
  return item.key_type ?? SCOPE_TO_TYPE[item.scope] ?? 'personal'
}

/** 负责人：responsible_member 优先，否则回退 owner（=创建人） */
export function responsibleOf(item: ApiKeyItem): ApiKeyMember {
  return item.responsible_member ?? item.owner
}

/** 维护人：maintainer_member 优先，否则回退 owner */
export function maintainerOf(item: ApiKeyItem): ApiKeyMember {
  return item.maintainer_member ?? item.owner
}

/** 本期消费：period_spend 优先，否则回退 total_spend */
export function periodSpendOf(item: ApiKeyItem): Money {
  return item.period_spend ?? item.total_spend
}

/** 最近调用时间：last_called_at 优先，否则回退 last_used_at */
export function lastCalledOf(item: ApiKeyItem): string | null {
  return item.last_called_at ?? item.last_used_at
}

/** 是否 N 天内到期（默认 7 天，PRD「即将过期」口径） */
export function isExpiringSoon(item: ApiKeyItem, withinDays = 7): boolean {
  if (!item.expires_at) return false
  const exp = new Date(item.expires_at).getTime()
  if (Number.isNaN(exp)) return false
  const now = Date.now()
  return exp > now && exp - now <= withinDays * 24 * 60 * 60 * 1000
}

/** 是否处于「可调用」态（对齐 PRD isApiKeyCallable：启用中或待轮转——新 Token 已生效） */
export function isCallable(item: ApiKeyItem): boolean {
  return item.status === 'active' || item.status === 'rotation_required'
}

/** 累加金额（amount 为十进制字符串），币种取首个非空项 */
function sumMoney(items: ApiKeyItem[], pick: (i: ApiKeyItem) => Money | undefined): Money {
  let total = 0
  let currency = 'CNY'
  for (const it of items) {
    const m = pick(it)
    if (!m) continue
    const n = Number(m.amount)
    if (!Number.isNaN(n)) total += n
    if (m.currency) currency = m.currency
  }
  return { amount: total.toFixed(2), currency }
}

/**
 * 从列表客户端派生 5 摘要卡（后端 /summary 未交付前的真源）。
 * 全部/启用中/7天内即将过期/已达限额/本月消费。
 */
export function deriveSummary(items: ApiKeyItem[]): ApiKeySummary {
  return {
    total: items.length,
    active: items.filter(isCallable).length,
    expiring_soon: items.filter((i) => isExpiringSoon(i)).length,
    limit_reached: items.filter((i) => i.status === 'limited').length,
    month_spend: sumMoney(items, periodSpendOf),
  }
}

/** 行级能力回退：后端 can_* 优先，否则用传入的权限布尔 */
export function cap(itemFlag: boolean | undefined, permFallback: boolean): boolean {
  return itemFlag ?? permFallback
}
