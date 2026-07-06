/**
 * 中央鉴权（React 侧）。
 * - AuthProvider：挂载时拉一次 /auth/session 填充 store（并入原 SessionLoader）。
 * - RequireAuth：受保护路由门禁（并入原 ProtectedRoute）。
 * useAuth（读状态 + signOut）在同目录 use-auth.ts；状态 SSOT 在 store/auth.ts；
 * 会话过期的非 React 策略在 lib/auth/auth-controller.ts。
 */
import { useEffect, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { getSession } from '@/services/auth'
import { storageKeys } from '@/lib/storage'
import { toLoginWithRedirect } from '@/lib/redirect'
import ForbiddenPage from '@/pages/forbidden'

// 模块级闸：防止 StrictMode 双挂载 / 并发触发重复拉 session
let isFetchingSession = false

export function AuthProvider({ children }: { children: ReactNode }) {
  const setAuth = useAuthStore((s) => s.setAuth)
  const setLoading = useAuthStore((s) => s.setLoading)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    if (isAuthenticated || isFetchingSession) return
    isFetchingSession = true
    getSession()
      .then((result) => {
        // 刷新时优先恢复用户上次选择的工作区（localStorage），无记录才回退会话默认
        const persistedWs = localStorage.getItem(storageKeys.activeWorkspaceId())
        // account 直传：保留后端下发的全部字段（尤其 phone，强制绑手机守卫依赖它）。
        // 曾在此处只挑 4 个字段重建 account，把 phone 丢了，导致刷新/切组织后守卫误判无手机号。
        setAuth(
          result.account,
          result.active_tenant_id,
          result.tenants,
          persistedWs || result.active_workspace_id,
          result.permissions?.granted ?? null,
          result.permissions?.menus ?? [],
        )
      })
      .catch(() => setLoading(false))
      .finally(() => { isFetchingSession = false })
    // 仅挂载执行一次：会话引导是一次性副作用，依赖项故意留空
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <>{children}</>
}

/** 受保护路由门禁：加载中占位 → 未登录跳登录 → 有身份无组织 403 → 放行 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)
  const activeTenantId = useAuthStore((s) => s.activeTenantId)

  if (isLoading) return null
  if (!isAuthenticated) return <Navigate to={toLoginWithRedirect()} replace />
  if (!activeTenantId) return <ForbiddenPage />
  return <>{children}</>
}
