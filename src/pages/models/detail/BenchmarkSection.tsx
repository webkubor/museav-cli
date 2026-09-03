/**
 * 模型详情 · Benchmark 基准评测（§5）。
 *
 * 数据：GET /api/v1/model-discovery/models/:modelgo_id/benchmarks（v1.0.6，web-api 代理 observer 每日快照）
 *
 * 只读模块：无筛选、无排序、无跳转。三条硬规则：
 * - `Artificial Analysis` 来源标签**只出现一次**（§5.1）
 * - 整块无数据（模型未命中 40401 / 两部分都空）就 `return null` —— 详情直接接
 *   相关模型，不留标题、不留空卡
 * - **单个指标取不到值时保留该项、标注「暂无数据」**：接口的指标清单是固定的完整
 *   结构，数值取不到也会返回（score/display_score 为 null），后端明确要求前端保持
 *   完整结构展示空态、不要删项也不要补 0。这与 §5.2「缺失就隐藏那一项」的原意
 *   （不要用「—」冒充有数据）不冲突：空态是显式标注，不是占位符。
 */
import { useQuery } from '@tanstack/react-query'
import { getModelBenchmarks, toBenchmarkModelId } from '@/services/model-discovery'
import { isNotFoundError } from '@/lib/request-error-message'
import type { BenchmarkCompositeIndex, BenchmarkItem, DiscoveryMetric } from '@/types'

/** 综合指数的展示名。接口只给 metric 码，中文名前端定。 */
const COMPOSITE_LABEL: Partial<Record<DiscoveryMetric, string>> = {
  INTELLIGENCE_INDEX: '智力指数',
  CODING_INDEX: '代码指数',
  AGENTIC_INDEX: 'Agent 指数',
  ELO: 'Elo 评分',
  VOICE_ELO: '语音 Elo',
  AA_WER: 'AA-WER 词错率',
}

/**
 * 按单位渲染分值。
 *
 * `display_score` 是后端算好的展示值，前端不再换算 —— 但**只有 PERCENT 做了 ×100**
 * （0.912 → 91.2）；ELO 原样（1316），WER 也原样保持 0~1 的比率（0.05 → 0.05，
 * 不是 5%）。所以 WER 不能套百分号，否则把 5% 的词错率写成 0.05%。
 */
function formatScore(item: Pick<BenchmarkItem, 'display_score' | 'unit'>) {
  if (item.display_score === null) return null
  const value = String(item.display_score)
  return item.unit === 'PERCENT' ? `${value}%` : value
}

/** 进度条只对 PERCENT 有意义：ELO 是千分位量级，WER 是越低越好的小数。 */
function percentWidth(item: BenchmarkItem) {
  if (item.unit !== 'PERCENT' || item.display_score === null) return null
  return Math.min(100, Math.max(0, item.display_score))
}

function CompositeCard({ index }: { index: BenchmarkCompositeIndex }) {
  const label = COMPOSITE_LABEL[index.metric] ?? index.metric
  const score = index.score === null ? null : String(index.score)
  const hasRank = index.rank !== null && index.total !== null

  return (
    <div className="mg-metric">
      <dt className="mg-metric-label">{label}</dt>
      <dd>
        {score === null ? (
          <span className="mg-metric-value text-mg-text-3">暂无数据</span>
        ) : (
          <span className="mg-metric-value">{score}</span>
        )}
        {hasRank ? (
          <i className="mg-metric-unit ml-1">
            #{index.rank} / {index.total}
            {index.ahead_percent !== null ? ` · 领先 ${index.ahead_percent}%` : ''}
          </i>
        ) : null}
      </dd>
    </div>
  )
}

export function BenchmarkSection({ modelId }: { modelId: string }) {
  // catalog 的 model_id 与 observer 的 modelgo_id 口径不一致，必须转换后再请求，
  // 否则绝大多数模型拿 40401、整块静默消失（qa#708，见 toBenchmarkModelId 的说明）
  const benchmarkId = toBenchmarkModelId(modelId)
  const { data, isLoading } = useQuery({
    queryKey: ['model-benchmarks', benchmarkId],
    queryFn: () => getModelBenchmarks(benchmarkId),
    enabled: Boolean(benchmarkId),
    // 每日快照，同一天内重复进出详情页不必反复请求
    staleTime: 5 * 60 * 1000,
    // 模型未命中（40401）是常态而非故障：ModelGo 目录里的模型不一定进了第三方榜单
    retry: (count, err) => !isNotFoundError(err) && count < 1,
  })

  const composites = data?.composite_indices ?? []
  // group 内没有指标项就整组隐藏（TTS 当前返回空数组）
  const groups = (data?.benchmark_groups ?? []).filter((group) => group.items.length > 0)

  // 加载中不占位：整块本来就可能不存在，先撑一个空壳再抽掉会让详情页跳动
  if (isLoading) return null
  if (composites.length === 0 && groups.length === 0) return null

  return (
    <section className="mg-tile mg-detail-card">
      <header className="mb-3 flex flex-wrap items-baseline gap-2">
        <h3 className="text-[14px] font-semibold text-mg-text-1">Benchmark 基准评测</h3>
        {/* 来源标签只出现一次 */}
        <span className="rounded-sm bg-mg-fill-1 px-1.5 py-0.5 text-[10px] text-mg-text-3">
          Artificial Analysis
        </span>
        {/* 快照语义：数据每日刷新一次，不是实时值，必须让用户看到截止日期 */}
        {data?.snapshot_date ? (
          <span className="text-[10px] text-mg-text-3">数据截至 {data.snapshot_date}</span>
        ) : null}
      </header>

      {/* 指标格走现状 .mg-metric 三件套，与详情页规格条同源，不自己加底色 */}
      {composites.length > 0 ? (
        <dl className="mb-4 grid gap-3 sm:grid-cols-3">
          {composites.map((index) => (
            <CompositeCard key={index.metric} index={index} />
          ))}
        </dl>
      ) : null}

      {groups.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((group) => (
            <div key={group.code}>
              <h4 className="mb-2 text-[12px] font-semibold text-mg-text-1">{group.name}</h4>
              <ul className="flex flex-col gap-2.5">
                {group.items.map((item) => {
                  const result = formatScore(item)
                  const width = percentWidth(item)
                  return (
                    <li key={item.metric}>
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-[12px] text-mg-text-1">
                          {item.name}
                        </span>
                        <span
                          className={`shrink-0 text-[12px] font-semibold ${
                            result === null ? 'text-mg-text-3' : 'text-mg-text-1'
                          }`}
                        >
                          {result ?? '暂无数据'}
                        </span>
                      </div>
                      {item.description ? (
                        <p className="mb-1 text-[11px] text-mg-text-3">{item.description}</p>
                      ) : null}
                      {/* 无值不画空槽，避免读成「得分为 0」 */}
                      {width !== null ? (
                        <div className="h-1 w-full overflow-hidden rounded-full bg-mg-fill-1">
                          <div
                            className="h-full rounded-full bg-brand-base/70"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}
