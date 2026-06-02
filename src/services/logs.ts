/**
 * 调用日志（§十三）
 * 路由：/logs
 * API：GET /model-logs、GET /model-logs/histogram、GET /model-logs/stats、GET /model-logs/:id、GET /model-logs/:id/payload
 */
import { get } from '@/lib/request'
import type { CallLogListParams, LogHistogramParams, LogStatsParams } from '@/interfaces/logs'
import type {
  CallLogDetail,
  CallLogItem,
  CursorPage,
  LogHistogram,
  LogPayload,
  LogStats,
  Money,
} from '@/types'

type ModelLogRow = {
  call_log_id?: string
  request_id: string
  started_at: string
  completed_at?: string
  workspace_id?: string
  account_id?: string
  api_key_id?: string
  requested_model?: string
  provider_instance_id?: string
  status?: string
  billing_status?: string
  error_code?: string
  error_message?: string
  input_tokens?: number
  output_tokens?: number
  cache_read_tokens?: number
  total_tokens?: number
  latency_ms?: number
  ttft_ms?: number
  tpot_ms?: number
  http_status?: number
  final_amount?: string
  cost_amount?: string
  currency?: string
  path?: string
  call_type?: string
  upstream_model?: string
  request_ctx?: Record<string, unknown>
  runtime_detail?: Record<string, unknown>
  model?: { id?: string; display_name?: string }
  provider?: { id?: string; name?: string; type?: string }
  api_key?: { api_key_id?: string; name?: string; masked?: string }
  account?: { account_id?: string; display_name?: string }
  app_name?: string | null
  duration_ms?: number
  finish_reason?: string | null
  usage?: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
    cache_read_tokens?: number
  }
  usage_type?: string
  speed?: { tps?: number; first_token_ms?: number }
  cost?: Money
  error?: string | null
}

type ModelLogListResponse = {
  items?: ModelLogRow[]
  limit?: number
}

type ModelLogDetailResponse = {
  log?: ModelLogRow
}

type ModelLogStatsResponse = {
  from?: string
  to?: string
  granularity?: string
  group_by?: string
  totals?: {
    spend?: string
    requests?: number
    tokens?: number
    currency?: string
  }
}

function numberOrZero(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function money(amount: string | undefined, currency: string | undefined): Money {
  return {
    amount: amount && amount.trim() ? amount : '0',
    currency: currency && currency.trim() ? currency : '',
  }
}

function stringFromMap(map: Record<string, unknown> | undefined, key: string) {
  const value = map?.[key]
  return typeof value === 'string' ? value : ''
}

function displayModel(row: ModelLogRow) {
  return (
    row.model?.display_name ||
    row.model?.id ||
    row.requested_model ||
    row.upstream_model ||
    stringFromMap(row.request_ctx, 'upstream_model') ||
    'unknown'
  )
}

function normalizeStatus(status: string | undefined): CallLogItem['status'] {
  if (
    status === 'accepted' ||
    status === 'succeeded' ||
    status === 'failed' ||
    status === 'rejected'
  ) {
    return status
  }
  return 'accepted'
}

function toCallLogItem(row: ModelLogRow): CallLogItem {
  const totalTokens = numberOrZero(row.total_tokens ?? row.usage?.total_tokens)
  const inputTokens = numberOrZero(row.input_tokens ?? row.usage?.input_tokens)
  const outputTokens = numberOrZero(row.output_tokens ?? row.usage?.output_tokens)
  const durationMs = numberOrZero(row.latency_ms ?? row.duration_ms)
  const modelName = displayModel(row)
  const providerID = row.provider_instance_id || row.provider?.id || 'unknown'
  const apiKeyID = row.api_key_id || row.api_key?.api_key_id || ''
  const accountID = row.account_id || row.account?.account_id || ''

  return {
    call_log_id: row.call_log_id || row.request_id,
    request_id: row.request_id,
    started_at: row.started_at,
    duration_ms: durationMs,
    model: {
      id: row.model?.id || modelName,
      display_name: modelName,
    },
    provider: {
      id: providerID,
      name: row.provider?.name || providerID,
      type: row.provider?.type || providerID,
    },
    workspace_id: row.workspace_id || '',
    api_key: {
      api_key_id: apiKeyID,
      name: row.api_key?.name || apiKeyID || '—',
      masked: row.api_key?.masked || apiKeyID || '—',
    },
    account: {
      account_id: accountID,
      display_name: row.account?.display_name || accountID || '—',
    },
    app_name: row.app_name ?? null,
    status: normalizeStatus(row.status),
    finish_reason: row.finish_reason ?? null,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens || inputTokens + outputTokens,
      cache_read_tokens: numberOrZero(row.cache_read_tokens ?? row.usage?.cache_read_tokens),
    },
    usage_type: row.usage_type || 'token',
    speed: {
      tps:
        numberOrZero(row.speed?.tps) || (durationMs > 0 ? outputTokens / (durationMs / 1000) : 0),
      first_token_ms: numberOrZero(row.ttft_ms ?? row.speed?.first_token_ms),
    },
    cost: row.cost ?? money(row.final_amount || row.cost_amount, row.currency),
    billing_status: row.billing_status || '',
    error: row.error ?? row.error_message ?? row.error_code ?? null,
  }
}

function toCallLogDetail(row: ModelLogRow): CallLogDetail {
  return {
    ...toCallLogItem(row),
    finished_at: row.completed_at || '',
    protocol: row.call_type || '',
    endpoint: row.path || '',
    billing: {
      billing_session_id: '',
      billing_status: row.billing_status || '',
      preauthorized_amount: '0',
      settled_amount: row.final_amount || row.cost_amount || '0',
    },
  }
}

function toListQuery(params?: CallLogListParams) {
  return {
    before_started_at: params?.before_started_at || params?.cursor,
    preset: params?.preset,
    workspace_id: params?.workspace_id,
    api_key_id: params?.api_key_id,
    request_id: params?.request_id || params?.q,
    model: params?.model_id,
    status: params?.status,
    limit: params?.limit || params?.page_size,
  }
}

function toCursorPage(
  data: ModelLogListResponse,
  requestedLimit?: number
): CursorPage<CallLogItem> {
  const items = (data.items ?? []).map(toCallLogItem)
  const limit = requestedLimit || data.limit || items.length
  const last = data.items?.[data.items.length - 1]
  const hasMore = limit > 0 && items.length >= limit

  return {
    items,
    page_size: limit,
    has_more: hasMore,
    next_cursor: hasMore && last?.started_at ? last.started_at : null,
  }
}

function toLogStats(data: ModelLogStatsResponse): LogStats {
  return {
    from: data.from || '',
    to: data.to || '',
    granularity: data.granularity || '',
    group_by: data.group_by || '',
    totals: {
      total_requests: data.totals?.requests ?? 0,
      succeeded: 0,
      failed: 0,
      rejected: 0,
      error_rate: 0,
      avg_duration_ms: 0,
      total_tokens: data.totals?.tokens ?? 0,
      total_cost: money(data.totals?.spend, data.totals?.currency),
    },
  }
}

/** 获取调用量直方图（48 根柱） */
export function getLogHistogram(params?: LogHistogramParams) {
  return get<LogHistogram>('model-logs/histogram', params)
}

/** 获取调用日志统计摘要（总量/错误率/耗时/Token/费用） */
export async function getLogStats(params?: LogStatsParams) {
  const data = await get<ModelLogStatsResponse>('model-logs/stats', params)
  return toLogStats(data)
}

/** 获取调用日志列表 */
export async function listCallLogs(params?: CallLogListParams) {
  const query = toListQuery(params)
  const data = await get<ModelLogListResponse>('model-logs', query)
  return toCursorPage(data, query.limit)
}

/**
 * 获取单条调用日志详情。
 * 仅当 workspace 开启 Input/Output Logging 时返回 prompt / completion 字段。
 */
export async function getCallLog(callLogId: string) {
  const data = await get<ModelLogDetailResponse>(`model-logs/${callLogId}`)
  return toCallLogDetail(data.log ?? { request_id: callLogId, started_at: '' })
}

/**
 * 获取日志原始 Payload（prompt + completion 完整内容）。
 * 需要 workspace 开启 Input/Output Logging；未开启时返回 null 字段。
 */
export function getLogPayload(requestId: string, kind: 'request' | 'response') {
  return get<LogPayload>(`model-logs/${requestId}/payload`, { kind })
}
