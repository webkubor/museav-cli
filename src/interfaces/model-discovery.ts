/**
 * 模型发现 / 模型详情 Benchmark（v1.0.6）请求参数
 *
 * type 与 metric 的组合由后端校验，非法组合返回 4001 —— 前端在发请求前应先用
 * DISCOVERY_METRICS_BY_TYPE 收敛可选项，不要把非法组合发出去再靠报错兜底。
 */
import type { DiscoveryIntegrationStatus, DiscoveryMetric, DiscoveryType, QueryParams } from '@/types'

/** 总览 / 模型选项：只有 type 一个维度。 */
export interface DiscoveryTypeParams extends QueryParams {
  type: DiscoveryType
}

/** 统一排名。取 Top N 就传小的 page_size，完整榜单用正常分页，不需要区分调用。 */
export interface DiscoveryRankingsParams extends QueryParams {
  type: DiscoveryType
  metric: DiscoveryMetric
  /** 厂商名称，全等匹配（不区分大小写）。候选值取模型选项的 creator_name 去重。 */
  creator?: string
  integration_status?: DiscoveryIntegrationStatus
  /** 仅返回开放权重模型。 */
  open_source?: boolean
  /** 默认 1。 */
  page?: number
  /** 默认 20，上限 100。 */
  page_size?: number
}

/** 多维分析（散点图坐标）。 */
export interface DiscoveryAnalysisParams extends QueryParams {
  type: DiscoveryType
  x_metric: DiscoveryMetric
  y_metric: DiscoveryMetric
  /** 逗号分隔的 source_model_id 列表。 */
  source_model_ids: string
}

/** 使用趋势。 */
export interface DiscoveryUsageTrendsParams extends QueryParams {
  type: DiscoveryType
  source_model_ids: string
  /** 默认与上限均为 7 —— 快照只保留最近 7 个自然日。 */
  days?: number
}

/** 模型详情 Benchmark 的可选业务类型。 */
export interface ModelBenchmarksParams extends QueryParams {
  /**
   * 同一个模型会同时出现在多个业务类型下（语言模型必然横跨 Agent / 文本 / 代码）。
   * 不传时后端按 TEXT_CHAT → AGENT → CODE_GENERATION → 媒体类型的优先级返回。
   */
  type?: DiscoveryType
}
