/**
 * 发现页的接口查询 —— 把 observer 的六接口收在一处，页面组件只拿转换后的结果。
 *
 * 每日快照，同一天内切来切去不必反复请求，故 staleTime 给 5 分钟。
 */
import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getDiscoveryOverview, listDiscoveryRankings } from '@/services/model-discovery'
import { DISCOVERY_PRIMARY_METRIC } from '@/constants/model-discovery'
import {
  discoveryTypeFor,
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
