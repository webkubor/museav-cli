/**
 * useAuth：读鉴权状态 + 登出。
 *
 * 单独成文件（与 AuthProvider/RequireAuth 同属中央鉴权）：
 * - 断循环依赖——裸路由页面（如 forbidden）要用 useAuth，而 AuthProvider.tsx 又 import ForbiddenPage，
 *   同文件会形成 forbidden ↔ AuthProvider 循环；拆出后 use-auth 不依赖任何页面。
 * - 让 AuthProvider.tsx 保持纯组件导出，无需 react-refresh/only-export-components disable。
 *
 * 登出：调后端 logout（失败也继续）→ 清态 → SPA 跳登录（不用 window.location，防 /login↔/dashboard 无限刷新）。
 */
import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/store/auth'
import { logout } from '@/services/auth'

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
