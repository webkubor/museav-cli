/**
 * 安全护栏派生工具（PRD v1.0.3 · #378-381）
 *
 * PRD 原型把护栏建模为「三层作用域 × 常规/提额 类型 × 三档预算闸门」的一等字段
 * （scope / kind / workspace|member|key budget）。后端当前只交付了基础契约
 * （guardrail.Detail：is_default + assignments + budget_policies[aggregation_scope] + metadata），
 * 尚无显式的 scope / kind 字段（#378 未交付）。这里统一「有则用、无则由现有字段派生兜底」，
 * 让 UI 先按 PRD 结构跑起来，后端补齐字段后把这些函数换成读真值即可。
 * 禁止在组件里散落这套回退逻辑。
 */
import type { GuardrailBudgetPolicy, GuardrailDetail } from '@/interfaces/guardrails'
import { trimAmountScale, groupThousands } from './budget'

export type GuardrailScope = 'global' | 'member' | 'key'
export type GuardrailKind = 'regular' | 'boost'

/** 预算周期单位 → 中文档位（对齐 PRD「/ 月」等文案） */
export const PERIOD_LABEL: Record<string, string> = {
  hour: '小时',
  day: '天',
  week: '周',
  month: '月',
}

export const KIND_LABEL: Record<GuardrailKind, string> = {
  regular: '常规',
  boost: '提额',
}

export const SCOPE_LABEL: Record<GuardrailScope, string> = {
  global: '全局',
  member: '个人',
  key: 'Key',
}

/** 预算闸门聚合口径（对齐 backend aggregation_scope） */
export type BudgetAggScope = 'guardrail_total' | 'per_member' | 'per_api_key'

function assignmentsOf(g: GuardrailDetail) {
  return g.assignments ?? []
}

/**
 * 作用域派生（#378 后端无显式 scope 字段时兜底）：
 * is_default → 全局；含 api_key 分配 → Key；含成员分配 → 个人；否则回退全局。
 */
export function deriveScope(g: GuardrailDetail): GuardrailScope {
  if (g.is_default) return 'global'
  const assignments = assignmentsOf(g)
  if (assignments.some((a) => a.subject_type === 'api_key' && a.api_key_id)) return 'key'
  if (assignments.some((a) => a.subject_type === 'member' && a.account_id)) return 'member'
  return 'global'
}

/**
 * 类型派生（#378 后端无 kind 字段时兜底）：metadata.kind === 'boost' → 提额，否则常规。
 * 后端未交付提额语义前，全部落为「常规」，提额相关列/卡片将自然显示 0 / 「-」。
 */
export function deriveKind(g: GuardrailDetail): GuardrailKind {
  return (g.metadata as Record<string, unknown> | undefined)?.kind === 'boost' ? 'boost' : 'regular'
}

/** 从 metadata 取字符串数组（model_blacklist / ip_whitelist） */
export function metadataList(g: GuardrailDetail, key: 'model_blacklist' | 'ip_whitelist'): string[] {
  const value = (g.metadata as Record<string, unknown> | undefined)?.[key]
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : []
}

// ─── 提示词注入检测（PRD 2026-07-10）─────────────────────────────────
// 网关侧真实检测/枚举字段落地前，模式经 metadata.prompt_injection_mode 往返
// （同 model_blacklist / ip_whitelist 的既有做法）。
export type PromptInjectionMode = 'off' | 'flag' | 'redact' | 'block'

export const PROMPT_INJECTION_MODES: PromptInjectionMode[] = ['off', 'flag', 'redact', 'block']

export const PROMPT_INJECTION_LABEL: Record<PromptInjectionMode, string> = {
  off: '关闭',
  flag: '仅记录',
  redact: '脱敏',
  block: '拦截',
}

/** info tooltip：命中后处理方式（只解释三种，不含关闭） */
export const PROMPT_INJECTION_HINTS: { mode: Exclude<PromptInjectionMode, 'off'>; text: string }[] = [
  { mode: 'flag', text: '记录命中，请求仍按原内容发送' },
  { mode: 'redact', text: '将命中内容替换为 [PROMPT_INJECTION] 后继续发送' },
  { mode: 'block', text: '直接拒绝请求，不发送给模型' },
]

export function isPromptInjectionMode(v: unknown): v is PromptInjectionMode {
  return typeof v === 'string' && (PROMPT_INJECTION_MODES as string[]).includes(v)
}

// 常规 Key 护栏可选「继承全局」；表单值 = 4 模式 + inherit。inherit 存库=不写该字段。
export const PROMPT_INJECTION_INHERIT = 'inherit' as const
export const PROMPT_INJECTION_INHERIT_LABEL = '继承全局护栏'
export type PromptInjectionFormValue = PromptInjectionMode | typeof PROMPT_INJECTION_INHERIT

/** 原始值：显式配置返回 mode，未配置返回 undefined（全局=按关闭兜底 / 常规 Key=按继承全局兜底，由调用方决定） */
export function rawPromptInjectionMode(g: GuardrailDetail): PromptInjectionMode | undefined {
  const v = (g.metadata as Record<string, unknown> | undefined)?.prompt_injection_mode
  return isPromptInjectionMode(v) ? v : undefined
}

/** 全局护栏生效模式：缺省 off（文档：全局护栏缺该字段按 off 处理） */
export function guardrailPromptInjectionMode(g: GuardrailDetail): PromptInjectionMode {
  return rawPromptInjectionMode(g) ?? 'off'
}

/**
 * API Key 提示词注入生效解析（文档§运行时）：常规 Key 护栏显式 > 启用中全局护栏 > off。
 * 返回最终模式 + 来源标签，供 API Key 创建的「生效规则预览」展示。
 */
export function resolveKeyPromptInjection(
  selectedGuardrails: GuardrailDetail[],
  activeGlobal: GuardrailDetail | undefined,
): { mode: PromptInjectionMode; sourceLabel: string } {
  const keyExplicit = selectedGuardrails.find(
    (g) => deriveScope(g) === 'key' && deriveKind(g) === 'regular' && rawPromptInjectionMode(g) !== undefined,
  )
  if (keyExplicit) {
    return { mode: rawPromptInjectionMode(keyExplicit)!, sourceLabel: `常规 Key 护栏 · ${keyExplicit.name}` }
  }
  if (activeGlobal) {
    const gm = rawPromptInjectionMode(activeGlobal)
    if (gm) return { mode: gm, sourceLabel: `全局护栏 · ${activeGlobal.name}` }
  }
  return { mode: 'off', sourceLabel: '默认关闭' }
}

/** 从护栏列表挑出启用中的全局护栏（生效解析用） */
export function activeGlobalGuardrail(list: GuardrailDetail[]): GuardrailDetail | undefined {
  return list.find((g) => deriveScope(g) === 'global' && g.status === 'active')
}

export function memberCount(g: GuardrailDetail): number {
  return assignmentsOf(g).filter((a) => a.subject_type === 'member' && a.account_id).length
}

export function apiKeyCount(g: GuardrailDetail): number {
  return assignmentsOf(g).filter((a) => a.subject_type === 'api_key' && a.api_key_id).length
}

function isActivePolicy(p: GuardrailBudgetPolicy): boolean {
  if (!p.enabled) return false
  if (!p.effective_to) return true
  const endsAt = Date.parse(p.effective_to)
  return Number.isNaN(endsAt) || endsAt > Date.now()
}

export function activePolicies(g: GuardrailDetail): GuardrailBudgetPolicy[] {
  return (g.budget_policies ?? []).filter(isActivePolicy)
}

/** 取某一聚合口径下的生效预算（多条时取 effective_from 最新一条） */
export function budgetByScope(g: GuardrailDetail, scope: BudgetAggScope): GuardrailBudgetPolicy | null {
  const matched = activePolicies(g).filter((p) => p.aggregation_scope === scope)
  if (matched.length === 0) return null
  return [...matched].sort((a, b) => Date.parse(b.effective_from) - Date.parse(a.effective_from))[0]
}

/** 个人 / Key 护栏行的主预算：取任一生效策略（最新一条） */
export function primaryBudget(g: GuardrailDetail): GuardrailBudgetPolicy | null {
  const actives = activePolicies(g)
  if (actives.length === 0) return null
  return [...actives].sort((a, b) => Date.parse(b.effective_from) - Date.parse(a.effective_from))[0]
}

/** 预算展示：无金额→「不限额」，否则「¥123 / 月」（去 NUMERIC 尾零） */
export function formatBudget(symbol: string, policy?: GuardrailBudgetPolicy | null): string {
  const amount = policy?.spend_limit_amount
  if (!policy || !amount || Number(amount) <= 0) return '不限额'
  const period = PERIOD_LABEL[policy.period_unit] ?? policy.period_unit
  return `${symbol}${groupThousands(trimAmountScale(amount))} / ${period}`
}

/**
 * 提额到期时间（#378/#379 提额语义未交付时兜底）：
 * metadata.expires_at 优先，否则取主预算 effective_to；都没有则 null（列显示「-」/「永不过期」）。
 */
export function boostExpiry(g: GuardrailDetail): string | null {
  const meta = (g.metadata as Record<string, unknown> | undefined)?.expires_at
  if (typeof meta === 'string' && meta) return meta
  return primaryBudget(g)?.effective_to || null
}

/**
 * 提额是否已过期（文档§过期提额）：到期时间早于当前时刻。非提额恒 false。
 * 默认列表用它隐藏过期提额，「已过期/已停用」筛选用它反选。
 */
export function isBoostExpired(g: GuardrailDetail): boolean {
  if (deriveKind(g) !== 'boost') return false
  const exp = boostExpiry(g)
  if (!exp) return false
  const t = Date.parse(exp)
  return !Number.isNaN(t) && t <= Date.now()
}

/**
 * 生效中全局护栏在某档（默认个人 / 默认 Key）的预算金额（数值，无 / 不限额→null）。
 * 常规护栏「≤ 全局默认」与提额护栏「> 当前生效」校验用它做本地比对（文档§校验规则）。
 */
export function globalDefaultAmount(
  list: GuardrailDetail[],
  scope: 'per_member' | 'per_api_key',
): number | null {
  const g = activeGlobalGuardrail(list)
  if (!g) return null
  const p = budgetByScope(g, scope)
  const amt = p?.spend_limit_amount
  if (!p || !amt || Number(amt) <= 0) return null
  return Number(amt)
}

/**
 * 某作用域下所有「常规护栏」的生效预算金额（数值）。下调全局默认时，
 * 若存在高于新默认值的常规护栏须报错（文档§校验规则）用它枚举比对。
 */
export function regularBudgetAmounts(list: GuardrailDetail[], scope: 'member' | 'key'): number[] {
  return list
    .filter((g) => deriveScope(g) === scope && deriveKind(g) === 'regular')
    .map((g) => {
      const amt = primaryBudget(g)?.spend_limit_amount
      return amt && Number(amt) > 0 ? Number(amt) : null
    })
    .filter((n): n is number => n !== null)
}

/** 预算策略的计量时区（文档§周期计量：涉及日期计算均用租户时区）；缺省回退浏览器时区 */
export function budgetTimezone(policy?: GuardrailBudgetPolicy | null): string {
  return policy?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone
}

export interface GuardrailSummary {
  global: number
  member: number
  key: number
  boost: number
}

/** 顶部摘要卡计数（全局 / 个人 / Key / 提额），由列表派生 */
export function summarize(list: GuardrailDetail[]): GuardrailSummary {
  const summary: GuardrailSummary = { global: 0, member: 0, key: 0, boost: 0 }
  for (const g of list) {
    const scope = deriveScope(g)
    if (scope === 'global') summary.global += 1
    else if (scope === 'member') summary.member += 1
    else summary.key += 1
    if (deriveKind(g) === 'boost') summary.boost += 1
  }
  return summary
}

// ─── 提额到期时间：ISO ↔ <input type="datetime-local"> 值互转 ───────────────
// datetime-local 取/给的是「本地无时区」字符串 YYYY-MM-DDTHH:mm；落库统一 ISO。

/** ISO → datetime-local 输入值（本地时区展示）；空/非法 → 空串 */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** datetime-local 输入值 → ISO；空/非法 → 空串 */
export function localInputToIso(v: string): string {
  if (!v) return ''
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '' : d.toISOString()
}

/** 名称模糊匹配（分区搜索用） */
export function nameMatches(g: GuardrailDetail, query: string): boolean {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return g.name.toLowerCase().includes(normalized)
}
