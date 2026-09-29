import { useEffect, useState } from 'react'
import { listSupportTickets } from '@/services/support'
import { ticketUnreadCountOf } from '@/interfaces/support'

/** 面板关着时每隔多久补拉一次（客服回复不走推送，只能拉）。 */
const POLL_MS = 120_000

/**
 * 右下角入口角标的未读总数（服务记录 spec：面板关闭时入口显示未读数量，最大 `99+`）。
 *
 * 没有单独的未读汇总接口，取服务记录第一页按条累加；实时人工单不计（ticketUnreadCountOf）。
 * 只在**面板关着**时拉：面板开着时角标本就不显示，关面板那一刻、已读状态变化后
 * （refreshKey）、标签页回到前台时各补一次。未登录不拉 —— 服务记录要登录才有。
 */
/** @param accountId 当前账号 id；null = 未登录。按 id（不是「是否登录」）重拉，A→B 直接切号时不沿用 A 的未读数。 */
export function useUnreadTotal(accountId: string | null, panelOpen: boolean, refreshKey: number): number {
  const loggedIn = Boolean(accountId)
  // 记下这个数属于哪个账号：换号后旧数不作数，不必在 effect 里同步清零
  const [state, setState] = useState<{ accountId: string | null; total: number }>({ accountId: null, total: 0 })

  useEffect(() => {
    if (!loggedIn || panelOpen) return
    let cancelled = false
    const load = () => {
      if (document.visibilityState === 'hidden') return
      listSupportTickets({ filter: 'all' })
        .then((page) => {
          if (!cancelled) setState({ accountId, total: page.items.reduce((sum, t) => sum + ticketUnreadCountOf(t), 0) })
        })
        // 角标是提示不是功能：拉失败保持上次的数，不弹错
        .catch(() => {})
    }
    load()
    const timer = window.setInterval(load, POLL_MS)
    document.addEventListener('visibilitychange', load)
    return () => {
      cancelled = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', load)
    }
  }, [loggedIn, accountId, panelOpen, refreshKey])

  return loggedIn && state.accountId === accountId ? state.total : 0
}
