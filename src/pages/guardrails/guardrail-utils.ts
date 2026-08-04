/**
 * 护栏页纯工具：预算三档草稿类型/常量与预算策略派生（原 index.tsx 内联 helper）。
 * 与 components/GuardrailDetailSheet 内的同形 ScopeBudgetDraft 保持一致。
 */
import type { AddBudgetPolicyRequest, GuardrailDetail, UpdateBudgetPolicyRequest } from '@/interfaces/guardrails'
import type { BudgetAggScope } from './derive'
import { trimAmountScale } from './budget'

export type PeriodUnit = 'hour' | 'day' | 'week' | 'month'

type BudgetPolicy = NonNullable<GuardrailDetail['budget_policies']>[number]

// 全局护栏（is_default）的三档预算闸门，各自对应一个 aggregation_scope（对齐 PRD）。
export interface ScopeBudgetDraft { amount: string; period: PeriodUnit; limited: boolean }

export const GLOBAL_BUDGET_SCOPES: BudgetAggScope[] = ['guardrail_total', 'per_member', 'per_api_key']

export const EMPTY_BUDGET_DRAFT: ScopeBudgetDraft = { amount: '', period: 'month', limited: false }

// 有生效策略 → 限额（回填规范金额）；无 → 不限额。
export function draftFromPolicy(p: BudgetPolicy | null): ScopeBudgetDraft {
  return p
    ? { amount: trimAmountScale(p.spend_limit_amount), period: p.period_unit, limited: true }
    : { ...EMPTY_BUDGET_DRAFT }
}

// 全局护栏脏数据判定：单个 aggregation_scope 下出现多条生效策略才算冲突
// （三档并存本身合法，区别于 member/key 的「全局单条」不变量）。
export function globalBudgetConflict(detail?: GuardrailDetail | null): boolean {
  const counts: Record<string, number> = {}
  for (const p of activeBudgetPolicies(detail)) {
    counts[p.aggregation_scope] = (counts[p.aggregation_scope] ?? 0) + 1
  }
  return Object.values(counts).some((c) => c > 1)
}

export type GlobalBudgetOp =
  | { type: 'add'; body: AddBudgetPolicyRequest }
  | { type: 'update'; policyId: string; body: UpdateBudgetPolicyRequest }
  | { type: 'delete'; policyId: string }

export function isActiveBudgetPolicy(policy: BudgetPolicy) {
  if (!policy.enabled) return false
  if (!policy.effective_to) return true
  const endsAt = Date.parse(policy.effective_to)
  return Number.isNaN(endsAt) || endsAt > Date.now()
}

export function activeBudgetPolicies(detail?: GuardrailDetail | null) {
  return detail?.budget_policies?.filter(isActiveBudgetPolicy) ?? []
}

// 单条不变量 (qa#162)：界面只有一个预算槽位。展示兜底取最新一条；
// 出现多条生效策略属于脏数据，由 budgetConflict 走报错分支而非静默展示。
export function currentBudgetPolicy(detail?: GuardrailDetail | null) {
  const actives = activeBudgetPolicies(detail)
  if (actives.length === 0) return null
  return [...actives].sort(
    (a, b) => Date.parse(b.effective_from) - Date.parse(a.effective_from),
  )[0]
}
