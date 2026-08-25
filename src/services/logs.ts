/**
 * 调用日志（§十三）
 * 路由：/logs
 * API：GET /model-logs、GET /model-logs/histogram、GET /model-logs/stats、GET /model-logs/:id、GET /model-logs/:id/payload
 */
import { get } from '@/lib/request'
import type { CallLogListParams, LogHistogramParams, LogStatsParams } from '@/interfaces/logs'
import type {
  CallLogItem,
  CursorPage,
  GuardrailDecision,
  LogHistogram,
  LogPayload,
  LogsSummary,
  ModelRequestState,
  Money,
} from '@/types'

type ModelLogRow = {
  call_log_id?: string
  request_id: string
  started_at: string
  completed_at?: string
  workspace_id?: string
  tenant_id?: string
  account_id?: string
  api_key_id?: string
  // 扁平归属名字段。仅 account_name 是真名可用；workspace_name / api_key_name 被后端
  // 填成 id（id 当名字，见后端单），故不消费——workspace/api_key 名走各自 nested 对象。
  account_name?: string
  api_key_name?: string
  workspace_name?: string
  trace_id?: string
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
  workspace?: { workspace_id?: string; name?: string }
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
    cache_write_tokens?: number
  }
  usage_type?: string
  speed?: { tps?: number; first_token_ms?: number }
  cost?: Money
  error?: string | null
  // 护栏字段（后端契约 #450，随行返回）
  guardrail_decision?: GuardrailDecision | null
  model_request_state?: ModelRequestState | null
  guardrail_id?: string | null
  guardrail_name?: string | null
  guardrail_reason?: string | null
}

type ModelLogListResponse = {
  items?: ModelLogRow[]
  limit?: number
  /** 当前筛选命中总数（qa#510）：首页默认返回，游标翻页省略以省 COUNT。 */
  total?: number
}

// Summary 契约（需求方#668 · 后端 qa#605，已交付）。
// 2026-08-19 在 test 实打 GET /model-logs/summary 确认字段与下面的类型完全一致：
//   totals = { requests, tokens, spend, currency, succeeded, failed, guardrail_hits,
//              spend_with_cost_count, avg_duration_ms, avg_ttft_ms }
// 字段可选是防御性的（后端某项缺失时宁可显「—」也不用 0 冒充），不代表还没交付。
type ModelLogStatsResponse = {
  totals?: {
    spend?: string
    requests?: number
    tokens?: number
    currency?: string
    succeeded?: number
    failed?: number
    guardrail_hits?: number
    avg_duration_ms?: number
    avg_ttft_ms?: number
    spend_with_cost_count?: number
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

/** 从 runtime_detail 派生回退次数（原型 Fallback 卡）。key 未在 Swagger 定义，按常见命名兜底取，取不到记 0。 */
function fallbackCount(runtime: Record<string, unknown> | undefined): number {
  if (!runtime) return 0
  const value = runtime.fallback_count ?? runtime.fallbacks ?? runtime.fallback
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value.length
  return 0
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
  const apiKeyID = row.api_key_id || ''
  const accountID = row.account_id || ''
  // 归属名只取"诚实的名字字段"（无名回空,绝不是 id）：
  //   account → 扁平 account_name（真名）；workspace/api_key → nested 对象的 name（无名为 ""/null）。
  //   ⚠️ 扁平 workspace_name / api_key_name 被后端填成 id（id 当名字），不能用——见后端单。
  const apiKeyName = row.api_key?.name || ''
  const accountName = row.account_name || ''
  const workspaceName = row.workspace?.name || ''

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
      // provider_instance_id 是内部实例 UUID，不是面向用户的供应商名称/类型。
      // 后端未返回 provider 对象时保持空值，让展示层隐藏副行，禁止把内部 ID 当文案展示。
      name: row.provider?.name || '',
      type: row.provider?.type || '',
    },
    workspace_id: row.workspace_id || '',
    // 归属空间名：优先扁平 workspace_name，回退 nested workspace 对象。
    workspace: workspaceName ? { workspace_id: row.workspace_id || '', name: workspaceName } : undefined,
    tenant_id: row.tenant_id || '',
    trace_id: row.trace_id || stringFromMap(row.request_ctx, 'trace_id') || '',
    requested_model: row.requested_model || '',
    upstream_model: row.upstream_model || '',
    path: row.path || '',
    call_type: row.call_type || '',
    http_status: numberOrZero(row.http_status),
    fallback_count: fallbackCount(row.runtime_detail),
    tpot_ms: numberOrZero(row.tpot_ms),
    api_key: {
      api_key_id: apiKeyID,
      name: apiKeyName,
      masked: row.api_key?.masked || '',
    },
    account: {
      account_id: accountID,
      display_name: accountName,
    },
    app_name: row.app_name ?? null,
    status: normalizeStatus(row.status),
    finish_reason: row.finish_reason ?? null,
    error_code: row.error_code ?? null,
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens || inputTokens + outputTokens,
      cache_read_tokens: numberOrZero(row.cache_read_tokens ?? row.usage?.cache_read_tokens),
      cache_write_tokens: numberOrZero(row.usage?.cache_write_tokens),
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
    // 护栏字段透传（后端契约 #450）：未命中/旧日志时后端不返，保持 undefined，UI 降级
    guardrail_decision: row.guardrail_decision ?? undefined,
    model_request_state: row.model_request_state ?? undefined,
    guardrail_id: row.guardrail_id ?? undefined,
    guardrail_name: row.guardrail_name ?? undefined,
    guardrail_reason: row.guardrail_reason ?? undefined,
  }
}

function toListQuery(params?: CallLogListParams) {
  return {
    before_started_at: params?.before_started_at || params?.cursor,
    from: params?.from,
    to: params?.to,
    preset: params?.preset,
    workspace_id: params?.workspace_id,
    api_key_id: params?.api_key_id,
    account_id: params?.account_id,
    request_id: params?.request_id,
    q: params?.q,
    model: params?.model_id,
    status: params?.status,
    guardrail: params?.guardrail,
    api_key_type: params?.api_key_type,
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
    total: typeof data.total === 'number' ? data.total : undefined,
  }
}

function numberOrUndefined(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

// 后端未返回的指标保持 undefined（显「—」），不得填 0 冒充——0 是合法业务值（无结果时显 0）。
function toLogsSummary(data: ModelLogStatsResponse): LogsSummary {
  const totals = data.totals
  return {
    total_requests: numberOrUndefined(totals?.requests),
    total_tokens: numberOrUndefined(totals?.tokens),
    succeeded: numberOrUndefined(totals?.succeeded),
    failed: numberOrUndefined(totals?.failed),
    guardrail_hits: numberOrUndefined(totals?.guardrail_hits),
    total_cost: totals?.spend?.trim() ? money(totals.spend, totals.currency) : undefined,
    cost_records: numberOrUndefined(totals?.spend_with_cost_count),
    avg_duration_ms: numberOrUndefined(totals?.avg_duration_ms),
    avg_ttft_ms: numberOrUndefined(totals?.avg_ttft_ms),
  }
}

// 与 toListQuery 同口径（需求方#668 硬性要求 Summary 与列表结果完全一致）；model_id → model 同列表。
function toStatsQuery(params?: LogStatsParams) {
  return {
    from: params?.from,
    to: params?.to,
    workspace_id: params?.workspace_id,
    account_id: params?.account_id,
    api_key_id: params?.api_key_id,
    model: params?.model_id,
    status: params?.status,
    guardrail: params?.guardrail,
    q: params?.q,
    request_id: params?.request_id,
    api_key_type: params?.api_key_type,
  }
}

/** 获取调用量直方图（48 根柱） */
export function getLogHistogram(params?: LogHistogramParams) {
  return get<LogHistogram>('model-logs/histogram', params)
}

/**
 * 调用日志 Summary（需求方#668）：与列表同口径的六项聚合指标。
 *
 * 端点必须是 `model-logs/summary`（qa#605 专门为本需求新增），**不是 `model-logs/stats`**。
 * 两者都活着但口径完全不同，实测（2026-08-19 test，同一租户同一 preset=thisMonth）：
 *   · summary.totals.requests = 84765 == 列表 total 84765  ✔ 同口径
 *   · stats.totals.requests   =  4089                      ✗ 差 20 倍
 * 因为 stats **不认 preset**，会自己回落成「最近 24h + granularity=hour」的分桶响应
 * （from 08-18T07:55 → to 08-19T07:55），指标条会和下面的列表对不上。
 * 而且 stats.totals 只有 requests/tokens/spend 三项，succeeded / failed /
 * guardrail_hits / spend_with_cost_count / avg_duration_ms / avg_ttft_ms 全缺，
 * 接在它上面这六项只能显「—」——那是端点选错，不是后端没交付。
 * 响应体也差 40 倍（363B vs 14.9KB），summary 是轻量聚合、stats 带 buckets/groups。
 */
export async function getLogsSummary(params?: LogStatsParams) {
  const data = await get<ModelLogStatsResponse>('model-logs/summary', toStatsQuery(params))
  return toLogsSummary(data)
}

/** 获取调用日志列表 */
export async function listCallLogs(params?: CallLogListParams) {
  const query = toListQuery(params)
  const data = await get<ModelLogListResponse>('model-logs', query)
  return toCursorPage(data, query.limit)
}

/**
 * 获取日志原始 Payload（prompt + completion 完整内容）。
 * 需要 workspace 开启 Input/Output Logging；未开启时返回 null 字段。
 */
export function getLogPayload(requestId: string, kind: 'request' | 'response') {
  return get<LogPayload>(`model-logs/${requestId}/payload`, { kind })
}
