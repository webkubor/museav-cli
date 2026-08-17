import type { QueryParams, ApiKeyType } from '@/types'

/** 调用日志直方图查询参数 */
export interface LogHistogramParams extends QueryParams {
  from?: string
  to?: string
  workspace_id?: string
  /** 时间粒度，默认 hour */
  granularity?: 'hour' | 'day'
  /** 按 API Key 类型过滤（私有/成员/服务）——需求 #22，后端 qa#449 支持 */
  api_key_type?: ApiKeyType
}

/** 日志 Summary 查询参数（需求方#668）：必须与列表 GET /model-logs 完全同口径。
 *  status/guardrail/q/request_id 现契约不支持，后端 qa#605 补齐；先按同名参数透传。 */
export interface LogStatsParams extends QueryParams {
  from?: string
  to?: string
  workspace_id?: string
  account_id?: string
  api_key_id?: string
  model_id?: string
  status?: 'accepted' | 'succeeded' | 'failed' | 'rejected'
  /** 护栏命中筛选，与 status 正交（同列表口径） */
  guardrail?: 'all' | 'hit' | 'not_hit'
  /** 关键词搜索 request_id 或消息片段 */
  q?: string
  /** Request ID 精确检索（与模糊 q 分流） */
  request_id?: string
  /** 按 API Key 类型过滤（私有/成员/服务）——需求 #22，后端 qa#449 支持 */
  api_key_type?: ApiKeyType
}

/** 调用日志列表查询参数 */
export interface CallLogListParams extends QueryParams {
  preset?: '1h' | '24h' | '7d' | '30d' | 'custom'
  /** 时间游标，向前翻页 */
  before_started_at?: string
  /** 时间范围（默认最近 24 小时，最长 90 天） */
  from?: string
  to?: string
  /** 默认当前活跃 workspace；传 'all' 取 tenant 全量 */
  workspace_id?: string
  api_key_id?: string
  account_id?: string
  model_id?: string
  provider_id?: string
  provider_type?: string
  status?: 'accepted' | 'succeeded' | 'failed' | 'rejected'
  /** 护栏命中筛选，与 status 正交（一次调用可失败但未命中护栏，或成功但命中护栏） */
  guardrail?: 'all' | 'hit' | 'not_hit'
  /** 按 API Key 类型过滤（私有/成员/服务）——需求 #22，后端 qa#449 支持 */
  api_key_type?: ApiKeyType
  /** 关键词搜索 request_id 或消息片段 */
  q?: string
  /** Request ID 精确检索：识别为完整 ID 时走此参数（与模糊 q 分流），命中唯一自动展开详情 */
  request_id?: string
  cursor?: string
  limit?: number
  page_size?: number
  /** 默认 started_at:desc */
  sort?: string
}
