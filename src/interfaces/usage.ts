import type { QueryParams } from '@/types'

/** 用量汇总查询参数 */
export interface UsageSummaryParams extends QueryParams {
  /** ISO 时间区间（默认最近 7 天） */
  from?: string
  to?: string
  /** 分组维度：none | model | provider | workspace */
  group_by?: 'none' | 'model' | 'provider' | 'workspace'
  workspace_id?: string
  model_id?: string
  provider_id?: string
  api_key_id?: string
}

/** 用量时间序列查询参数 */
export interface UsageSeriesParams extends QueryParams {
  from?: string
  to?: string
  /** 时间粒度：hour | day | week | month */
  granularity?: 'hour' | 'day' | 'week' | 'month'
  /** 指标：spend | requests | tokens */
  metric?: 'spend' | 'requests' | 'tokens'
  workspace_id?: string
  model_id?: string
  provider_id?: string
  api_key_id?: string
}
