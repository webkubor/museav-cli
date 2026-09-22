import { useEffect, useRef } from 'react'
import { getSupportEvents } from '@/services/support'
import type { SupportEventsResponse } from '@/interfaces/support'

const MAX_BACKOFF_MS = 30000
const BASE_BACKOFF_MS = 1000

/**
 * support/events 长轮询：仅在 enabled=true 时跑（排队/连接中/人工服务/工单详情），
 * 组件卸载或 enabled 变 false 立即停止。请求本身由后端挂起到有更新或超时才返回，
 * 这里收到结果就立刻发起下一轮；网络/服务端失败按指数退避重试，成功后退避重置。
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

    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let backoff = BASE_BACKOFF_MS

    async function loop() {
      while (!stopped) {
        try {
          const event = await getSupportEvents(ticketId)
          if (stopped) return
          backoff = BASE_BACKOFF_MS
          onEventRef.current(event)
        } catch {
          if (stopped) return
          await new Promise((resolve) => { timer = setTimeout(resolve, backoff) })
          backoff = Math.min(backoff * 2, MAX_BACKOFF_MS)
        }
      }
    }

    loop()

    return () => {
      stopped = true
      if (timer) clearTimeout(timer)
    }
  }, [enabled, ticketId])
}
