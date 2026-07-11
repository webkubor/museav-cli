import type { CallLogItem, GuardrailAction, ModelRequestState } from '@/types'

/**
 * 调用日志护栏语义派生（原型阶段 #434）。
 *
 * 护栏命中不再必然拦截：可能「记录后继续」「脱敏后继续」并照常产生 Token/费用/延迟，
 * 也可能「已拦截」使模型请求未发起。这里把原型新字段（guardrail_decision +
 * model_request_state）收敛成列表与详情共用的派生值；后端未返回新字段时，整体降级
 * 到原有 status 三状态，保证页面不崩。
 */

export type DerivedLogStatus = 'success' | 'guarded' | 'error'

/** 是否携带原型新字段（护栏决策 / 模型请求态）；都缺省时走 status 降级分支。 */
function hasGuardrailModel(row: CallLogItem): boolean {
  return row.model_request_state != null || row.guardrail_decision != null
}

/**
 * 列表主状态派生（仅 3 态，不加次级标签）：
 * - model_request_state === 'failed' → 异常
 * - 否则有 guardrail_decision（命中）→ 护栏命中
 * - 其余 → 成功
 * 降级（无新字段）：failed→异常 / rejected→护栏命中 / 其余→成功。
 */
export function deriveLogStatus(row: CallLogItem): DerivedLogStatus {
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
 * 脱敏后继续（model_request_state==='succeeded'）不置空，仍展示完整指标。
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

/** 处理结果：优先 action；降级时按是否发起推断（未发起=已拦截，否则记录后继续）。 */
export function guardrailAction(row: CallLogItem): GuardrailAction {
  if (row.guardrail_decision?.action) return row.guardrail_decision.action
  return isModelNotStarted(row) ? 'blocked' : 'log_only'
}

/** 模型调用态（详情「模型调用」项）。降级：failed→失败 / rejected→未发起 / 其余→成功。 */
export function modelCallState(row: CallLogItem): ModelRequestState {
  if (row.model_request_state != null) return row.model_request_state
  if (row.status === 'failed') return 'failed'
  if (row.status === 'rejected') return 'not_started'
  return 'succeeded'
}

/** 是否脱敏后继续（Request 只展示替换后的占位符、不展示原文）。 */
export function isRedacted(row: CallLogItem): boolean {
  return isGuardrailHit(row) && guardrailAction(row) === 'redacted'
}

/** 脱敏占位符（替换命中的注入内容，展示用固定 token）。 */
export const REDACTION_PLACEHOLDER = '[PROMPT_INJECTION]'
