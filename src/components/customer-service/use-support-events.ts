import { useEffect, useRef } from 'react'
import { pollSupportEvents } from '@/services/support'
import type { SupportEventsResponse } from '@/interfaces/support'

const MAX_BACKOFF_MS = 30000
const BASE_BACKOFF_MS = 1000
/** 后端挂起秒数（agent 上限 60）。取 25：控制台链路经网关，留足余量不被中间层空闲超时掐断。 */
const WAIT_SECONDS = 25
/** 空轮（204 / 无事件）之间的最小间隔：后端万一不挂起立即返回，也不会打成风暴。 */
const MIN_EMPTY_ROUND_MS = 2000

/**
 * 游标只取本轮真正拿到的 events[].version。
 * 不用 server_versions：后端先 ListEvents(since) 再 GetTicket 取版本，两步之间若恰好写入新事件
 * （如客服「解决」），server_versions 已是 V+1 而本轮 events 里没有 V+1 —— 游标一跳就永远漏掉它。
 */
function nextCursor(cursor: number, payload: SupportEventsResponse | null): number {
  let next = cursor
  for (const e of payload?.events ?? []) next = Math.max(next, e.version ?? 0)
  return next
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (ms <= 0 || signal.aborted) { resolve(); return }
    // 正常到点也要摘掉 abort 监听，否则每轮空轮都在同一个 signal 上多挂一个闭包直到卸载
    const onAbort = () => { clearTimeout(timer); resolve() }
    const timer = setTimeout(() => { signal.removeEventListener('abort', onAbort); resolve() }, ms)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * support/events 长轮询：仅在 enabled=true 时跑（排队/连接中/人工服务），
 * 组件卸载或 enabled 变 false 立即中止在途请求。
 *
 * 每轮带 since_version（已见最大版本）+ wait，后端有新事件才返回、否则挂到超时回 204；
 * 首轮游标为 0，会先拿到一次全量用于同步当前状态。只有真的有事件才回调 onEvent。
 * 契约与运营后台 useSupportEvents 同口径（那边 wait=60）。
 */
export function useSupportEvents(
  enabled: boolean,
  ticketId: string | undefined,
  onEvent: (event: SupportEventsResponse) => void,
) {
  const onEventRef = useRef(onEvent)
  useEffect(() => {
    onEventRef.current = onEvent
  })

  useEffect(() => {
    if (!enabled) return

    const controller = new AbortController()
    const { signal } = controller
    let cursor = 0
    let backoff = BASE_BACKOFF_MS

    async function loop() {
      while (!signal.aborted) {
        const startedAt = Date.now()
        try {
          const payload = await pollSupportEvents({ ticketId, sinceVersion: cursor, wait: WAIT_SECONDS }, signal)
          if (signal.aborted) return
          backoff = BASE_BACKOFF_MS
          cursor = nextCursor(cursor, payload)
          const hasEvents = (payload?.events?.length ?? 0) > 0
          if (payload && hasEvents) onEventRef.current(payload)
          const retryAfterMs = Math.max(0, (payload?.retry_after ?? 0) * 1000)
          const idleFloorMs = hasEvents ? 0 : MIN_EMPTY_ROUND_MS - (Date.now() - startedAt)
          await sleep(Math.max(retryAfterMs, idleFloorMs), signal)
        } catch {
          if (signal.aborted) return
          await sleep(backoff, signal)
          backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
        }
      }
    }

    void loop()
    return () => controller.abort()
  }, [enabled, ticketId])
}
