import type { Money } from './account'

export interface UsageSummary {
  total: {
    spend: Money
    requests: number
    tokens: number
    input_tokens: number
    output_tokens: number
    /** 缓存读/写 token（Swagger usage.Totals 有；「缓存 Token」= 读+写） */
    cache_read_tokens?: number
    cache_write_tokens?: number
    /** 费用分项（Swagger usage.Totals，均为金额字符串，币种同 spend.currency；#385） */
    input_cost?: string
    output_cost?: string
    cache_cost?: string
    average_latency_ms: number
    error_rate: number
  }
  period: { from: string; to: string }
  daily: Array<{ date: string; requests: number; spend: Money }>
  usage_series: UsageSeriesPoint[]
  request_series: UsageSeriesPoint[]
  groups?: Array<{
    key: string
    label: string
    spend: Money
    requests: number
    tokens: number
  }>
}

export interface SeriesDataPoint {
  bucket_start: string
  value: string
}

export interface UsageSeriesPoint {
  bucket_start: string
  spend: Money
  requests: number
  tokens: number
}

interface UsageSeriesGroup {
  key: string
  label: string
  points: UsageSeriesPoint[]
  total: { spend: Money; requests: number; tokens: number }
}

export interface UsageSeries {
  metric: 'spend' | 'requests' | 'tokens'
  granularity: 'day'
  group_by: 'none' | 'model' | 'provider' | 'workspace'
  groups: UsageSeriesGroup[]
  period: { from: string; to: string }
  totals: { spend: Money; requests: number; tokens: number }
}

export interface UsageRankingItem {
  key?: string
  name?: string
  rank?: number
  requests?: number
  share_percent?: number
  spend?: Money
  tokens?: number
  /** 分组最近一次调用时间（RFC3339），Swagger usage.RankingItem。 */
  last_used?: string
  /** 供应商标识，Swagger usage.RankingItem（模型排行）。 */
  vendor?: string
  /**
   * 排行归因列（对齐 PRD，后端 #447 陆续补齐）：
   * - model 维度 → 使用该模型的工作空间（Swagger 已有 workspaces 数组；workspace_name 为单值兜底）
   * - member 维度 → 该成员调用的模型数（Swagger 已有 model_count）
   * - apiKey 维度 → 归属人 owner（Swagger 暂无，TODO(#447) 待后端返回；值为空时渲染「—」）
   */
  workspaces?: string[]
  workspace_name?: string
  model_count?: number
  meta?: string
  // TODO(#447): 后端补 owner（API Key 归属人）后可直接渲染，现值为空时排行表显示「—」。
  owner?: string
}

export interface UsageRankings {
  items?: UsageRankingItem[]
  limit?: number
  period?: { from?: string; to?: string }
  totals?: { requests?: number; spend?: Money; tokens?: number }
}
