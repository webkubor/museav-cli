/**
 * 用量图表共享常量与小工具（配色 / tooltip 样式 / 点击取桶 / 数值格式化）。
 * 路由：/usage
 * API 来源：GET /usage/series
 */

import { type Metric, formatNumber } from './usage-utils'

// 指标配色与 KPI 卡片保持一致：消费=琥珀、请求=绿、Token=蓝
export const METRIC_COLOR: Record<Metric, string> = {
  spend: 'var(--mg-warning)',
  requests: 'var(--mg-success)',
  tokens: 'var(--mg-info)',
}

export const TOOLTIP_STYLE = {
  background: 'var(--mg-bg-1)',
  border: '1px solid var(--mg-border)',
  borderRadius: 'var(--radius-sm)',
  padding: '8px 12px',
  fontSize: '12px',
  boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
} as const

/** recharts chart onClick 回调里取被点中的 x 轴值（bucket_start）。 */
export type ChartClickState = { activeLabel?: string | number } | null
export function pickBucketFromClick(state: ChartClickState, onPointClick?: (bucketStart: string) => void) {
  if (!onPointClick) return
  const label = state?.activeLabel
  if (label !== undefined && label !== null && label !== '') onPointClick(String(label))
}

export function formatMetricValue(
  value: number,
  metric: Metric,
  currencySymbol: string,
  requestUnitLabel: string,
  tokenUnitLabel: string,
): string {
  if (metric === 'spend') return `${currencySymbol}${value.toFixed(4)}`
  return `${formatNumber(Math.round(value))} ${metric === 'tokens' ? tokenUnitLabel : requestUnitLabel}`
}
