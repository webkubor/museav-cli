/**
 * 检测到线上换版后短暂提示并自动刷新（qa#741）。挂在 App 根部，自身不渲染内容。
 */
import { useEffect, useRef } from 'react'
import { toast } from '@/lib/toast'
import { reloadCurrentPage } from '@/lib/page-navigation'
import { getRefreshAction, useLatestVersionCommit } from '@/lib/version-check'

const PENDING_REFRESH_KEY = 'app-version-refresh-target'
const REFRESH_DELAY_MS = 1500
type ScheduledRefresh = { commit: string; timer: number }

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

/** 发现新版时提示用户并自动刷新；同一 commit 仅自动尝试一次。 */
export function VersionUpdateNotice() {
  const latestCommit = useLatestVersionCommit()
  const scheduledRefresh = useRef<ScheduledRefresh | undefined>(undefined)
  const effectGeneration = useRef(0)

  useEffect(() => {
    const generation = ++effectGeneration.current
    if (!latestCommit) {
      if (scheduledRefresh.current) {
        window.clearTimeout(scheduledRefresh.current.timer)
        scheduledRefresh.current = undefined
        writePendingRefresh(null)
      }
      return
    }

    const cleanupScheduledRefresh = () => {
      window.queueMicrotask(() => {
        if (
          effectGeneration.current !== generation ||
          scheduledRefresh.current?.commit !== latestCommit
        ) {
          return
        }
        window.clearTimeout(scheduledRefresh.current.timer)
        scheduledRefresh.current = undefined
        writePendingRefresh(null)
      })
    }

    if (scheduledRefresh.current?.commit === latestCommit) return cleanupScheduledRefresh
    if (scheduledRefresh.current) {
      window.clearTimeout(scheduledRefresh.current.timer)
      scheduledRefresh.current = undefined
      writePendingRefresh(null)
    }

    const action = getRefreshAction(latestCommit, __BUILD_COMMIT__, readPendingRefresh())
    if (action === 'none') {
      writePendingRefresh(null)
      return
    }

    if (action === 'already-attempted') {
      toast.updateRefreshFailed()
      return
    }

    if (!writePendingRefresh(latestCommit)) {
      toast.updateRefreshFailed()
      return
    }
    toast.updateRefreshing()
    const timer = window.setTimeout(() => {
      scheduledRefresh.current = undefined
      reloadCurrentPage()
    }, REFRESH_DELAY_MS)
    scheduledRefresh.current = { commit: latestCommit, timer }
    return cleanupScheduledRefresh
  }, [latestCommit])

  return null
}
