/**
 * `/api-keys` 中转页 —— 把「不带工作空间的 API Keys 入口」解析到默认工作空间。
 *
 * 为什么需要它：API Keys 是**工作区级**页面（config/console-routes 里 scope
 * 'workspace'），真实路由是 `/workspace/:workspaceId/api-keys`。但好几个入口
 * （模型详情页「获取 API Key」、模型体验的 API 弹窗、未登录时 `redirect=` 回跳）
 * 手上都没有 workspaceId，此前直接跳 `/api-keys` —— 那个路径没有注册，落到
 * NotFoundPage。
 *
 * 解析顺序：
 *   1. authStore.activeWorkspaceId（会话里的当前空间，登录时由 session 的
 *      active_workspace_id / localStorage 持久值回填）
 *   2. GET /workspaces 里 is_default 的那个（后端标记的默认空间）
 *   3. 列表第一个（租户至少有一个空间，但不假设一定有 is_default 标记）
 *   4. 一个都没有 → 去空间管理页，让用户自己建/选，而不是把人丢进 404
 */
import { useEffect } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import { listWorkspaces } from '@/services/workspaces'

export default function ApiKeysRedirectPage() {
  const navigate = useNavigate()
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const activeTenantId = useAuthStore((s) => s.activeTenantId)

  // 已有当前空间就不必请求列表（绝大多数情况走这条）
  const shouldResolve = !activeWorkspaceId
  const { data, isLoading, isError } = useQuery({
    queryKey: ['workspaces', activeTenantId],
    queryFn: () => listWorkspaces().then((res) => res.items ?? []),
    enabled: shouldResolve,
    staleTime: 60_000,
  })

  const resolved = activeWorkspaceId
    || data?.find((w) => w.is_default)?.workspace_id
    || data?.[0]?.workspace_id
    || null

  // 拉不到任何空间：交给空间管理页（含空态引导），不留在这个中转页上
  useEffect(() => {
    if (!shouldResolve || isLoading) return
    if (!resolved) navigate('/workspaces', { replace: true })
  }, [shouldResolve, isLoading, resolved, navigate])

  if (resolved) return <Navigate to={`/workspace/${resolved}/api-keys`} replace />
  if (isError) return <Navigate to="/workspaces" replace />
  // 解析中：只有「会话里没有当前空间」时才会走到这里，且只等一次 /workspaces。
  // 骨架块沿用列表页在建的占位写法，不放整页 spinner（避免壳内闪一下白屏）。
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="mg-tile h-[96px] animate-pulse" />
      ))}
    </div>
  )
}
