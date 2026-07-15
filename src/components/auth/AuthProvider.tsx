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
import { applySessionToStore } from '@/lib/auth/refresh-session'
import { toLoginWithRedirect } from '@/lib/redirect'
import ForbiddenPage from '@/pages/forbidden'

// 模块级闸：防止 StrictMode 双挂载 / 并发触发重复拉 session
let isFetchingSession = false

export function AuthProvider({ children }: { children: ReactNode }) {
  const setLoading = useAuthStore((s) => s.setLoading)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    if (isAuthenticated || isFetchingSession) return
    isFetchingSession = true
    getSession()
      // 落 store 逻辑与权限热刷新共用（lib/auth/refresh-session）：
      // 工作区恢复 localStorage 优先、account 全字段直传（phone 等守卫依赖）。
      .then(applySessionToStore)
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
