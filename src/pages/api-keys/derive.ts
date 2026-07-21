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
  SpendingLimit,
} from '@/types'
import { formatMoney } from '@/lib/utils'
import { LIMIT_PERIOD_LABEL, type LimitPeriod } from './constants'
import { PERMS, type Permission } from '@/config/permissions'

/** 行级治理动作（需求方#68：权限码按「类型 × 动作」细分） */
export type ApiKeyAction = 'edit' | 'revoke' | 'disable' | 'rotate' | 'change_owner'

/** 类型 × 动作 → Permission ID；私有 Key 无「变更负责人」（负责人恒为本人） */
export const KEY_ACTION_PERMS: Record<ApiKeyType, Partial<Record<ApiKeyAction, Permission>>> = {
  personal: {
    edit: PERMS.API_KEYS_EDIT_PERSONAL,
    revoke: PERMS.API_KEYS_REVOKE_PERSONAL,
    disable: PERMS.API_KEYS_DISABLE_PERSONAL,
    rotate: PERMS.API_KEYS_ROTATE_PERSONAL,
  },
  member: {
    edit: PERMS.API_KEYS_EDIT_MEMBER,
    revoke: PERMS.API_KEYS_REVOKE_MEMBER,
    disable: PERMS.API_KEYS_DISABLE_MEMBER,
    rotate: PERMS.API_KEYS_ROTATE_MEMBER,
    change_owner: PERMS.API_KEYS_CHANGE_OWNER_MEMBER,
  },
  service: {
    edit: PERMS.API_KEYS_EDIT_SERVICE,
    revoke: PERMS.API_KEYS_REVOKE_SERVICE,
    disable: PERMS.API_KEYS_DISABLE_SERVICE,
    rotate: PERMS.API_KEYS_ROTATE_SERVICE,
    change_owner: PERMS.API_KEYS_CHANGE_OWNER_SERVICE,
  },
}

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

/** 创建人：PRD owner=创建人（后端 owner 字段）；用于「创建人」副标 */
export function creatorOf(item: ApiKeyItem): ApiKeyMember {
  return item.owner
}

/** 本期消费：period_spend 优先，否则回退 total_spend */
export function periodSpendOf(item: ApiKeyItem): Money {
  return item.period_spend ?? item.total_spend
}

/** 最近调用时间（后端 last_used_at） */
export function lastCalledOf(item: ApiKeyItem): string | null {
  return item.last_used_at
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

/** 限额副标：「¥800 / 每月」或「不限额」（PRD §8.2 周期口径，兼容旧 hour/week） */
export function formatLimit(item: ApiKeyItem): string {
  const l = item.limit
  if (!l || !l.amount || Number(l.amount) <= 0) return '不限额'
  const unit = LIMIT_PERIOD_LABEL[l.period_unit as string] ?? `每${l.period_unit}`
  return `${l.currency} ${formatMoney(l.amount, '')} / ${unit}`
}

/** 当前 Key 的限额周期（用于「调整限额」内联表单回填）；旧 hour/week 归一到 month */
export function currentLimitPeriod(item: ApiKeyItem): LimitPeriod {
  const l = item.limit
  if (!l || !l.amount || Number(l.amount) <= 0) return 'none'
  const u = l.period_unit as string
  if (u === 'day' || u === 'month' || u === 'total') return u
  return 'month'
}

/**
 * 由「限额周期 + 金额」构建下发的 spending_limit；none/空金额 → undefined（不限额）。
 * total 保留用于兼容历史回显，但当前创建 UI 不提供该选项，避免发送后端不接受的 period_unit。
 */
export function buildSpendingLimit(period: LimitPeriod, amount: string, currency: string): SpendingLimit | undefined {
  if (period === 'none' || period === 'total' || !amount || Number(amount) <= 0) return undefined
  return { amount, currency, period_unit: period as unknown as SpendingLimit['period_unit'], period_length: 1 }
}
