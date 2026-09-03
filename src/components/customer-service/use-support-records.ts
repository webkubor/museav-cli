/**
 * 服务记录列表的数据编排（PRD §7.8、技术方案 §6.11）。
 *
 * 三条口径都在服务端，这个 hook 只负责把它们如实呈现，不在前端重算：
 *   · 排序「有未读优先，其余按 updated_at 倒序」由服务端给，前端**不再排一遍**。
 *   · 搜索只匹配编号与用户可见标题，且服务端先按 account_id 过滤再匹配。
 *   · 游标是 (has_unread, updated_at, id) 编码的不透明串，原样回传，不解析、不自造。
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SupportTicketFilter, SupportTicketSummary } from '@/interfaces/support'
import { supportGateway } from './gateway'
import { supportTrack } from './support-track'

const PAGE_SIZE = 10
/** 搜索防抖：边打字边请求会把列表刷成闪烁 */
const SEARCH_DEBOUNCE_MS = 300

export function useSupportRecords(options: {
  /** 面板处于服务记录模式时才拉数据，收起就停 */
  active: boolean
  /** 把服务端摘要并入实时缓存，供入口未读数与详情页对齐 */
  onLoaded: (items: SupportTicketSummary[]) => void
}) {
  const { active, onLoaded } = options
  const [filter, setFilter] = useState<SupportTicketFilter>('all')
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<SupportTicketSummary[]>([])
  const [total, setTotal] = useState(0)
  const [cursor, setCursor] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const onLoadedRef = useRef(onLoaded)
  // ref 只能在渲染之外写（react-hooks/refs）
  useEffect(() => {
    onLoadedRef.current = onLoaded
  })
  /** 只用最后一次请求的结果，避免快速切页签时旧响应盖掉新结果 */
  const requestIdRef = useRef(0)

  const load = useCallback(async (nextFilter: SupportTicketFilter, nextQuery: string) => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    setError(null)
    try {
      const page = await supportGateway.listTickets({
        filter: nextFilter,
        query: nextQuery,
        cursor: null,
        limit: PAGE_SIZE,
      })
      if (requestId !== requestIdRef.current) return
      setItems(page.items)
      setTotal(page.total)
      setCursor(page.next_cursor)
      onLoadedRef.current(page.items)
      supportTrack.recordsFilter({
        filter: nextFilter,
        hasQuery: Boolean(nextQuery.trim()),
        total: page.total,
      })
    } catch (err) {
      if (requestId !== requestIdRef.current) return
      setError(err)
      setItems([])
      setTotal(0)
      setCursor(null)
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!active) return
    const timer = window.setTimeout(() => void load(filter, query), query ? SEARCH_DEBOUNCE_MS : 0)
    return () => window.clearTimeout(timer)
  }, [active, filter, query, load])

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await supportGateway.listTickets({ filter, query, cursor, limit: PAGE_SIZE })
      setItems((current) => {
        const seen = new Set(current.map((item) => item.ticket_id))
        return [...current, ...page.items.filter((item) => !seen.has(item.ticket_id))]
      })
      setTotal(page.total)
      setCursor(page.next_cursor)
      onLoadedRef.current(page.items)
    } catch (err) {
      // 增量加载失败不清空已有列表：用户还在看，把错误留给「加载更多」按钮自己表达
      setError(err)
    } finally {
      setLoadingMore(false)
    }
  }, [cursor, filter, loadingMore, query])

  /** 实时事件到达后刷新当前页（工单状态变了、有新消息了都要反映到列表） */
  const refresh = useCallback(() => {
    if (!active) return
    void load(filter, query)
  }, [active, filter, query, load])

  return {
    filter,
    setFilter,
    query,
    setQuery,
    items,
    total,
    hasMore: Boolean(cursor),
    loading,
    loadingMore,
    error,
    loadMore,
    refresh,
    retry: refresh,
  }
}
