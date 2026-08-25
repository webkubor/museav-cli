import type { CallLogItem, GuardrailAction, ModelRequestState } from '@/types'

/**
 * 调用日志护栏语义派生（原型阶段 #434）。
 *
 * 护栏命中不再必然拦截：可能「记录后继续」「脱敏后继续」并照常产生 Token/费用/延迟，
 * 也可能「已拦截」使模型请求未发起。这里把原型新字段（guardrail_decision +
 * model_request_state）收敛成列表与详情共用的派生值；后端未返回新字段时，整体降级
 * 到原有 status 三状态，保证页面不崩。
 */

export type DerivedLogStatus = 'success' | 'guarded' | 'error' | 'canceled'

/** 是否携带原型新字段（护栏决策 / 模型请求态）；都缺省时走 status 降级分支。 */
function hasGuardrailModel(row: CallLogItem): boolean {
  return row.model_request_state != null || row.guardrail_decision != null
}

function isClientCanceled(row: CallLogItem): boolean {
  if (row.error_code === 'client_canceled') return true
  if (row.finish_reason === 'canceled') return true
  return row.http_status === 499
}

/**
 * 列表主状态派生：
 * - 客户端取消（prd#830）优先：error_code=client_canceled / finish_reason=canceled / HTTP 499 → 已取消
 * - model_request_state === 'failed' → 异常
 * - 否则有 guardrail_decision（命中）→ 护栏命中
 * - 其余 → 成功
 * 降级（无新字段）：failed→异常 / rejected→护栏命中 / 其余→成功。
 */
export function deriveLogStatus(row: CallLogItem): DerivedLogStatus {
  if (isClientCanceled(row)) return 'canceled'
  if (hasGuardrailModel(row)) {
    if (row.model_request_state === 'failed') return 'error'
    if (row.guardrail_decision) return 'guarded'
    return 'success'
  }
  if (row.status === 'failed') return 'error'
  if (row.status === 'rejected') return 'guarded'
  return 'success'
}

/**
 * 模型请求是否未发起 → Token/费用/延迟置空。
 * 脱敏后继续（model_request_state==='completed'）不置空，仍展示完整指标。
 * 降级：无新字段时 rejected（旧口径的护栏拦截）视为未发起。
 */
export function isModelNotStarted(row: CallLogItem): boolean {
  if (row.model_request_state != null) return row.model_request_state === 'not_started'
  if (row.guardrail_decision) return false
  return row.status === 'rejected'
}

/** 是否护栏命中（用于详情护栏区块 / 脱敏展示判定）。 */
export function isGuardrailHit(row: CallLogItem): boolean {
  return deriveLogStatus(row) === 'guarded'
}

/** 处理结果：优先 action；降级时按是否发起推断（未发起=已拦截 block，否则仅标记 flag）。 */
export function guardrailAction(row: CallLogItem): GuardrailAction {
  if (row.guardrail_decision?.action) return row.guardrail_decision.action
  return isModelNotStarted(row) ? 'block' : 'flag'
}

/** 模型调用态（详情「模型调用」项）。降级：failed→失败 / rejected→未发起 / 其余→调用成功。 */
export function modelCallState(row: CallLogItem): ModelRequestState {
  if (row.model_request_state != null) return row.model_request_state
  if (row.status === 'failed') return 'failed'
  if (row.status === 'rejected') return 'not_started'
  return 'completed'
}

/** 是否脱敏后继续（Request 只展示替换后的占位符、不展示原文）。 */
export function isRedacted(row: CallLogItem): boolean {
  return isGuardrailHit(row) && guardrailAction(row) === 'redact'
}

/**
 * 规则来源展示（详情「规则来源」项，后端契约 #450）：
 * 作用域前缀（全局/Key/成员护栏）+ " · " + 规则展示名（guardrail_name，回退 rule_name）。
 * 只拼后端真返回的字段，缺失不兜底假值：作用域缺省只显名、名缺省只显作用域、都无显「—」。
 */
export function guardrailSourceLabel(row: CallLogItem, t: (key: string) => string): string {
  const scope = row.guardrail_decision?.rule_scope
  const name = row.guardrail_name || row.guardrail_decision?.rule_name || ''
  const scopeLabel = scope ? t(`logs.guardrail.scope.${scope}`) : ''
  if (scopeLabel && name) return `${scopeLabel} · ${name}`
  return scopeLabel || name || '—'
}

/**
 * 命中类别展示（详情「命中规则」项）：显示命中的**类别**（提示词注入 / Key 预算 …），
 * 而非规则实例名（规则实例名已在「规则来源」展示）。取后端 guardrail_decision.category，
 * 缺失/未返回时返回 ''，由调用方显「—」（不兜底假标签）。需后端返回语义 category（#461）。
 */
export function guardrailCategoryLabel(row: CallLogItem, t: (key: string) => string): string {
  const category = row.guardrail_decision?.category
  return category ? t(`logs.guardrail.category.${category}`) : ''
}

/** 脱敏占位符（替换命中的注入内容，展示用固定 token）。 */
export const REDACTION_PLACEHOLDER = '[PROMPT_INJECTION]'
