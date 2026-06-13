/* eslint-disable react-refresh/only-export-components */
/**
 * 中央鉴权（React 侧）。
 * - AuthProvider：挂载时拉一次 /auth/session 填充 store（并入原 SessionLoader）。
 * - useAuth：读鉴权状态 + 提供 signOut。
 * - RequireAuth：受保护路由门禁（并入原 ProtectedRoute）。
 * 状态 SSOT 仍在 store/auth.ts；会话过期的非 React 策略在 lib/auth/auth-controller.ts。
 */
import { useEffect, useCallback, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { getSession, logout } from '@/services/auth'
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
        setAuth(
          {
            account_id: result.account.account_id,
            display_name: result.account.display_name,
            email: result.account.email,
            avatar_url: result.account.avatar_url,
          },
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

/** 读鉴权状态 + 登出。登出：调后端 logout（失败也继续）→ 清态 → SPA 跳登录 */
export function useAuth() {
  const navigate = useNavigate()
  const account = useAuthStore((s) => s.account)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const hasPermission = useAuthStore((s) => s.hasPermission)

  const signOut = useCallback(async () => {
    try {
      await logout()
    } catch {
      // 后端 logout 失败也继续清前端态
    }
    clearAuth()
    navigate('/login', { replace: true })
  }, [clearAuth, navigate])

  return { account, isAuthenticated, isLoading, activeTenantId, hasPermission, signOut }
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
