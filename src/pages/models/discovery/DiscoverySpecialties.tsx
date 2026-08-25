/**
 * 模块 5：专项指标排行（§3.4）—— 4 个指标卡，桌面 2×2。
 *
 * 用横向条形表达相对大小，不引 Recharts：这里每卡只有 5 行、且值是预格式化字符串
 * （"$0.0031" / "245 tok/s" / "8.2B"），跑图表库要先把字符串反解析成数字，反而更脆。
 * 条宽按同卡内最大值归一，纯 CSS 宽度百分比。
 *
 * Tooltip 只解释数值、不触发跳转（§3.4）——避免用户在分析时误离页。
 */
import { InfoTip } from '@/components/ui/InfoTip'
import type { DiscoveryConfig } from './discovery-mock'

/** 把 "245 tok/s" / "$0.0031" / "8.2B" 解析成可比数字，失败返回 0（条宽为 0，不报错） */
function magnitude(raw: string): number {
  if (!raw || raw === '—') return 0
  const scale = raw.includes('B') ? 1e9 : raw.includes('M') ? 1e6 : raw.includes('K') ? 1e3 : 1
  const n = Number.parseFloat(raw.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n * scale : 0
}

export function DiscoverySpecialties({ config }: { config: DiscoveryConfig }) {
  return (
    <section>
      <h2 className="mb-3 text-[14px] font-semibold text-mg-text-0">专项指标排行</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {config.specialties.map((specialty) => {
          const peak = Math.max(...specialty.rows.map((row) => magnitude(row.value)), 0)
          return (
            <div key={specialty.title} className="mg-tile">
              <header className="mb-3">
                <h3 className="flex items-center text-[13px] font-semibold text-mg-text-0">
                  {specialty.title}
                  <InfoTip text={specialty.description} className="ml-1" />
                </h3>
              </header>
              <ul className="flex flex-col gap-2">
                {specialty.rows.map((row) => {
                  const value = magnitude(row.value)
                  // peak 为 0（整卡都是 —）时不除零，条宽给 0
                  const ratio = peak > 0 ? Math.max(4, Math.round((value / peak) * 100)) : 0
                  return (
                    <li key={row.model} title={`${row.model}：${row.value}`}>
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-[12px] text-mg-text-1">
                          {row.model}
                        </span>
                        <span className="shrink-0 text-[12px] font-semibold text-mg-text-0">
                          {row.value}
                        </span>
                      </div>
                      <div className="h-1 w-full overflow-hidden rounded-full bg-mg-fill-1">
                        <div
                          className="h-full rounded-full bg-brand-base/70"
                          style={{ width: `${ratio}%` }}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}
