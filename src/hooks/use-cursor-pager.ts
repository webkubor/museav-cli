import { useCallback, useState } from 'react'

/**
 * 后端游标翻页的页码栈：维护「每页起始 cursor」，支持上一页/下一页（不可跳页，
 * 因为游标接口无法定位任意页）。适配返回 { items, next_cursor } 的 CursorPage
 * 接口（recharge / gift 等）。第一页 cursor 为 undefined。
 *
 * 用法：把 `cursor` 带进 queryKey 与请求参数，翻到下一页时把「当前页响应的
 * next_cursor」传给 next()。切租户/换筛选条件后调用 reset() 回到第一页，避免把旧
 * 上下文的 cursor 发给新数据源。
 */
export function useCursorPager() {
  const [page, setPage] = useState(1)
  const [cursorStack, setCursorStack] = useState<Array<string | undefined>>([undefined])
  const cursor = cursorStack[page - 1]

  const next = useCallback(
    (nextCursor: string | null | undefined) => {
      if (!nextCursor) return
      setCursorStack((stack) => [...stack.slice(0, page), nextCursor])
      setPage((p) => p + 1)
    },
    [page],
  )

  const prev = useCallback(() => setPage((p) => Math.max(1, p - 1)), [])

  const reset = useCallback(() => {
    setPage(1)
    setCursorStack([undefined])
  }, [])

  return { page, cursor, next, prev, reset }
}
