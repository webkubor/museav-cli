import type { Money } from './account'

export interface HistogramBucket {
  bucket_start: string
  count: number
}

export interface LogHistogram {
  granularity: string
  buckets: HistogramBucket[]
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
