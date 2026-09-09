/**
 * 发现页的接口查询 —— 把 observer 的六接口收在一处，页面组件只拿转换后的结果。
 *
 * 每日快照，同一天内切来切去不必反复请求，故 staleTime 给 5 分钟。
 */
import { useTranslation } from 'react-i18next'
import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  getDiscoveryAnalysis,
  getHotAgents,
  getDiscoveryOverview,
  getDiscoveryUsageTrends,
  joinSourceModelIds,
  listDiscoveryModelOptions,
  listDiscoveryRankings,
} from '@/services/model-discovery'
import { DISCOVERY_PRIMARY_METRIC } from '@/constants/model-discovery'
import type { DiscoveryMetric, DiscoveryModelOption, DiscoveryType, DiscoveryUsageTrends,
  HotAgentPeriod,
} from '@/types'
import {
  discoveryTypeFor,
  isLanguageType,
  specialtyMetricFor,
  toPrototypeModel,
  toSummaryCards,
  type ModalityKey,
  type PrototypeModel,
  type SpecialtyKind,
  type PrototypeSummaryCard,
} from './discovery-data'

const STALE_TIME = 5 * 60 * 1000

/**
 * 翻页、切指标、切 tab 都会换 queryKey，默认行为是先清空再填——表格与图表整块
 * 闪一下白。保留上一次的数据直到新数据到达，视觉上只是内容替换。
 */
const keepPrevious = <T,>(previous: T | undefined) => previous

/**
 * 一次取多少条模型。
 *
 * 接口上限是 100，而 TEXT_CHAT 当前有 631 个模型——**不拉全量**：榜单是 Top N、
 * 散点最多铺十几个点，页内表格也只翻几页，为此多打 6 次请求不划算。页面上
 * 「共 N 个模型」一律用响应里的 `total`（真实总数），不要用这里的条数。
 */
const PAGE_SIZE = 100

export interface DiscoveryQueryResult {
  models: PrototypeModel[]
  summaryCards: PrototypeSummaryCard[]
  /** 该指标下可排序的模型总数，来自接口，不等于 models.length。 */
  total: number
  /** 数据截止日期，页面需展示「数据截至 X」。 */
  snapshotDate: string
  /**
   * **当前 models 实际对应的业务类型**，取自接口响应而不是入参。
   *
   * 切 tab 时入参的 type 立刻变，但 placeholderData 会让 models 暂时停留在上一个
   * type 的数据上。任何「数据换了就重置」的逻辑都必须盯这个字段，盯入参会在旧数据
   * 上就把重置做掉，等真数据到达时反而不再触发。
   */
  dataType: DiscoveryType | undefined
  isLoading: boolean
  isError: boolean
  /** 两个子查询一起重拉 —— 榜单与总览共用一个错误态，重试也该一起。 */
  refetch: () => void
}

export function useDiscoveryQuery(
  modality: ModalityKey,
  task: string,
  /** 'supported' = 仅看已接入：总览六张卡与 Top 榜都只在已接入模型里选 */
  scope: 'all' | 'supported' = 'all',
): DiscoveryQueryResult {
  const { t } = useTranslation()
  const type = discoveryTypeFor(modality, task)
  const metric = type ? DISCOVERY_PRIMARY_METRIC[type] : undefined

  const integratedOnly = scope === 'supported'

  const rankings = useQuery({
    queryKey: ['discovery-rankings', type, integratedOnly],
    queryFn: () =>
      listDiscoveryRankings({
        type: type!,
        metric: metric!,
        page_size: PAGE_SIZE,
        ...(integratedOnly ? { integrated: true } : {}),
      }),
    enabled: Boolean(type && metric),
    staleTime: STALE_TIME,
    placeholderData: keepPrevious,
  })

  const overview = useQuery({
    queryKey: ['discovery-overview', type, integratedOnly],
    queryFn: () => getDiscoveryOverview({ type: type!, ...(integratedOnly ? { integrated: true } : {}) }),
    enabled: Boolean(type),
    staleTime: STALE_TIME,
    placeholderData: keepPrevious,
  })

  // 必须 memo：这个数组是页面上十几个 useMemo 的依赖，每次渲染重建会让它们全部失效
  const models = useMemo(
    () => (type && rankings.data ? rankings.data.items.map((item) => toPrototypeModel(t, item, type)) : []),
    [type, rankings.data, t],
  )

  return {
    models,
    summaryCards: type ? toSummaryCards(t, overview.data, type) : [],
    total: rankings.data?.total ?? 0,
    snapshotDate: rankings.data?.snapshot_date ?? overview.data?.snapshot_date ?? '',
    dataType: rankings.data?.type,
    isLoading: rankings.isLoading || overview.isLoading,
    isError: rankings.isError || overview.isError,
    refetch: () => {
      void rankings.refetch()
      void overview.refetch()
    },
  }
}



/** PRD（modelgo_prd `ModelDiscoveryPage.tsx` 的 completeSpecialtyRows）：专项榜取前 10。 */
const SPECIALTY_LIMIT = 10

/**
 * 专项榜的模型列表 —— **每张榜按自己的 metric 各向服务端要前 10**。
 *
 * 为什么不共用主榜那 100 条：那是「按主指标排序的前 100」，从里面再挑出的
 * Top N 不是全量 Top N。实测 TEXT_CHAT 的 `metric=USAGE` 有 261 个模型可排序，
 * 而页面池子只有 100 条、其中用量 > 0 的仅 6 条 —— 用量榜只渲染 6 条，
 * 第 6 名起与服务端权威榜错位，漏掉 4 个该上榜的模型。TPS 榜与时延榜
 * （各 189 个候选）同样漏。表格早就改成服务端排序分页了，专项榜漏了这一处。
 *
 * 跟随「全部 / 仅看已接入」（服务端 `integrated` 参数），**不跟随厂商筛选** ——
 * 与改造前用 visibleModels 的口径一致（厂商筛选只作用于完整榜单）。
 *
 * 排序与方向全归服务端：STT 的 AA_WER、时延都是越低越好，前端不传方向；
 * 「指标值为空的模型不参与排序」也由服务端处理。
 */
export function useDiscoverySpecialtyModels(
  modality: ModalityKey,
  task: string,
  kinds: readonly SpecialtyKind[],
  scope: 'all' | 'supported',
): { byKind: Partial<Record<SpecialtyKind, PrototypeModel[]>>; isLoading: boolean } {
  const { t } = useTranslation()
  const type = discoveryTypeFor(modality, task)
  const integratedOnly = scope === 'supported'

  // 不 memo：只是把 kinds 映射成 (kind, metric)，稳定性由 queryKey 保证
  const specs = type
    ? kinds
        .map((kind) => ({ kind, metric: specialtyMetricFor(kind, type) }))
        .filter((spec): spec is { kind: SpecialtyKind; metric: DiscoveryMetric } => Boolean(spec.metric))
    : []

  const results = useQueries({
    queries: specs.map(({ kind, metric }) => ({
      queryKey: ['discovery-specialty', type, kind, metric, integratedOnly],
      queryFn: () =>
        listDiscoveryRankings({
          type: type!,
          metric,
          page_size: SPECIALTY_LIMIT,
          ...(integratedOnly ? { integrated: true } : {}),
        }),
      enabled: Boolean(type),
      staleTime: STALE_TIME,
      placeholderData: keepPrevious,
    })),
  })

  const byKind: Partial<Record<SpecialtyKind, PrototypeModel[]>> = {}
  if (type) {
    specs.forEach((spec, index) => {
      const data = results[index]?.data
      if (data) byKind[spec.kind] = data.items.map((item) => toPrototypeModel(t, item, type))
    })
  }

  return { byKind, isLoading: results.some((result) => result.isLoading) }
}

/**
 * 选中模型的近 7 日用量趋势。
 *
 * 原型这里是编的：一组固定的 7 天系数乘当前用量，所有模型曲线形状一模一样，
 * 增长率也是由此算出来的假值。真实序列走 usage-trends 接口。
 *
 * 注意序列里每个点是「该快照日回看 7 天」的**滚动**用量，不是当日增量；
 * `growth_rate` 在序列不足两点或起点为 0 时为 null（此时不显示增长率）。
 */
export function useDiscoveryTrends(
  modality: ModalityKey,
  task: string,
  sourceModelIds: readonly string[],
): { data: DiscoveryUsageTrends | undefined; isLoading: boolean; isError: boolean; refetch: () => void } {
  const type = discoveryTypeFor(modality, task)
  const ids = joinSourceModelIds([...sourceModelIds].sort())

  const query = useQuery({
    queryKey: ['discovery-usage-trends', type, ids],
    queryFn: () => getDiscoveryUsageTrends({ type: type!, source_model_ids: ids }),
    enabled: Boolean(type && ids),
    staleTime: STALE_TIME,
    placeholderData: keepPrevious,
  })

  return { data: query.data, isLoading: query.isLoading, isError: query.isError, refetch: () => void query.refetch() }
}

/** 表格的「指标类型」下拉 → 接口的 metric。四个选项与接口一一对应。 */
export type TableMetric = 'overall' | 'value' | 'price' | 'usage'

function tableMetricFor(type: DiscoveryType, metric: TableMetric): DiscoveryMetric {
  if (metric === 'value') return 'VALUE_SCORE'
  if (metric === 'usage') return 'USAGE'
  if (metric === 'price') return isLanguageType(type) ? 'COST_PER_TASK' : 'API_PRICE'
  return DISCOVERY_PRIMARY_METRIC[type]
}

/**
 * 页面上的两个接入状态筛选（scope 与 tableAccess）都映射到接口的
 * `integration_status`，取更严格的那个；两者互斥时（只看已接入 + 只看未接入）
 * 返回 'none'，调用方据此直接给空结果，不必发一次注定为空的请求。
 */
/**
 * 把页面的两个筛选器映射成接口参数。
 *
 * **「仅看已接入」走 `integrated` 布尔参数，不是 `integration_status`** ——
 * 后者说的是接在哪个站（MODELGO=国内 / MODELGO_AI=国外），拿它当接入态会把国内站
 * 没上架的模型筛进来（qa#718）。接口只认 `true` / `false` 两个字面量，传 `1`/`yes`
 * 会被当作未传、静默不过滤。
 *
 * 「待支持」= 未接入，`integrated=false`。两个筛选器同时要「已接入」和「待支持」时
 * 是空集，返回 `none` 让调用方直接不发请求。
 */
function integrationFilterFor(
  scope: 'all' | 'supported',
  tableAccess: 'all' | 'supported' | 'pending',
): { integrated?: boolean } | 'none' {
  const wantsConnected = scope === 'supported' || tableAccess === 'supported'
  const wantsPending = tableAccess === 'pending'
  if (wantsConnected && wantsPending) return 'none'
  if (wantsConnected) return { integrated: true }
  if (wantsPending) return { integrated: false }
  return {}
}

export interface DiscoveryTableResult {
  models: PrototypeModel[]
  total: number
  isLoading: boolean
  isError: boolean
  refetch: () => void
}

/**
 * 完整榜单：**服务端排序 + 服务端分页**，厂商多选也走同一条路。
 *
 * 原先整张表吃的是一次取回的前 100 条、再在前端分页——榜单标着「共 631 个模型」
 * 却只能翻 5 页。排序也一样：接口按 metric 在全量上排好，前端自己排只能排出
 * 这 100 条里的顺序。
 *
 * 厂商多选曾经要按厂商并发拉取再前端合并，因为接口的 `creator` 只认单值、传逗号
 * 分隔会静默返回 0 条（qa#708 第 3 条）。**2026-09-07 实测后端已支持逗号多值**
 * （Anthropic=21 + OpenAI=41 → 多值 total=62，三页 25/25/12 跨页无重无漏，
 * 与 integration_status 组合也正常），并发兜底连同前端重排一并删除。
 */
export function useDiscoveryTable(
  modality: ModalityKey,
  task: string,
  options: {
    metric: TableMetric
    page: number
    pageSize: number
    creators: readonly string[]
    scope: 'all' | 'supported'
    tableAccess: 'all' | 'supported' | 'pending'
  },
): DiscoveryTableResult {
  const { t } = useTranslation()
  const type = discoveryTypeFor(modality, task)
  const metric = type ? tableMetricFor(type, options.metric) : undefined
  const filter = integrationFilterFor(options.scope, options.tableAccess)
  const enabled = Boolean(type && metric) && filter !== 'none'
  const integratedParam = filter === 'none' ? undefined : filter.integrated

  // 厂商筛选按选中顺序拼成逗号串；queryKey 用同一个串，顺序变了才算换查询
  const creator = options.creators.join(',')

  const query = useQuery({
    queryKey: ['discovery-table', type, metric, options.page, options.pageSize, creator, integratedParam],
    queryFn: () =>
      listDiscoveryRankings({
        type: type!,
        metric: metric!,
        page: options.page,
        page_size: options.pageSize,
        ...(creator ? { creator } : {}),
        ...(integratedParam === undefined ? {} : { integrated: integratedParam }),
      }),
    enabled,
    staleTime: STALE_TIME,
    placeholderData: keepPrevious,
  })

  const merged = useMemo(() => {
    if (!type) return { models: [], total: 0 }
    const data = query.data
    return {
      models: data ? data.items.map((item) => toPrototypeModel(t, item, type)) : [],
      total: data?.total ?? 0,
    }
  }, [type, query.data, t])

  return { ...merged, isLoading: query.isLoading, isError: query.isError, refetch: () => void query.refetch() }
}

export interface DiscoveryOptionsResult {
  /** 该类型下的**全部**模型（不分页），用于模型选择器。 */
  options: DiscoveryModelOption[]
  /** 全量厂商，用于厂商筛选下拉的候选。 */
  vendors: string[]
  isLoading: boolean
  isError: boolean
  refetch: () => void
}

/**
 * 模型选择器与厂商筛选的候选。
 *
 * 必须用 model-options 而不是 rankings：前者返回该类型的**全部**模型（不分页），
 * 后者一页最多 100 条。拿 rankings 顶替会让选择器只剩前 100 个模型、厂商下拉只剩
 * 二十来家（实测 TEXT_CHAT 全量 631 个模型 / 59 家厂商，前 100 条里只有 22 家）。
 */
export function useDiscoveryModelOptions(modality: ModalityKey, task: string): DiscoveryOptionsResult {
  const type = discoveryTypeFor(modality, task)
  const query = useQuery({
    queryKey: ['discovery-model-options', type],
    queryFn: () => listDiscoveryModelOptions({ type: type! }),
    enabled: Boolean(type),
    staleTime: STALE_TIME,
  })

  const options = useMemo(() => query.data?.models ?? [], [query.data])
  const vendors = useMemo(
    () => [...new Set(options.map((item) => item.creator_name).filter((name): name is string => Boolean(name)))],
    [options],
  )

  return { options, vendors, isLoading: query.isLoading, isError: query.isError, refetch: () => void query.refetch() }
}

/** 散点 X 轴的取数来源 → 接口 metric。 */
function analysisMetricFor(
  type: DiscoveryType,
  source: 'price' | 'speed' | 'latency' | 'usage',
): DiscoveryMetric {
  if (source === 'speed') return 'OUTPUT_TPS'
  if (source === 'latency') return 'END_TO_END_LATENCY'
  if (source === 'usage') return 'USAGE'
  return isLanguageType(type) ? 'COST_PER_TASK' : 'API_PRICE'
}

export interface DiscoveryAnalysisResult {
  points: Map<string, { x: number; y: number }>
  isLoading: boolean
  isError: boolean
  refetch: () => void
}

/**
 * 散点坐标走 analysis 接口，按 source_model_id 索引返回。
 *
 * 之前是拿本地那 100 条模型卡自己算 x/y——值本身没错，但选择器一旦能选到第 100 名
 * 开外的模型就没有坐标了。**任一坐标为空的模型会被接口排除**，所以返回的点数可能
 * 少于传入的模型数，这是预期行为。
 */
export function useDiscoveryAnalysis(
  modality: ModalityKey,
  task: string,
  sourceModelIds: readonly string[],
  xSource: 'price' | 'speed' | 'latency' | 'usage',
  yIsPrice: boolean,
): DiscoveryAnalysisResult {
  const type = discoveryTypeFor(modality, task)
  const ids = joinSourceModelIds([...sourceModelIds].sort())
  const xMetric = type ? analysisMetricFor(type, xSource) : undefined
  const yMetric = type
    ? yIsPrice
      ? analysisMetricFor(type, 'price')
      : DISCOVERY_PRIMARY_METRIC[type]
    : undefined

  const query = useQuery({
    queryKey: ['discovery-analysis', type, xMetric, yMetric, ids],
    queryFn: () =>
      getDiscoveryAnalysis({
        type: type!,
        x_metric: xMetric!,
        y_metric: yMetric!,
        source_model_ids: ids,
      }),
    enabled: Boolean(type && xMetric && yMetric && ids),
    staleTime: STALE_TIME,
    placeholderData: keepPrevious,
  })

  const points = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    for (const point of query.data?.points ?? []) map.set(point.source_model_id, { x: point.x, y: point.y })
    return map
  }, [query.data])

  return { points, isLoading: query.isLoading, isError: query.isError, refetch: () => void query.refetch() }
}

/**
 * 热门 Agent 应用榜（接口文档第七节）。
 *
 * 首屏 10 条、展开 20 条，所以固定拉 20 —— 数据源每周期 200 条，不截断会白拉一堆。
 * 三个周期各自一个 queryKey：数据在同一份快照里，切周期只是换参数，缓存分开更省。
 */
export function useHotAgents(period: HotAgentPeriod, enabled: boolean) {
  const query = useQuery({
    queryKey: ['discovery-hot-agents', period],
    queryFn: () => getHotAgents({ period, limit: 20 }),
    enabled,
    staleTime: STALE_TIME,
    placeholderData: keepPrevious,
  })
  return {
    apps: query.data?.apps ?? [],
    /** 榜单完整条数（不受 limit 影响），用于「共 N 个应用」。 */
    total: query.data?.total ?? 0,
    source: query.data?.source,
    snapshotDate: query.data?.snapshot_date,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: () => void query.refetch(),
  }
}
