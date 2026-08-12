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
import { getSessionForActiveWorkspace, applySessionToStore } from '@/lib/auth/refresh-session'
import { toLoginWithRedirect } from '@/lib/redirect'
import { getPreferences } from '@/services/preferences'
import { saveTimeZone } from '@/lib/timezone'
import { PERMS } from '@/config/permissions'
import ForbiddenPage from '@/pages/forbidden'
import type { SessionResult } from '@/types'

// 模块级闸：防止 StrictMode 双挂载 / 并发触发重复拉 session
let isFetchingSession = false
const PREVIEW_AUTH_KEY = 'mg:dev_preview_auth'

function shouldUsePreviewAuth(): boolean {
  if (!import.meta.env.DEV) return false
  const params = new URLSearchParams(window.location.search)
  if (params.get('previewAuth') === '0') {
    sessionStorage.removeItem(PREVIEW_AUTH_KEY)
    return false
  }
  if (params.get('previewAuth') === '1') {
    sessionStorage.setItem(PREVIEW_AUTH_KEY, '1')
    return true
  }
  return sessionStorage.getItem(PREVIEW_AUTH_KEY) === '1'
}

function applyPreviewAuth(): void {
  useAuthStore.getState().setAuth(
    {
      account_id: 'preview-account',
      display_name: '18758183837',
      email: 'preview@modelgo.local',
      phone: '18758183837',
      avatar_url: null,
    },
    'preview-tenant',
    [{
      tenant_id: 'preview-tenant',
      name: '18758183837',
      slug: 'preview',
      type: 'enterprise',
      is_default: true,
      logo_url: null,
    }],
    'preview-workspace',
    Object.values(PERMS),
    [],
  )
}

/**
 * 显示时区回灌（qa#249）：`mg:timezone` 只在「设置→偏好设置」页写入 localStorage，
 * 新浏览器/清缓存后该 key 不存在，全站按用户显示时区解释时间的地方会静默回落到浏览器时区，
 * 与账号在服务端保存的偏好不一致。会话建立后立即拉一次偏好把服务端值种回本地，不必等用户访问设置页。
 * 失败静默（不阻断登录），localStorage 仍保留上次成功值兜底。
 */
function hydrateTimeZone(accountId: string): void {
  getPreferences()
    .then((prefs) => {
      if (prefs.ui.timezone) saveTimeZone(prefs.ui.timezone, accountId)
    })
    .catch(() => { /* 静默：不阻断登录，本地缓存/浏览器时区兜底 */ })
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const setLoading = useAuthStore((s) => s.setLoading)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    if (isAuthenticated || isFetchingSession) return
    if (shouldUsePreviewAuth()) {
      applyPreviewAuth()
      return
    }
    isFetchingSession = true
    // 首拉即按持久化的活跃空间解析权限（非默认空间不带 id 会少 tab/按钮，需求方#255）。
    getSessionForActiveWorkspace()
      // 落 store 逻辑与权限热刷新共用（lib/auth/refresh-session）：
      // 工作区恢复 localStorage 优先、account 全字段直传（phone 等守卫依赖）。
      .then((result: SessionResult) => {
        applySessionToStore(result)
        hydrateTimeZone(result.account.account_id)
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
