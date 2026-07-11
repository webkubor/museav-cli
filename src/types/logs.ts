import type { Money } from './account'

export interface HistogramBucket {
  bucket_start: string
  count: number
}

export interface LogHistogram {
  granularity: string
  buckets: HistogramBucket[]
}

/** 模型请求执行态（原型阶段前端建模，后端 #432 未落地）：未发起 / 成功 / 失败。 */
export type ModelRequestState = 'not_started' | 'succeeded' | 'failed'

/** 护栏处理结果（原型阶段前端建模）：仅记录后继续 / 脱敏后继续 / 直接拦截。 */
export type GuardrailAction = 'log_only' | 'redacted' | 'blocked'

/**
 * 护栏命中决策（原型字段 #434，后端 #432 未落地）。
 * 整体缺省（后端未返回）时，日志页面降级为原有 status 三状态派生，不依赖本字段。
 */
export interface GuardrailDecision {
  /** 命中规则名 */
  rule_name?: string
  /** 处理结果：记录后继续 / 脱敏后继续 / 已拦截 */
  action?: GuardrailAction
  /** 规则来源（如：全局护栏 / 空间护栏 / 个人护栏） */
  rule_source?: string
}

export interface CallLogItem {
  call_log_id: string
  request_id: string
  started_at: string
  duration_ms: number
  model: { id: string; display_name: string }
  provider: { id: string; name: string; type: string }
  workspace_id: string
  tenant_id: string
  trace_id: string
  requested_model: string
  upstream_model: string
  path: string
  call_type: string
  http_status: number
  tpot_ms: number
  /** 回退次数（原型 Fallback 卡）：后端 runtime_detail 内派生，无则 0 */
  fallback_count: number
  api_key: { api_key_id: string; name: string; masked: string }
  account: { account_id: string; display_name: string }
  app_name: string | null
  status: 'accepted' | 'succeeded' | 'failed' | 'rejected'
  finish_reason: string | null
  usage: {
    input_tokens: number
    output_tokens: number
    total_tokens: number
    cache_read_tokens: number
    cache_write_tokens: number
  }
  usage_type: string
  speed: { tps: number; first_token_ms: number }
  cost: Money
  billing_status: string
  error: string | null
  /**
   * 护栏命中决策（原型字段 #434）。护栏命中不再必然拦截：可能「记录后继续」或
   * 「脱敏后继续」并照常产生 Token/费用/延迟。后端未返回时缺省，页面降级用 status 派生。
   */
  guardrail_decision?: GuardrailDecision | null
  /**
   * 模型请求执行态（原型字段 #434）。为 'not_started'（如预算拦截）时，
   * Token/费用/延迟展示为空。后端未返回时缺省，页面降级用 status 派生。
   */
  model_request_state?: ModelRequestState | null
}

export interface LogStats {
  from: string
  to: string
  granularity: string
  group_by: string
  totals: {
    total_requests: number
    succeeded: number
    failed: number
    rejected: number
    error_rate: number
    avg_duration_ms: number
    total_tokens: number
    total_cost: Money
  }
}

export interface LogPayload {
  body_b64: string
  content_type: string
  size: number
  truncated: boolean
}
