/**
 * 模型详情 · Benchmark 基准评测（§5）。
 *
 * 数据：GET /api/v1/model-discovery/models/:modelgo_id/benchmarks（v1.0.6，web-api 代理 observer 每日快照）
 *
 * 只读模块：无筛选、无排序、无跳转。三条硬规则：
 * - `Artificial Analysis` 来源标签**只出现一次**（§5.1）
 * - 整块无数据（模型未命中 40401 / 两部分都空）就 `return null` —— 详情直接接
 *   相关模型，不留标题、不留空卡
 * - **取不到值的一律不渲染，三级都是**（PRD §11.2「摘要指标卡…不补空卡」「任务评测
 *   明细…空分组自动隐藏」，需求方 prd#1005）：
 *     ① 摘要指标卡 `score === null` → 不出这张卡
 *     ② 明细单项 `score` 与 `display_score` 都为 null → 不出这一行
 *     ③ 组内过滤后一项不剩 → 整组隐藏；整块都空 → `return null`
 *   接口的指标清单是**固定完整结构**，取不到值也会返回一项 `score: null`，所以判据
 *   必须是「有没有有效值」而不是「有没有指标项」（实测 deepseek-v4-pro 的 4 组 12 项
 *   里 11 项 null、3 组整组为空）。
 *
 *   ⚠️ 本条 2026-09-11 前是反的：写着「后端明确要求前端保持完整结构展示空态、不要删项」，
 *   于是 minimax-m2.5 的摘要区出现「代码指数/暂无数据」「Agent 指数/暂无数据」两张空卡。
 *   当时的辩解是「空态是显式标注、不是占位符」——但 PRD 说的就是不补空卡，一张只写着
 *   「暂无数据」的卡对用户没有任何信息量。改动依据 PRD §11.2 + prd#1005，已在单里请
 *   需求方与后端对齐「保持完整结构」那条要求的实际约束力。
 */
import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getModelBenchmarks } from '@/services/model-discovery'
import { isNotFoundError } from '@/lib/request-error-message'
import { trackEvent } from '@/lib/track'
import { InfoTip } from '@/components/ui/InfoTip'
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

/**
 * 分布柱的高度序列。**这组数值是示意用的固定正态形状，不是该模型的真实分布** ——
 * PRD 原型（`modelgo_prd/src/MarketplaceBenchmarkPanel.tsx` 的 `distributionBars`）
 * 就是写死的同一串，接口的 `composite_indices[].distribution` 实测恒为空数组。
 *
 * 唯一数据驱动的是标记线位置：走 `ahead_percent`（真实百分位）。所以这张图表达的是
 * 「你在整体里大致靠前/靠后」，柱形只提供参照背景，不承载数值信息 —— 也因此柱子
 * `aria-hidden`，屏幕阅读器只读标记线的 aria-label。
 */
const DISTRIBUTION_BARS = [3, 5, 8, 13, 21, 34, 48, 63, 74, 80, 74, 63, 48, 34, 21, 13, 8, 5, 3]

/** 分布图 + 当前模型位置标记线（PRD §11.3，需求方#969 缺陷 3）。 */
function CompositeDistribution({ index, label }: { index: BenchmarkCompositeIndex; label: string }) {
  // 没有百分位就没有标记线可画，整张图不出 —— 只剩背景柱形没有意义
  if (index.ahead_percent === null) return null
  // 贴边的标记线会被裁掉一半，收进 2%~98%
  const marker = Math.max(2, Math.min(98, index.ahead_percent))
  const position = `${marker}%`

  return (
    <div
      className="mg-benchmark-distribution"
      aria-label={
        index.rank !== null && index.total !== null
          ? `${label}：在 ${index.total} 个同类模型中排名第 ${index.rank}，领先 ${index.ahead_percent}%`
          : `${label}：领先 ${index.ahead_percent}%`
      }
    >
      <div className="mg-benchmark-distribution-bars" aria-hidden="true">
        {DISTRIBUTION_BARS.map((height, barIndex) => (
          <span key={`${index.metric}-${barIndex}`} style={{ height: `${height}%` }} />
        ))}
      </div>
      <span className="mg-benchmark-distribution-marker" style={{ left: position }} aria-hidden="true" />
    </div>
  )
}

function CompositeCard({ index }: { index: BenchmarkCompositeIndex }) {
  const label = COMPOSITE_LABEL[index.metric] ?? index.metric
  const hasRank = index.rank !== null && index.total !== null

  // 无值不出卡（PRD §11.2「不补空卡」）。上游 composites 已过滤，这里是同语义兜底 ——
  // 不要改回渲染「暂无数据」，那正是 prd#1005 报的缺陷。
  if (index.score === null) return null
  const score = String(index.score)

  return (
    <div className="mg-metric">
      <dt className="mg-metric-label">{label}</dt>
      <dd>
        <span className="mg-metric-value">{score}</span>
        {hasRank ? (
          <i className="mg-metric-unit ml-1">
            #{index.rank} / {index.total}
            {index.ahead_percent !== null ? ` · 领先 ${index.ahead_percent}%` : ''}
          </i>
        ) : null}
        <CompositeDistribution index={index} label={label} />
      </dd>
    </div>
  )
}

export function BenchmarkSection({ modelId }: { modelId: string }) {
  // catalog 的 model_id 原样传：2026-09-07 实测后端已把 modelgo_id 对齐成 catalog 口径
  // （qa#708 第 1 条），此前那层 toLowerCase + 点转连字符的猜规则适配已删 —— 它现在
  // 是有害的，把 15 个本来能命中的模型转成了 40401（原样 18/33 → 转换后 3/33）
  const { data, isLoading } = useQuery({
    queryKey: ['model-benchmarks', modelId],
    queryFn: () => getModelBenchmarks(modelId),
    enabled: Boolean(modelId),
    // 每日快照，同一天内重复进出详情页不必反复请求
    staleTime: 5 * 60 * 1000,
    // 模型未命中（40401）是常态而非故障：ModelGo 目录里的模型不一定进了第三方榜单
    retry: (count, err) => !isNotFoundError(err) && count < 1,
  })

  // 摘要指标卡：score 为 null 的整张卡不渲染（PRD §11.2「不补空卡」，prd#1005）
  const composites = (data?.composite_indices ?? []).filter((index) => index.score !== null)
  // 明细：先逐项剔掉无有效值的，再按「过滤后还剩几项」决定整组去留（prd#1005）。
  // 判据是「有没有**有效值**」而非「有没有指标项」——接口是固定完整结构，取不到值也会
  // 返回一项 score:null，按项数判断的话 6/6 全 null 的组照样渲染成 6 行「暂无数据」。
  const groups = (data?.benchmark_groups ?? [])
    .map((group) => ({
      ...group,
      // 判据用 formatScore 的输入 display_score，与下面渲染同源：score 有值但
      // display_score 为 null 的项渲染出来仍是「暂无数据」，按 score 过滤会漏掉它
      items: group.items.filter((item) => formatScore(item) !== null),
    }))
    .filter((group) => group.items.length > 0)

  const sectionRef = useRef<HTMLElement | null>(null)
  const viewReportedRef = useRef(false)
  /** 已上报过 tooltip 的评测项，同一项每次页面生命周期只报一次（反复 hover 不刷量）。 */
  const tooltipReportedRef = useRef<Set<string>>(new Set())
  const summaryMetricKeys = composites.map((index) => index.metric).join(',')

  /**
   * 模块曝光埋点 `model_detail_benchmark_view`（PRD §11.7，prd#1007 缺口三）。
   *
   * 判据取「**可见面积 ≥ 50% 且连续驻留 ≥ 1 秒**」——不是一进 DOM 就报：
   * 详情页整页很长，Benchmark 在下半屏，只要用户没滚到就不算看见。1 秒驻留过滤掉
   * 快速划过（TC-DISC-101 的面积+驻留口径也正好落在这里，之前因为没有独立曝光事件
   * 而无锚点可判）。
   *
   * 整个生命周期只报一次：`viewReportedRef` 拦重复，报完即 disconnect。
   * `summary_metric_keys` 取**过滤后实际展示**的指标，不是接口返回的完整清单 ——
   * 下游要知道用户看到的是哪几项（空值项已按 §11.2 隐藏，见 prd#1005）。
   */
  useEffect(() => {
    const el = sectionRef.current
    if (!el || !data || viewReportedRef.current) return
    let dwellTimer = 0
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
            if (dwellTimer) continue
            dwellTimer = window.setTimeout(() => {
              dwellTimer = 0
              if (viewReportedRef.current) return
              viewReportedRef.current = true
              trackEvent('model_detail_benchmark_view', {
                model_id: data.modelgo_id || modelId,
                category: data.type,
                summary_metric_keys: summaryMetricKeys,
                snapshot_date: data.snapshot_date,
              })
              observer.disconnect()
            }, 1000)
          } else if (dwellTimer) {
            // 驻留被打断（滚开了）就清掉，重新进入再从 0 计时
            window.clearTimeout(dwellTimer)
            dwellTimer = 0
          }
        }
      },
      { threshold: [0, 0.5, 1] },
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (dwellTimer) window.clearTimeout(dwellTimer)
    }
  }, [data, modelId, summaryMetricKeys])

  /**
   * `model_detail_benchmark_tooltip_view`（PRD §11.7，prd#1007）。
   * 触发时机按 PRD 原文「用户悬浮**或聚焦**评测项说明」—— InfoTip 的 onReveal
   * 在 hover 与键盘 focus 各触发一次，两条路都覆盖到（§11.6 要求信息图标键盘可聚焦）。
   *
   * 参数映射（PRD 只给了字段名、没定取值，已在单里请需求方确认）：
   *   metric_key     = 所属分组码 group.code（如「代码」组）
   *   evaluation_key = 具体评测项 item.metric（如 SciCode）
   */
  const reportTooltip = (groupCode: string, metricKey: string) => {
    const dedupeKey = `${groupCode}/${metricKey}`
    if (tooltipReportedRef.current.has(dedupeKey)) return
    tooltipReportedRef.current.add(dedupeKey)
    trackEvent('model_detail_benchmark_tooltip_view', {
      model_id: data?.modelgo_id || modelId,
      metric_key: groupCode,
      evaluation_key: metricKey,
    })
  }

  // 加载中不占位：整块本来就可能不存在，先撑一个空壳再抽掉会让详情页跳动
  if (isLoading) return null
  if (composites.length === 0 && groups.length === 0) return null

  return (
    <section className="mg-tile mg-detail-card" ref={sectionRef}>
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
                        <span className="flex min-w-0 items-center gap-1 text-[12px] text-mg-text-1">
                          <span className="min-w-0 truncate">{item.name}</span>
                          {/* 一句话指标解释走名称旁的 ⓘ（PRD §11.6），不再在下方平铺一行：
                              同一句话展示两遍没有意义，而且真实 description 有上百字符、
                              平铺会把明细行撑得很高。InfoTip 自带 tabIndex=0，满足
                              §11.6「键盘可聚焦信息图标」。 */}
                          {item.description ? (
                            <InfoTip
                              text={item.description}
                              onReveal={() => reportTooltip(group.code, item.metric)}
                            />
                          ) : null}
                        </span>
                        <span className="shrink-0 text-[12px] font-semibold text-mg-text-1">
                          {result}
                        </span>
                      </div>
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
