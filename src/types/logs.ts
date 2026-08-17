import type { Money } from './account'

export interface HistogramBucket {
  bucket_start: string
  count: number
}

export interface LogHistogram {
  granularity: string
  buckets: HistogramBucket[]
}

/** 模型请求执行态（后端契约 #450）：未发起 / 调用成功 / 调用失败。 */
export type ModelRequestState = 'not_started' | 'completed' | 'failed'

/** 护栏处理结果（后端契约 #450）：仅标记并放行 / 脱敏后继续 / 直接拦截。 */
export type GuardrailAction = 'flag' | 'redact' | 'block'

/** 护栏命中规则来源（后端契约 #450）：全局 / Key / 成员。 */
export type GuardrailScope = 'global' | 'key' | 'personal'

/** 护栏命中类别（后端契约 #450）。 */
export type GuardrailCategory =
  | 'prompt_injection'
  | 'workspace_budget'
  | 'member_budget'
  | 'key_budget'
  | 'model_blacklist'
  | 'ip_allowlist'

/**
 * 护栏命中决策（后端契约 #450，随 model-logs 行返回）。
 * 整体缺省（后端未返回 / 未命中）时，日志页面降级为原有 status 三状态派生，不依赖本字段。
 */
export interface GuardrailDecision {
  /** 命中规则名 */
  rule_name?: string
  /** 处理结果：仅标记放行 flag / 脱敏后继续 redact / 已拦截 block */
  action?: GuardrailAction
  /** 命中类别 */
  category?: GuardrailCategory
  /** 规则来源作用域 */
  rule_scope?: GuardrailScope
  /** 脱敏替换片段数，仅 redact 有值 */
  transformed_fragment_count?: number
  /** 脱敏替换标记（后端网关未下发，暂恒空，勿依赖） */
  replacement_token?: string
}

export interface CallLogItem {
  call_log_id: string
  request_id: string
  started_at: string
  duration_ms: number
  model: { id: string; display_name: string }
  provider: { id: string; name: string; type: string }
  workspace_id: string
  /** 归属空间显示名（#459 待后端在 model-logs 补 workspace{id,name}）；未返回时前端显「—」，不 join 兜底 */
  workspace?: { workspace_id?: string; name?: string }
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
   * 模型请求执行态（后端契约 #450）。为 'not_started'（如护栏拦截）时，
   * Token/费用/延迟展示为空。后端未返回时缺省，页面降级用 status 派生。
   */
  model_request_state?: ModelRequestState | null
  /** 护栏备用扁平字段（后端契约 #450）：命中规则 id / 展示名 / 命中原因码 */
  guardrail_id?: string | null
  guardrail_name?: string | null
  guardrail_reason?: string | null
}

/** 调用日志 Summary（需求方#668）：跟随全部筛选的同步侧聚合指标。
 *  后端契约 qa#605 交付前多数字段缺失 → undefined，展示层显「—」，不得用 0 冒充。 */
export interface LogsSummary {
  total_requests?: number
  total_tokens?: number
  succeeded?: number
  failed?: number
  guardrail_hits?: number
  total_cost?: Money
  /** 有实际费用的记录数（费用均值分母，避免未计费记录拉低均值） */
  cost_records?: number
  /** 仅统计有耗时数据的记录（被拦截/未发起不进分母） */
  avg_duration_ms?: number
  avg_ttft_ms?: number
}

export interface LogPayload {
  body_b64: string
  content_type: string
  size: number
  truncated: boolean
}
