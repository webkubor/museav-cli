/**
 * 平台运行表现的类型与 Mock 数据（§4）。
 *
 * 单独成文件：组件文件只能导出组件，否则 react-refresh 失效
 * （BenchmarkSection 已因这条被 eslint 拦过一次）。
 *
 * 口径按 §7 定稿（原型代码优先于 08-11 文字 spec）：
 * - 周期档统一 1D / 1M，没有 1W
 * - 默认档 usage=1M，success/latency/throughput=1D
 * - usage 不产生缺失点（对应原型 allowMissing = key !== 'usage'）
 * - 缺失点是 null 不是 0：渲染层 connectNulls={false} 断线
 */

export type RangeKey = '1D' | '1M'

export interface SeriesPoint {
  label: string
  /** null = 该时点无数据，图上断线；不要用 0 代替 */
  value: number | null
}

export interface RuntimeMetric {
  key: string
  label: string
  hint: string
  unit: string
  /** 越低越好（耗时类）：决定变化方向的正负解读 */
  lowerIsBetter?: boolean
  defaultRange: RangeKey
  snapshots: Record<RangeKey, { current: number; deltaPct: number; series: SeriesPoint[] }>
}

/**
 * 整个区块的数据状态。§4.3 要求区分 5 种，缺一种就会出现
 * 「明明拿不到数据却显示成 0」或「失败了却像没数据」这类误导。
 */
export interface RuntimeMetricsData {
  status: 'loading' | 'ready' | 'error'
  metrics: RuntimeMetric[]
  /**
   * 是否已超过 STALE_THRESHOLD_MS 未更新（§4.3 ④）。
   *
   * 由**数据提供方**判定而不是组件现算：渲染期调 Date.now() 违反
   * react-hooks/purity（同一份 props 渲染两次会得到不同结果）。
   * 真实接口接入后由 query 层用 dataUpdatedAt 计算。
   */
  isStale?: boolean
  /** 已格式化的最后更新时间文案。同上，toLocaleString 也不放渲染期。 */
  updatedAtText?: string
}

/** §4.3：超过 15 分钟未更新就在标题右侧标 warning，并保留最后有效数据 */
export const STALE_THRESHOLD_MS = 15 * 60 * 1000

export const RANGE_OPTIONS: Array<{ value: RangeKey; label: string }> = [
  { value: '1D', label: '1D' },
  { value: '1M', label: '1M' },
]

/** 造 mock 序列。allowMissing 的指标在中段留一个 null 点，用来验证断线渲染。 */
function buildSeries(count: number, base: number, allowMissing: boolean): SeriesPoint[] {
  const missingAt = allowMissing && count > 8 ? Math.floor(count / 2) : -1
  return Array.from({ length: count }, (_, index) => ({
    label: count === 24 ? `${index}:00` : `${index + 1}日`,
    value:
      index === missingAt
        ? null
        : Number((base * (0.88 + Math.sin(index / 3) * 0.12)).toFixed(2)),
  }))
}

export const MOCK_METRICS: RuntimeMetric[] = [
  {
    key: 'usage',
    label: '使用量',
    hint: '该模型在 ModelGo 平台的调用量',
    unit: 'Tokens',
    defaultRange: '1M',
    snapshots: {
      '1D': { current: 128_400, deltaPct: 6.4, series: buildSeries(24, 5400, false) },
      '1M': { current: 3_860_000, deltaPct: 12.1, series: buildSeries(30, 128_000, false) },
    },
  },
  {
    key: 'success',
    label: '调用成功率',
    hint: '成功返回的请求占比',
    unit: '%',
    defaultRange: '1D',
    snapshots: {
      '1D': { current: 99.4, deltaPct: 0.2, series: buildSeries(24, 99.2, true) },
      '1M': { current: 99.1, deltaPct: -0.3, series: buildSeries(30, 99.0, true) },
    },
  },
  {
    key: 'latency',
    label: '响应耗时',
    hint: '首 Token 返回耗时中位数',
    unit: 'ms',
    lowerIsBetter: true,
    defaultRange: '1D',
    snapshots: {
      '1D': { current: 486, deltaPct: -8.2, series: buildSeries(24, 500, true) },
      '1M': { current: 512, deltaPct: 3.1, series: buildSeries(30, 520, true) },
    },
  },
  {
    key: 'throughput',
    label: '处理速度',
    hint: '每秒输出 Token 数',
    unit: 'tok/s',
    defaultRange: '1D',
    snapshots: {
      '1D': { current: 218, deltaPct: 4.6, series: buildSeries(24, 214, true) },
      '1M': { current: 209, deltaPct: -1.8, series: buildSeries(30, 210, true) },
    },
  },
]

export const MOCK_RUNTIME_METRICS: RuntimeMetricsData = {
  status: 'ready',
  metrics: MOCK_METRICS,
  // mock 数据视为刚更新，不触发延迟提示
  isStale: false,
}

/** 供数据层判定新鲜度用；组件不调用它（会在渲染期读时钟） */
export function computeStale(updatedAtIso: string, nowMs: number): boolean {
  return nowMs - new Date(updatedAtIso).getTime() > STALE_THRESHOLD_MS
}

/**
 * 单指标是否「无足够数据」：整条序列全是 null。
 * 与「区块级无数据」区分开 —— 前者保留那张卡并写「暂无足够平台数据」，
 * 后者才整块换成空态，不渲染四个空卡（§4.3）。
 */
export function isMetricEmpty(metric: RuntimeMetric): boolean {
  return Object.values(metric.snapshots).every((snapshot) =>
    snapshot.series.every((point) => point.value === null),
  )
}

export function areAllMetricsEmpty(metrics: RuntimeMetric[]): boolean {
  return metrics.length === 0 || metrics.every(isMetricEmpty)
}
