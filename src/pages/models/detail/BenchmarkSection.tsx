/**
 * 模型详情 · Benchmark 基准评测（§5）。
 *
 * 只读模块：无筛选、无排序、无跳转。三条硬规则：
 * - `Artificial Analysis` 来源标签**只出现一次**（§5.1）
 * - 缺少某个 summary / evaluation 就**隐藏那一项**，绝不补「—」占位（§5.2）
 * - `summaries` 与 `groups` 都为空时整块 `return null` —— 详情直接接相关模型，
 *   不留标题、不留空卡
 *
 * 不复刻 Artificial Analysis 的页面，也不用 ModelGo 自身模型全集重算排名/百分位。
 */
import { MOCK_BENCHMARK, type BenchmarkData } from './benchmark-mock'

export function BenchmarkSection({ data = MOCK_BENCHMARK }: { data?: BenchmarkData }) {
  const summaries = data.summaries ?? []
  // group 内没有 evaluation 就整组隐藏（§5.2）
  const groups = (data.groups ?? []).filter((group) => group.evaluations.length > 0)

  // 两者都空 → 整块不渲染，不留标题也不留空卡
  if (summaries.length === 0 && groups.length === 0) return null

  return (
    <section className="mg-tile mg-detail-card">
      <header className="mb-3 flex flex-wrap items-baseline gap-2">
        <h3 className="text-[14px] font-semibold text-mg-text-0">Benchmark 基准评测</h3>
        {/* 来源标签只出现一次 */}
        <span className="rounded-sm bg-mg-fill-1 px-1.5 py-0.5 text-[10px] text-mg-text-3">
          Artificial Analysis
        </span>
      </header>

      {/* 指标格走现状 .mg-metric 三件套，与详情页规格条同源，不自己加底色 */}
      {summaries.length > 0 ? (
        <dl className="mb-4 grid gap-3 sm:grid-cols-3">
          {summaries.map((item) => (
            <div key={item.label} className="mg-metric">
              <dt className="mg-metric-label">{item.label}</dt>
              <dd>
                <span className="mg-metric-value">{item.value}</span>
                {item.unit ? <i className="mg-metric-unit ml-1">{item.unit}</i> : null}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {groups.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((group) => (
            <div key={group.title}>
              <h4 className="mb-2 text-[12px] font-semibold text-mg-text-1">{group.title}</h4>
              <ul className="flex flex-col gap-2.5">
                {group.evaluations.map((item) => (
                  <li key={item.name}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="min-w-0 truncate text-[12px] text-mg-text-0">
                        {item.name}
                      </span>
                      <span className="shrink-0 text-[12px] font-semibold text-mg-text-0">
                        {item.result}
                      </span>
                    </div>
                    <p className="mb-1 text-[11px] text-mg-text-3">{item.description}</p>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-mg-fill-1">
                      <div
                        className="h-full rounded-full bg-brand-base/70"
                        style={{ width: `${Math.min(100, Math.max(0, item.score))}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
