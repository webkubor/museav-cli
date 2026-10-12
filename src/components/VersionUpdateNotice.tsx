/**
 * 检测到线上换版后，在下一次路由切换时静默刷新（qa#741，口径对齐 prd#838）。
 * 挂在 BrowserRouter 内，自身不渲染内容。
 *
 * 口径来自 prd#838「新版本发布不再弹窗提示，改为默认自动更新」：
 *   · 不在前端显示任何提示（此前 toast + 1.5s 强刷与它冲突，已移除）；
 *   · 刷新放在下一次路由切换，避免打断正在输入 / 流式生成的用户；
 *     长时间停留同一页则保持旧版本直到切页。
 * 检测本身（每 5 分钟轮询 /version.json）仍由 useLatestVersionCommit 负责。
 */
import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { reloadCurrentPage } from '@/lib/page-navigation'
import { getRefreshAction, useLatestVersionCommit } from '@/lib/version-check'

const PENDING_REFRESH_KEY = 'app-version-refresh-target'

function readPendingRefresh(): string | null {
  try {
    return window.sessionStorage.getItem(PENDING_REFRESH_KEY)
  } catch {
    return null
  }
}

function writePendingRefresh(commit: string | null): boolean {
  try {
    if (commit) window.sessionStorage.setItem(PENDING_REFRESH_KEY, commit)
    else window.sessionStorage.removeItem(PENDING_REFRESH_KEY)
    return true
  } catch {
    return false
  }
}

/** 发现新版后，在路由切换时静默刷新；同一 commit 仅自动尝试一次。 */
export function VersionUpdateNotice() {
  const latestCommit = useLatestVersionCommit()
  const { pathname } = useLocation()
  const lastPathname = useRef(pathname)

  useEffect(() => {
    const routeChanged = lastPathname.current !== pathname
    lastPathname.current = pathname

    const navigation = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    const action = getRefreshAction(latestCommit, __BUILD_COMMIT__, readPendingRefresh(), navigation?.type)

    // 仅在已取得非空线上 commit 且与当前 bundle 一致时，清掉上次刷新标记。
    // 请求未返回、失败或缺少 commit 都不能证明已更新；此时清标记会让旧 bundle
    // 在之后每次切页时重复刷新（#1255 验收项 5）。
    if (action === 'none') {
      if (latestCommit && latestCommit === __BUILD_COMMIT__) writePendingRefresh(null)
      return
    }
    // 首次渲染 / 同一页内轮询到新版：只记着，不动用户正在用的页面
    if (!routeChanged) return
    // 同一新版刷新后仍拿到旧 bundle：停止重试，避免重载循环（按 prd#838 也不弹提示）
    if (action === 'already-attempted') return
    // 标记写不进去就不冒险刷新，否则无法防循环
    if (!latestCommit || !writePendingRefresh(latestCommit)) return
    reloadCurrentPage()
  }, [latestCommit, pathname])

  return null
}
