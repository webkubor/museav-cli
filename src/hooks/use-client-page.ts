import { useState } from 'react'

/** 客户端分页默认页大小（条/页）。 */
export const RECORD_PAGE_SIZE = 10

/**
 * 前端分页：部分后端列表接口返回全量数组、无分页参数（如 referral 的
 * reward-records / invitees / withdrawals），全量渲染会拖垮页面，故在前端切片。
 * 用 clamp 而非 useEffect 重置页码，避免数据变化时越界 + 不触发 set-state-in-effect。
 * 翻页交互会覆盖被 clamp 的陈旧 page。
 */
export function useClientPage<T>(items: T[], pageSize = RECORD_PAGE_SIZE) {
  const [page, setPage] = useState(1)
  const total = items.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(page, totalPages)
  const paged = items.slice((safePage - 1) * pageSize, safePage * pageSize)
  return { paged, page: safePage, setPage, total, pageSize }
}
