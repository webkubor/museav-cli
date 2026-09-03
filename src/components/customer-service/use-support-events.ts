/**
 * 客服实时通道（技术方案 §5.3 REST 长轮询 + §7.1「连接层单独抽一个 hook」）。
 *
 * 这个 hook 是业务组件与实时链路之间唯一的门：指数退避、`since_version` 游标维护、
 * `resync_required` 全量对齐、服务端 `retry_after` 退避、`event_id` 去重全部封在这里，
 * 组件只消费规范化后的工单状态和一个事件回调。
 *
 * 三条来自文档的硬约束：
 *   · 面板收起**不停**轮询 —— 未读数要在关闭态继续更新（§6.11 入口三层表现）。
 *   · 退出登录或切换账号**立即停止并清空缓存**（§8 会话生命周期、§7.1 数据来源）。
 *   · 正确性不依赖任何一轮请求成功送达：事件先落库、按游标可重放，掉一轮下一轮补上。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { SupportEvent, SupportTicketSummary } from '@/interfaces/support'
import { useAuthStore } from '@/store/auth'
import { SUPPORT_MOCK_ENABLED, supportGateway } from './gateway'

/** 退避：1s 起、上限 30s、带抖动（§5.3） */
const BACKOFF_BASE_MS = 1000
const BACKOFF_MAX_MS = 30_000
/** 已应用事件 id 的有界集合上限，超出后丢最早的 —— 游标才是正确性来源，这里只防重复渲染 */
const APPLIED_EVENTS_LIMIT = 500
/** 入口角标上限（§6.11：面板关闭时显示未读数，上限 99+） */
export const UNREAD_BADGE_MAX = 99

function backoffDelay(attempt: number) {
  const exponential = Math.min(BACKOFF_BASE_MS * 2 ** attempt, BACKOFF_MAX_MS)
  // 抖动避免多标签页同时重发
  return exponential / 2 + Math.random() * (exponential / 2)
}

export interface UseSupportEventsResult {
  /** 已知工单的摘要，按 ticket_id 索引。列表/详情的实时刷新都从这里对齐 */
  tickets: Map<string, SupportTicketSummary>
  /** 未读工单总数（§4.6：只有 service_mode <> 'live' 的工单计未读） */
  unreadTotal: number
  /** 是否有未读（打开态只显示蓝点、不显示数字，用这个判断） */
  hasUnread: boolean
  /** 把服务端摘要并入本地缓存（列表加载、REST 写操作返回后调用） */
  mergeTickets: (items: SupportTicketSummary[]) => void
  /** 本地把某张工单标为已读，配合 REST markRead 一起用，避免等下一轮事件才回落 */
  markReadLocally: (ticketId: string, readSeq: number) => void
  connected: boolean
}

export function useSupportEvents(options: {
  /** 事件回调：面板据此推进模式、插卡片、刷新详情。同一 event_id 只会回调一次 */
  onEvent?: (event: SupportEvent) => void
}): UseSupportEventsResult {
  const { onEvent } = options
  const authenticated = useAuthStore((s) => s.isAuthenticated)
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  /**
   * 轮询要登录态：未登录用户只有问答与反馈，不发起轮询（技术方案 §7.1）。
   * mock 下放开这一条 —— mock 后端不校验会话，而 test 环境开了阿里云验证码 2.0，
   * 纯 API 登录过不去（见 skill `console-automation-local` 的已知问题），
   * 不放开就没法在浏览器里验未读三层与事件驱动的模式推进。生产构建里 mock 常量为 false。
   */
  const isLoggedIn = authenticated || SUPPORT_MOCK_ENABLED

  const [tickets, setTickets] = useState<Map<string, SupportTicketSummary>>(new Map())
  const [connected, setConnected] = useState(false)
  /** 轮询循环里要读最新缓存与最新回调，state/props 闭包读不到，用 ref 影子 */
  const ticketsRef = useRef(tickets)
  const sinceVersionRef = useRef(0)
  const appliedEventIdsRef = useRef<string[]>([])
  const onEventRef = useRef(onEvent)

  // ref 只能在渲染之外写（react-hooks/refs）；这两个影子每次提交后同步一次即可
  useEffect(() => {
    ticketsRef.current = tickets
    onEventRef.current = onEvent
  })

  /**
   * §8：退出登录或切换账号后立即清空缓存。
   * 与 use-cs-chat 同一个理由用渲染期调整而不是 effect —— effect 里同步 setState
   * 会被判为级联渲染，而这里要的正是「同一次渲染就别再拿旧租户的数据去画」。
   */
  const [authSnapshot, setAuthSnapshot] = useState(isLoggedIn)
  if (authSnapshot !== isLoggedIn) {
    setAuthSnapshot(isLoggedIn)
    if (!isLoggedIn) {
      setTickets(new Map())
      setConnected(false)
    }
  }

  const mergeTickets = useCallback((items: SupportTicketSummary[]) => {
    if (items.length === 0) return
    setTickets((current) => {
      const next = new Map(current)
      for (const item of items) {
        const existing = next.get(item.ticket_id)
        // 版本回退的响应直接丢弃：并发的列表请求可能带回比事件更旧的快照
        if (existing && existing.version > item.version) continue
        next.set(item.ticket_id, item)
      }
      return next
    })
  }, [])

  const markReadLocally = useCallback((ticketId: string, readSeq: number) => {
    setTickets((current) => {
      const existing = current.get(ticketId)
      if (!existing) return current
      const next = new Map(current)
      next.set(ticketId, {
        ...existing,
        read_message_seq: Math.max(existing.read_message_seq ?? 0, readSeq),
        unread_count: 0,
      })
      return next
    })
  }, [])

  /** 缺口过大的工单改走列表全量对齐（§5.3 resync_required） */
  const resync = useCallback(async () => {
    try {
      const page = await supportGateway.listTickets({ filter: 'all', limit: 20 })
      mergeTickets(page.items)
    } catch {
      // 对齐失败不致命：下一轮轮询仍会按游标补拉
    }
  }, [mergeTickets])

  useEffect(() => {
    if (!isLoggedIn) {
      // 游标与已应用集合是 ref，不参与渲染，在这里重置不会引起级联渲染
      sinceVersionRef.current = 0
      appliedEventIdsRef.current = []
      return
    }

    const controller = new AbortController()
    let stopped = false
    let attempt = 0

    /**
     * 首屏对齐：长轮询只送增量，未读数要先有个基线。
     * ponytail: 只拉第一页（服务端按「有未读优先」排序，未读工单必然在前），
     * 未读总数因此在极端情况下会少算第 11 条以后的未读；真要精确得等后端出汇总字段。
     */
    async function bootstrap() {
      try {
        const page = await supportGateway.listTickets({ filter: 'all', limit: 10 })
        if (!stopped) mergeTickets(page.items)
      } catch (error) {
        // 接口未上线或失败：不阻塞轮询启动，未读数留 0。dev 下打出来，
        // 否则「入口没有未读角标」会被误当成前端没实现（排查这条时踩过）
        if (import.meta.env.DEV) console.warn('[support] 首屏工单对齐失败', error)
      }
      sinceVersionRef.current = supportGateway.initialCursor()
    }

    async function loop() {
      await bootstrap()
      while (!stopped) {
        try {
          const response = await supportGateway.pollEvents(sinceVersionRef.current, controller.signal)
          if (stopped) return
          attempt = 0
          setConnected(true)

          for (const event of response.events) {
            if (appliedEventIdsRef.current.includes(event.event_id)) continue
            appliedEventIdsRef.current.push(event.event_id)
            if (appliedEventIdsRef.current.length > APPLIED_EVENTS_LIMIT) {
              appliedEventIdsRef.current.splice(0, appliedEventIdsRef.current.length - APPLIED_EVENTS_LIMIT)
            }
            if (event.payload.ticket) mergeTickets([event.payload.ticket])
            onEventRef.current?.(event)
          }

          /**
           * 游标推进。
           *
           * ⚠️ 待后端确认（技术方案 §5.3 只写「下一轮请求带 since_version（本地每张工单
           * 已应用的版本）」，没给出这个游标的编码方式；而 URL 上它是**单值**）。
           * 这里取「本轮所见版本的最大值」并用响应里的 `server_versions` 校正 ——
           * 语义上等价于「我已经追到这个位置」，且服务端按 uq_support_events_version
           * 顺序返回缺口事件，最大值单调不回退。若后端实际是不透明串或按工单的 map，
           * 只需改这一处 + gateway 的 query 拼接。联调时要和熊仁杰对齐并落 API 单。
           */
          const seenVersion = Math.max(
            sinceVersionRef.current,
            ...response.events.map((event) => event.version),
          )
          sinceVersionRef.current = seenVersion

          // server_versions 是**每张工单**的版本（另一个量纲，不能混进游标），
          // 它的用途是校正本地摘要：本地版本落后就说明漏了事件，补拉那几张
          const stale = (response.server_versions ?? []).filter((item) => {
            const local = ticketsRef.current.get(item.ticket_id)
            return local ? local.version < item.version : false
          })
          if (stale.length > 0) await resync()

          if (response.resync_required?.length) await resync()

          if (response.retry_after && response.retry_after > 0) {
            await sleep(response.retry_after * 1000, controller.signal)
          }
        } catch (error) {
          if (stopped || controller.signal.aborted) return
          if (error instanceof DOMException && error.name === 'AbortError') return
          setConnected(false)
          attempt += 1
          await sleep(backoffDelay(attempt), controller.signal)
        }
      }
    }

    void loop()
    return () => {
      stopped = true
      controller.abort()
    }
    // activeTenantId 进依赖：切换租户等于换了数据域，必须重启轮询并丢掉上一租户的缓存
  }, [isLoggedIn, activeTenantId, mergeTickets, resync])

  const unreadTotal = useMemo(
    () => [...tickets.values()].reduce((sum, ticket) => sum + (ticket.unread_count ?? 0), 0),
    [tickets],
  )

  return {
    tickets,
    unreadTotal,
    hasUnread: unreadTotal > 0,
    mergeTickets,
    markReadLocally,
    connected,
  }
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      window.clearTimeout(timer)
      resolve()
    }, { once: true })
  })
}
