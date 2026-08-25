/**
 * 模型详情 · 平台运行表现（§4）。
 *
 * §4.3 要求的 5 种状态全部落地 —— 少一种就会出现「拿不到数据却显示成 0」或
 * 「失败了却像没数据」这类误导：
 *   ① 首次加载        区块内 4 张与最终等高的 skeleton，不阻塞 Hero/API/相关模型
 *   ② 单指标无数据    保留那张卡 + 「暂无足够平台数据」，不显示伪造的 0、不给同比
 *   ③ 全部指标无数据  区块级空态，**不渲染四个空卡**
 *   ④ 超 15 分钟未更新  标题右侧 warning + 实际更新时间，保留最后有效数据
 *   ⑤ 请求失败        区块级 EmptyState + 重试；不影响详情其他区块
 *
 * 口径按 §7 定稿（原型代码优先于 08-11 文字 spec）：周期档统一 1D/1M（无 1W），
 * 默认 usage=1M 其余 1D，每张卡自己的周期 state 互不影响，缺失点 null 断线不画 0。
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
import { LuTriangleAlert } from 'react-icons/lu'
import { TOOLTIP_STYLE } from '@/pages/usage/usage-chart-shared'
import { InfoTip } from '@/components/ui/InfoTip'
import { EmptyState } from '@/components/ui/EmptyState'
import { Button } from '@/components/ui/Button'
import { SegmentedToggle } from '@/features/dashboard/workbench/SegmentedToggle'
import { cn } from '@/lib/utils'
import {
  MOCK_RUNTIME_METRICS,
  RANGE_OPTIONS,
  areAllMetricsEmpty,
  isMetricEmpty,
  type RangeKey,
  type RuntimeMetric,
  type RuntimeMetricsData,
} from './runtime-metrics-mock'

function MetricCard({ metric }: { metric: RuntimeMetric }) {
  // 每张卡独立 state —— 切这张不影响其他三张（§4.2）
  const [range, setRange] = useState<RangeKey>(metric.defaultRange)
  // 切周期时只这张卡进 pending，其他三卡不闪（§4.2）
  const [pending, setPending] = useState(false)
  const snapshot = metric.snapshots[range]

  const changeRange = (next: RangeKey) => {
    if (next === range) return
    setPending(true)
    setRange(next)
    // 真实接口接入后换成 query 的 isFetching；mock 下给一帧让骨架可见
    window.setTimeout(() => setPending(false), 180)
  }

  // ② 单指标无数据：保留卡片，不显示伪造 0、不给同比
  if (isMetricEmpty(metric)) {
    return (
      <div className="rounded-md border border-mg-border p-3">
        <h4 className="mb-2 flex items-center text-[12px] text-mg-text-2">
          {metric.label}
          <InfoTip text={metric.hint} className="ml-1" />
        </h4>
        <p className="py-8 text-center text-[11px] text-mg-text-3">暂无足够平台数据</p>
      </div>
    )
  }

  const improving = metric.lowerIsBetter ? snapshot.deltaPct < 0 : snapshot.deltaPct > 0
  const deltaText = `${snapshot.deltaPct > 0 ? '+' : ''}${snapshot.deltaPct}%`
  const trendWord = improving ? '优于' : '弱于'

  return (
    <div className="rounded-md border border-mg-border p-3">
      <header className="mb-2 flex items-start justify-between gap-2">
        <h4 className="flex items-center text-[12px] text-mg-text-2">
          {metric.label}
          <InfoTip text={metric.hint} className="ml-1" />
        </h4>
        <SegmentedToggle
          size="sm"
          options={RANGE_OPTIONS}
          value={range}
          onChange={changeRange}
          ariaLabel={`${metric.label}时间范围`}
        />
      </header>

      {pending ? (
        // 卡内骨架高度与最终一致，切换时不跳动
        <div className="animate-pulse">
          <div className="mb-1.5 h-5 w-24 rounded-sm bg-mg-fill-2" />
          <div className="mb-2 h-3 w-32 rounded-sm bg-mg-fill-2" />
          <div className="h-[72px] w-full rounded-sm bg-mg-fill-2" />
        </div>
      ) : (
        <>
          <p className="mb-0.5">
            <span className="text-[20px] font-bold text-mg-text-0">
              {snapshot.current.toLocaleString()}
            </span>
            <span className="ml-1 text-[12px] text-mg-text-3">{metric.unit}</span>
          </p>
          <p className={cn('mb-2 text-[11px]', improving ? 'text-mg-success' : 'text-mg-danger')}>
            {deltaText} · {trendWord}上一{range === '1D' ? '日' : '月'}
          </p>

          <ResponsiveContainer width="100%" height={72}>
            <LineChart data={snapshot.series} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="0" stroke="var(--mg-fill-0)" vertical={false} />
              <XAxis dataKey="label" hide />
              <YAxis hide domain={['dataMin', 'dataMax']} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value) => [
                  value === null || value === undefined
                    ? '该时段暂无数据'
                    : `${value} ${metric.unit}`,
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
        </>
      )}
    </div>
  )
}

/**
 * ① 首次加载：4 张等高骨架，不阻塞详情其他区块。
 *
 * 骨架色用 bg-mg-fill-2 对齐现状（workbench 的 RecentCalls/Rankings/UsageTrend
 * 都是 animate-pulse + bg-mg-fill-2 + rounded-sm）。本仓没有 Skeleton 组件，
 * 这是既有约定而非自造。
 */
function LoadingSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse rounded-md border border-mg-border p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="h-3 w-16 rounded-sm bg-mg-fill-2" />
            <div className="h-6 w-16 rounded-sm bg-mg-fill-2" />
          </div>
          <div className="mb-1.5 h-5 w-24 rounded-sm bg-mg-fill-2" />
          <div className="mb-2 h-3 w-32 rounded-sm bg-mg-fill-2" />
          <div className="h-[72px] w-full rounded-sm bg-mg-fill-2" />
        </div>
      ))}
    </div>
  )
}

export function RuntimeMetricsSection({
  data = MOCK_RUNTIME_METRICS,
  onRetry,
}: {
  data?: RuntimeMetricsData
  onRetry?: () => void
}) {
  const { status, metrics, isStale, updatedAtText } = data

  // ④ 超 15 分钟未更新：标 warning 但**保留**最后有效数据，不清空。
  // 新鲜度由数据层判定（见 RuntimeMetricsData.isStale）——组件里算会在渲染期
  // 读时钟，违反 react-hooks/purity。
  const showStale = status === 'ready' && isStale === true

  return (
    <section className="mg-tile mg-detail-card">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-semibold text-mg-text-0">平台运行表现</h3>
          <p className="mt-0.5 text-[12px] text-mg-text-3">
            基于 ModelGo 平台真实调用统计，非厂商标称值
          </p>
        </div>
        {showStale ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-mg-warning">
            <LuTriangleAlert size={12} aria-hidden />
            数据更新延迟{updatedAtText ? ` · 最后更新 ${updatedAtText}` : ''}
          </span>
        ) : null}
      </header>

      {status === 'loading' ? (
        <LoadingSkeleton />
      ) : status === 'error' ? (
        // ⑤ 请求失败：区块级错误态 + 重试，不影响详情其他区块
        <EmptyState
          title="运行表现数据加载失败"
          description="平台统计接口暂时不可用，详情页其他信息不受影响"
          action={
            onRetry ? (
              <Button variant="outline" size="sm" onClick={onRetry}>
                重试
              </Button>
            ) : undefined
          }
        />
      ) : areAllMetricsEmpty(metrics) ? (
        // ③ 全部指标无数据：区块级空态，不渲染四个空卡
        <EmptyState
          title="该模型暂无平台运行数据"
          description="模型接入后累积一定调用量才会生成运行统计"
        />
      ) : (
        // 桌面 2×2、窄屏单列（§4.1）
        <div className="grid gap-3 sm:grid-cols-2">
          {metrics.map((metric) => (
            <MetricCard key={metric.key} metric={metric} />
          ))}
        </div>
      )}
    </section>
  )
}
