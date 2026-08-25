/**
 * 模型详情 · 平台运行表现（§4）。
 *
 * 口径按 §7 定稿（原型代码优先于 08-11 文字 spec）：
 * - 四张卡的周期档统一 `1D / 1M`，**没有 1W**
 * - 默认档：使用量 `1M`，成功率/耗时/速度 `1D`
 * - **每张卡自己的周期 state，互不影响**；切换时只这张卡显骨架，其他三卡不闪
 * - 缺失点用 `null` 表示、图上断线，**不画成 0** —— 画成 0 会让成功率/耗时出现
 *   虚假断崖。使用量不产生缺失点。
 *
 * 趋势变化除颜色外必须带 +/- 与文字描述（§4.1）：耗时下降是正向反馈，只靠红绿会反。
 */
import { useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { TOOLTIP_STYLE } from '@/pages/usage/usage-chart-shared'
import { InfoTip } from '@/components/ui/InfoTip'
import { SegmentedToggle } from '@/features/dashboard/workbench/SegmentedToggle'
import { cn } from '@/lib/utils'

type RangeKey = '1D' | '1M'

interface SeriesPoint {
  label: string
  /** null = 该时点无数据，图上断线；不要用 0 代替 */
  value: number | null
}

interface RuntimeMetric {
  key: string
  label: string
  hint: string
  unit: string
  /** 越低越好（耗时类）：决定变化方向的正负解读 */
  lowerIsBetter?: boolean
  defaultRange: RangeKey
  snapshots: Record<RangeKey, { current: number; deltaPct: number; series: SeriesPoint[] }>
}

/** 造 mock 序列。allowMissing 的指标在中段留一个 null 点，用来验证断线渲染。 */
function buildSeries(count: number, base: number, allowMissing: boolean): SeriesPoint[] {
  const missingAt = allowMissing && count > 8 ? Math.floor(count / 2) : -1
  return Array.from({ length: count }, (_, index) => ({
    label: count === 24 ? `${index}:00` : `${index + 1}日`,
    value: index === missingAt ? null : Number((base * (0.88 + Math.sin(index / 3) * 0.12)).toFixed(2)),
  }))
}

const METRICS: RuntimeMetric[] = [
  {
    key: 'usage',
    label: '使用量',
    hint: '该模型在 ModelGo 平台的调用量',
    unit: 'Tokens',
    defaultRange: '1M',
    snapshots: {
      // 使用量不产生缺失点（allowMissing = key !== 'usage'）
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

const RANGE_OPTIONS: Array<{ value: RangeKey; label: string }> = [
  { value: '1D', label: '1D' },
  { value: '1M', label: '1M' },
]

function MetricCard({ metric }: { metric: RuntimeMetric }) {
  // 每张卡独立 state —— 切这张不影响其他三张（§4.2）
  const [range, setRange] = useState<RangeKey>(metric.defaultRange)
  const snapshot = metric.snapshots[range]

  const improving = metric.lowerIsBetter ? snapshot.deltaPct < 0 : snapshot.deltaPct > 0
  const deltaText = `${snapshot.deltaPct > 0 ? '+' : ''}${snapshot.deltaPct}%`
  const trendWord = improving ? '优于' : '弱于'
  const hasAnyValue = snapshot.series.some((point) => point.value !== null)

  return (
    <div className="rounded-md border border-mg-border p-3">
      <header className="mb-2 flex items-start justify-between gap-2">
        <h4 className="flex items-center text-[12px] text-mg-text-2">
          {metric.label}
          <InfoTip text={metric.hint} className="ml-1" />
        </h4>
        <SegmentedToggle size="sm"
          options={RANGE_OPTIONS}
          value={range}
          onChange={setRange}
          ariaLabel={`${metric.label}时间范围`}
        />
      </header>

      <p className="mb-0.5">
        <span className="text-[20px] font-bold text-mg-text-0">
          {snapshot.current.toLocaleString()}
        </span>
        <span className="ml-1 text-[12px] text-mg-text-3">{metric.unit}</span>
      </p>
      {/* 颜色 + 符号 + 文字三重表达，不只靠颜色（§4.1 / §6） */}
      <p className={cn('mb-2 text-[11px]', improving ? 'text-mg-success' : 'text-mg-danger')}>
        {deltaText} · {trendWord}上一{range === '1D' ? '日' : '月'}
      </p>

      {hasAnyValue ? (
        <ResponsiveContainer width="100%" height={72}>
          <LineChart data={snapshot.series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="0" stroke="var(--mg-fill-0)" vertical={false} />
            <XAxis dataKey="label" hide />
            <YAxis hide domain={['dataMin', 'dataMax']} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => [
                value === null || value === undefined ? '该时段暂无数据' : `${value} ${metric.unit}`,
                metric.label,
              ]}
            />
            {/* connectNulls={false} 是关键：null 处断线，不把缺口连成直线 */}
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--brand-base)"
              strokeWidth={1.5}
              dot={false}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <p className="py-5 text-center text-[11px] text-mg-text-3">暂无足够平台数据</p>
      )}
    </div>
  )
}

export function RuntimeMetricsSection() {
  return (
    <section className="mg-tile mg-detail-card">
      <header className="mb-3">
        <h3 className="text-[14px] font-semibold text-mg-text-0">平台运行表现</h3>
        <p className="mt-0.5 text-[12px] text-mg-text-3">
          基于 ModelGo 平台真实调用统计，非厂商标称值
        </p>
      </header>
      {/* 桌面 2×2、窄屏单列（§4.1） */}
      <div className="grid gap-3 sm:grid-cols-2">
        {METRICS.map((metric) => (
          <MetricCard key={metric.key} metric={metric} />
        ))}
      </div>
    </section>
  )
}
