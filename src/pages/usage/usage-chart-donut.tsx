/**
 * 消费分布环形图（Recharts Pie）：中心总消费 + hover 高亮联动图例。
 * 路由：/usage
 * API 来源：GET /usage/rankings/*
 */

import { useState } from 'react'
import {
  ResponsiveContainer,
  PieChart, Pie, Cell,
  Tooltip,
} from 'recharts'
import { formatMoney } from './usage-utils'
import { TOOLTIP_STYLE } from './usage-chart-shared'

export interface DonutSlice {
  key: string
  label: string
  value: number
  /** 该分片占总消费的百分比 0-100（后端 share_percent 或本地兜底）。 */
  share: number
  color: string
  /** 「其他」聚合了多少个模型（仅聚合片有值），用于图例标注 (N)。 */
  subCount?: number
}

interface ModelDonutChartProps {
  slices: DonutSlice[]
  /** 圆环中心主标题（如「总消费」）。 */
  centerLabel: string
  /** 圆环中心金额（已带币种，如「¥2,683.4」）。 */
  centerValue: string
  currencySymbol: string
  noDataLabel: string
  /** 当前 hover 的分片索引（与右侧图例联动，null=无）。 */
  activeIndex?: number | null
  onActiveChange?: (index: number | null) => void
}

interface DonutTooltipProps {
  active?: boolean
  payload?: Array<{ payload: DonutSlice }>
  currencySymbol: string
}

function DonutTooltip({ active, payload, currencySymbol }: DonutTooltipProps) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={TOOLTIP_STYLE}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span className="rounded-[2px]" style={{ width: 8, height: 8, background: d.color, flexShrink: 0 }} />
        <span className="text-mg-text-1" style={{ fontWeight: 700 }}>{d.label}</span>
      </div>
      <div className="text-mg-text-2" style={{ fontSize: '12px', fontVariantNumeric: 'tabular-nums' }}>
        {formatMoney(String(d.value), currencySymbol)} · {d.share.toFixed(1)}%
      </div>
    </div>
  )
}

/**
 * 模型消费分布环形图：中心显示总消费，各分片按消费占比着色（Top5 + 「其他」）。
 * hover 时高亮该扇区、其余降透明度聚焦，并与右侧图例双向联动（受控 activeIndex）；
 * 圆角描边做出精致质感。
 */
export function ModelDonutChart({
  slices, centerLabel, centerValue, currencySymbol, noDataLabel, activeIndex, onActiveChange,
}: ModelDonutChartProps) {
  const [innerActive, setInnerActive] = useState<number | null>(null)
  const active = activeIndex !== undefined ? activeIndex : innerActive
  const setActive = onActiveChange ?? setInnerActive

  if (slices.length === 0) {
    return (
      <div className="text-mg-text-3" style={{ height: 210, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px' }}>
        {noDataLabel}
      </div>
    )
  }
  const hovered = active != null ? slices[active] : null
  return (
    <div style={{ position: 'relative', width: '100%', height: 210 }}>
      <ResponsiveContainer width="100%" height={210}>
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="label"
            innerRadius={64}
            outerRadius={90}
            paddingAngle={slices.length > 1 ? 2.5 : 0}
            cornerRadius={4}
            startAngle={90}
            endAngle={-270}
            stroke="var(--mg-bg-0)"
            strokeWidth={2}
            onMouseEnter={(_, i) => setActive(i)}
            onMouseLeave={() => setActive(null)}
            isAnimationActive={false}
          >
            {slices.map((s, i) => (
              <Cell
                key={s.key}
                fill={s.color}
                stroke={active === i ? s.color : 'var(--mg-bg-0)'}
                strokeWidth={active === i ? 3 : 2}
                opacity={active == null || active === i ? 1 : 0.38}
                style={{ transition: 'opacity 0.15s ease', cursor: 'pointer' }}
              />
            ))}
          </Pie>
          <Tooltip content={<DonutTooltip currencySymbol={currencySymbol} />} />
        </PieChart>
      </ResponsiveContainer>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          padding: '0 54px',
          textAlign: 'center',
        }}
      >
        <span className="text-mg-text-3" style={{ fontSize: '12px', lineHeight: 1.3 }}>
          {hovered ? hovered.label : centerLabel}
        </span>
        <span
          className="text-mg-text-1"
          style={{
            fontSize: hovered ? '16px' : '18px', fontWeight: 700,
            fontVariantNumeric: 'tabular-nums', lineHeight: 1.25, marginTop: 2,
            maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {hovered ? formatMoney(String(hovered.value), currencySymbol) : centerValue}
        </span>
        {hovered && (
          <span className="text-mg-text-3" style={{ fontSize: '12px', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>
            {hovered.share.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  )
}
