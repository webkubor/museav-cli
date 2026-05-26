import type { QueryParams } from '@/types'

/** 调用日志直方图查询参数 */
export interface LogHistogramParams extends QueryParams {
  from?: string
  to?: string
  workspace_id?: string
  /** 时间粒度，默认 hour */
  granularity?: 'hour' | 'day'
}

/** 日志统计摘要查询参数 */
export interface LogStatsParams extends QueryParams {
  from?: string
  to?: string
  workspace_id?: string
}

/** 调用日志列表查询参数 */
export interface CallLogListParams extends QueryParams {
  /** 时间窗口预设：1h / 24h / 7d */
  preset?: '1h' | '24h' | '7d'
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
  /** 关键词搜索 request_id 或消息片段 */
  q?: string
  cursor?: string
  limit?: number
  page_size?: number
  /** 默认 started_at:desc */
  sort?: string
}
