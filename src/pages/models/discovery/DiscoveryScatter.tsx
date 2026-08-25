/**
 * 模块 6：模型能力多维分析（§3.5）。
 *
 * 用 Recharts ScatterChart，Tooltip 复用 usage 页的 TOOLTIP_STYLE —— 全站图表风格
 * 走同一份定义，不各自造。
 *
 * 交互按 §3.5 表格：
 * - 预设一次设定 x/y 轴组合；轴切换后 Axis 标题、刻度、Tooltip 同步更新
 * - 优选区是本地布尔开关，关掉只隐藏区域**不重排点**（否则用户会以为数据变了）
 * - 散点 hover/focus 显示模型与双轴原值；**点不导航** —— 分析时误离页代价很高
 * - 模型多选为 0 时不画空图，给「请选择至少一个模型」
 */
import { useMemo, useState } from 'react'
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
} from 'recharts'
import { LuCheck } from 'react-icons/lu'
import { TOOLTIP_STYLE } from '@/pages/usage/usage-chart-shared'
import { Button } from '@/components/ui/Button'
import { InfoTip } from '@/components/ui/InfoTip'
import { cn } from '@/lib/utils'
import type { DiscoveryConfig, DiscoveryModel } from './discovery-mock'

/** 从预格式化字符串取数值。"—" 与解析失败都返回 null —— 这类点不画，而不是画在 0 */
function toNumber(raw: string): number | null {
  if (!raw || raw === '—') return null
  const scale = raw.includes('B') ? 1e9 : raw.includes('M') ? 1e6 : raw.includes('K') ? 1e3 : 1
  const n = Number.parseFloat(raw.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n * scale : null
}

/** 按轴序号取模型上的对应字段。0=评分/1=性能/2=价格/3=用量，与 config.xMetrics 顺序对齐 */
function axisValue(model: DiscoveryModel, metricLabel: string): number | null {
  if (metricLabel.includes('价格') || metricLabel.includes('成本')) return toNumber(model.price)
  if (metricLabel.includes('速度') || metricLabel.includes('耗时') || metricLabel.includes('延迟') || metricLabel.includes('实时率')) return toNumber(model.performance)
  if (metricLabel.includes('使用量')) return toNumber(model.usage)
  return toNumber(model.score)
}

export function DiscoveryScatter({ config }: { config: DiscoveryConfig }) {
  const [presetIndex, setPresetIndex] = useState(0)
  const [showSweetSpot, setShowSweetSpot] = useState(true)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())

  const preset = config.presets[presetIndex] ?? config.presets[0]
  const yLabel = config.yMetrics[preset?.y ?? 0] ?? config.yMetrics[0]
  const xLabel = config.xMetrics[preset?.x ?? 0] ?? config.xMetrics[0]

  const selected = useMemo(
    () => config.models.filter((m) => !excluded.has(m.name)),
    [config.models, excluded],
  )

  const points = useMemo(
    () =>
      selected
        .map((model) => {
          const x = axisValue(model, xLabel)
          const y = axisValue(model, yLabel)
          return x === null || y === null ? null : { x, y, name: model.name, provider: model.provider }
        })
        .filter((p): p is { x: number; y: number; name: string; provider: string } => p !== null),
    [selected, xLabel, yLabel],
  )

  const toggleModel = (name: string) => {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  return (
    <section className="mg-tile">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center text-[14px] font-semibold text-mg-text-0">
          模型能力多维分析
          <InfoTip text={`纵轴 ${yLabel}，横轴 ${xLabel}`} className="ml-1" />
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {config.presets.map((item, index) => (
            <button
              key={item.label}
              type="button"
              onClick={() => setPresetIndex(index)}
              aria-pressed={index === presetIndex}
              className={cn(
                'rounded-sm border px-2 py-1 text-[12px] transition-colors',
                index === presetIndex
                  ? 'border-brand-base/40 bg-brand-base/10 font-medium text-brand-base'
                  : 'border-mg-border text-mg-text-2 hover:text-mg-text-1',
              )}
            >
              {item.label}
            </button>
          ))}
          <Button
            variant="outline"
            size="sm"
            aria-pressed={showSweetSpot}
            onClick={() => setShowSweetSpot((v) => !v)}
          >
            {showSweetSpot ? '隐藏优选区' : '显示优选区'}
          </Button>
        </div>
      </header>

      {points.length === 0 ? (
        <p className="py-12 text-center text-[13px] text-mg-text-3">
          {selected.length === 0 ? '请选择至少一个模型' : '当前坐标组合下没有可比数据'}
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <ScatterChart margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
            <CartesianGrid strokeDasharray="0" stroke="var(--mg-fill-0)" />
            <XAxis
              type="number"
              dataKey="x"
              name={xLabel}
              tick={{ fontSize: 11, fill: 'var(--mg-text-3)' }}
              tickLine={false}
              label={{ value: xLabel, position: 'insideBottom', offset: -14, fontSize: 11, fill: 'var(--mg-text-3)' }}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={yLabel}
              tick={{ fontSize: 11, fill: 'var(--mg-text-3)' }}
              tickLine={false}
              width={44}
            />
            {/* 优选区：低横轴（便宜/快）+ 高纵轴（质量好）的那一象限。
                用低对比品牌色，隐藏时只是不渲染区域，点位不动。 */}
            {showSweetSpot && points.length > 1 ? (
              <ReferenceArea
                x1={Math.min(...points.map((p) => p.x))}
                x2={points.reduce((sum, p) => sum + p.x, 0) / points.length}
                y1={points.reduce((sum, p) => sum + p.y, 0) / points.length}
                y2={Math.max(...points.map((p) => p.y))}
                fill="var(--brand-base)"
                fillOpacity={0.06}
                stroke="var(--brand-base)"
                strokeOpacity={0.25}
              />
            ) : null}
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              // recharts 的 Formatter 允许 value 为 undefined，签名不能收窄成 number
              formatter={(value, name) => [
                typeof value === 'number' ? value.toLocaleString() : String(value ?? '—'),
                String(name ?? ''),
              ]}
              labelFormatter={() => ''}
            />
            <Scatter data={points} fill="var(--brand-base)" fillOpacity={0.8} />
          </ScatterChart>
        </ResponsiveContainer>
      )}

      {/* 模型多选。0 个选中时上面已给提示，这里始终显示计数 */}
      <footer className="mt-3 border-t border-mg-border/60 pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[12px] text-mg-text-3">
            已选 {selected.length} / {config.models.length}
          </span>
          {excluded.size > 0 ? (
            <button
              type="button"
              onClick={() => setExcluded(new Set())}
              className="text-[12px] font-medium text-brand-base hover:underline"
            >
              恢复默认
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {config.models.map((model) => {
            const on = !excluded.has(model.name)
            return (
              <button
                key={model.name}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggleModel(model.name)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                  on
                    ? 'border-brand-base/40 bg-brand-base/10 text-brand-base'
                    : 'border-mg-border text-mg-text-3',
                )}
              >
                {on ? <LuCheck size={10} aria-hidden /> : null}
                {model.name}
              </button>
            )
          })}
        </div>
      </footer>
    </section>
  )
}
