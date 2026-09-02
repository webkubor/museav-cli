/**
 * 发现页的接口查询 —— 把 observer 的六接口收在一处，页面组件只拿转换后的结果。
 *
 * 每日快照，同一天内切来切去不必反复请求，故 staleTime 给 5 分钟。
 */
import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  getDiscoveryAnalysis,
  getDiscoveryOverview,
  getDiscoveryUsageTrends,
  joinSourceModelIds,
  listDiscoveryModelOptions,
  listDiscoveryRankings,
} from '@/services/model-discovery'
import { DISCOVERY_PRIMARY_METRIC } from '@/constants/model-discovery'
import type { DiscoveryMetric, DiscoveryModelOption, DiscoveryType, DiscoveryUsageTrends } from '@/types'
import {
  discoveryTypeFor,
  isLanguageType,
  toPrototypeModel,
  toSummaryCards,
  type ModalityKey,
  type PrototypeModel,
  type PrototypeSummaryCard,
} from './discovery-data'

const STALE_TIME = 5 * 60 * 1000

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
  isLoading: boolean
  isError: boolean
}

export function useDiscoveryQuery(modality: ModalityKey, task: string): DiscoveryQueryResult {
  const type = discoveryTypeFor(modality, task)
  const metric = type ? DISCOVERY_PRIMARY_METRIC[type] : undefined

  const rankings = useQuery({
    queryKey: ['discovery-rankings', type],
    queryFn: () => listDiscoveryRankings({ type: type!, metric: metric!, page_size: PAGE_SIZE }),
    enabled: Boolean(type && metric),
    staleTime: STALE_TIME,
  })

  const overview = useQuery({
    queryKey: ['discovery-overview', type],
    queryFn: () => getDiscoveryOverview({ type: type! }),
    enabled: Boolean(type),
    staleTime: STALE_TIME,
  })

  // 必须 memo：这个数组是页面上十几个 useMemo 的依赖，每次渲染重建会让它们全部失效
  const models = useMemo(
    () => (type && rankings.data ? rankings.data.items.map((item) => toPrototypeModel(item, type)) : []),
    [type, rankings.data],
  )

  return {
    models,
    summaryCards: type ? toSummaryCards(overview.data, type) : [],
    total: rankings.data?.total ?? 0,
    snapshotDate: rankings.data?.snapshot_date ?? overview.data?.snapshot_date ?? '',
    isLoading: rankings.isLoading || overview.isLoading,
    isError: rankings.isError || overview.isError,
  }
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
): { data: DiscoveryUsageTrends | undefined; isLoading: boolean } {
  const type = discoveryTypeFor(modality, task)
  const ids = joinSourceModelIds([...sourceModelIds].sort())

  const query = useQuery({
    queryKey: ['discovery-usage-trends', type, ids],
    queryFn: () => getDiscoveryUsageTrends({ type: type!, source_model_ids: ids }),
    enabled: Boolean(type && ids),
    staleTime: STALE_TIME,
  })

  return { data: query.data, isLoading: query.isLoading }
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
function integrationStatusFor(
  scope: 'all' | 'supported',
  tableAccess: 'all' | 'supported' | 'pending',
): 'MODELGO' | 'MODELGO_AI' | 'none' | undefined {
  const wantsConnected = scope === 'supported' || tableAccess === 'supported'
  const wantsPending = tableAccess === 'pending'
  if (wantsConnected && wantsPending) return 'none'
  if (wantsConnected) return 'MODELGO'
  if (wantsPending) return 'MODELGO_AI'
  return undefined
}

export interface DiscoveryTableResult {
  models: PrototypeModel[]
  total: number
  isLoading: boolean
}

/**
 * 完整榜单：**服务端排序 + 服务端分页**。
 *
 * 原先整张表吃的是一次取回的前 100 条、再在前端分页——榜单标着「共 631 个模型」
 * 却只能翻 5 页。排序也一样：接口按 metric 在全量上排好，前端自己排只能排出
 * 这 100 条里的顺序。
 *
 * 厂商筛选是多选，而接口的 `creator` 只认单值（传逗号分隔会静默返回 0 条，
 * 不报错——见 qa#710）。所以多选时按厂商并发拉取再合并；无筛选与单选走
 * 服务端分页这条正路。
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
  const type = discoveryTypeFor(modality, task)
  const metric = type ? tableMetricFor(type, options.metric) : undefined
  const status = integrationStatusFor(options.scope, options.tableAccess)
  const enabled = Boolean(type && metric) && status !== 'none'
  const integrationStatus = status === 'none' ? undefined : status

  // 无筛选 / 单选厂商：服务端分页，一次一页
  const single = useQuery({
    queryKey: ['discovery-table', type, metric, options.page, options.pageSize, options.creators[0], integrationStatus],
    queryFn: () =>
      listDiscoveryRankings({
        type: type!,
        metric: metric!,
        page: options.page,
        page_size: options.pageSize,
        ...(options.creators.length === 1 ? { creator: options.creators[0] } : {}),
        ...(integrationStatus ? { integration_status: integrationStatus } : {}),
      }),
    enabled: enabled && options.creators.length <= 1,
    staleTime: STALE_TIME,
  })

  // 多选厂商：接口不支持多值，按厂商并发拉取后合并
  const multi = useQueries({
    queries:
      enabled && options.creators.length > 1
        ? options.creators.map((creator) => ({
            queryKey: ['discovery-table-creator', type, metric, creator, integrationStatus],
            queryFn: () =>
              listDiscoveryRankings({
                type: type!,
                metric: metric!,
                creator,
                page_size: PAGE_SIZE,
                ...(integrationStatus ? { integration_status: integrationStatus } : {}),
              }),
            staleTime: STALE_TIME,
          }))
        : [],
  })

  const isMulti = options.creators.length > 1

  const merged = useMemo(() => {
    if (!type) return { models: [], total: 0 }
    if (!isMulti) {
      const data = single.data
      return {
        models: data ? data.items.map((item) => toPrototypeModel(item, type)) : [],
        total: data?.total ?? 0,
      }
    }
    // 合并后按 rank 重排（各厂商的 rank 是各自查询内的名次，合并后需按分值重来）
    const items = multi.flatMap((query) => query.data?.items ?? [])
    const ordered = [...items].sort((first, second) => first.rank - second.rank)
    return {
      models: ordered.map((item) => toPrototypeModel(item, type)),
      total: ordered.length,
    }
  }, [type, isMulti, single.data, multi])

  return {
    ...merged,
    isLoading: isMulti ? multi.some((query) => query.isLoading) : single.isLoading,
  }
}

export interface DiscoveryOptionsResult {
  /** 该类型下的**全部**模型（不分页），用于模型选择器。 */
  options: DiscoveryModelOption[]
  /** 全量厂商，用于厂商筛选下拉的候选。 */
  vendors: string[]
  isLoading: boolean
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

  return { options, vendors, isLoading: query.isLoading }
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
  })

  const points = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    for (const point of query.data?.points ?? []) map.set(point.source_model_id, { x: point.x, y: point.y })
    return map
  }, [query.data])

  return { points, isLoading: query.isLoading }
}
