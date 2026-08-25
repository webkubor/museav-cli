/**
 * 模块 8：热门 Agent 应用排行（§3.7）—— **仅 Agent 模态渲染**。
 *
 * 三条刻意的行为：
 * - 切周期**保留**展开/收起状态（用户在比不同周期的同一批应用，不该被折回去）
 * - 切周期直接取该周期的静态排序快照，**不在前端跨周期重算名次**
 * - 行只读、无跳转：这些是外部应用，不是平台模型，点了也没地方去
 *
 * 应用图标是应用名首字符 —— 这是 PRD 明确的特例，不用 ModelIcon（那是模型/厂牌用的）。
 */
import { useState } from 'react'
import { SegmentedToggle } from '@/features/dashboard/workbench/SegmentedToggle'
import { AGENT_APP_RANKING } from './discovery-mock'

type Period = 'day' | 'week' | 'month'

const PERIOD_OPTIONS: Array<{ value: Period; label: string }> = [
  { value: 'day', label: '本日' },
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' },
]

export function DiscoveryAgentRanking() {
  const [period, setPeriod] = useState<Period>('day')
  const [expanded, setExpanded] = useState(false)

  const all = AGENT_APP_RANKING[period]
  const rows = expanded ? all.slice(0, 20) : all.slice(0, 10)

  return (
    <section className="mg-tile">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-[14px] font-semibold text-mg-text-0">热门 Agent 应用排行</h2>
        <SegmentedToggle size="sm"
          options={PERIOD_OPTIONS}
          value={period}
          onChange={setPeriod}
          ariaLabel="排行周期"
        />
      </header>

      {/* 桌面两列、窄屏单列，但始终按 1-20 连续阅读顺序（§3.7） */}
      <ol className="grid gap-x-6 gap-y-0 md:grid-cols-2">
        {rows.map((app, index) => (
          <li
            key={app.name}
            className="flex items-center gap-2.5 border-b border-mg-border/50 py-2 last:border-b-0"
          >
            <span className="w-5 shrink-0 text-[12px] font-bold text-mg-text-3">{index + 1}</span>
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-sm bg-mg-fill-1 text-[11px] font-bold text-mg-text-2"
              aria-hidden
            >
              {app.name.charAt(0)}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-mg-text-0">{app.name}</span>
            <span className="shrink-0 text-[12px] font-semibold text-mg-text-1">{app.usage}</span>
          </li>
        ))}
      </ol>

      <div className="mt-3 text-center">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[12px] font-medium text-brand-base hover:underline"
        >
          {expanded ? '收起' : '查看更多'}
        </button>
      </div>
    </section>
  )
}
