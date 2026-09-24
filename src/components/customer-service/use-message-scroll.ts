/**
 * 客服聊天消息区的滚动定位
 * 路由：客服组件内嵌消息线程
 * API：无
 */
import { useEffect, type RefObject } from 'react'

/** 新消息、思考态或客服模式变化时才把聊天线程定位到末尾。 */
export function useMessageAutoScroll<T extends { id: string }>(
  scrollRef: RefObject<HTMLElement | null>,
  messages: readonly T[],
  isAsking: boolean,
  mode: unknown,
) {
  const messageCount = messages.length
  const lastMessageId = messages.at(-1)?.id

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [scrollRef, messageCount, lastMessageId, isAsking, mode])
}
