import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Providers } from '@/components/providers'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import DashboardPage from '@/pages/dashboard'
import ApiKeysPage from '@/pages/api-keys'
import WorkspacesPage from '@/pages/workspaces'
import WorkspaceDetailPage from '@/pages/settings/workspace-detail'
import LoginPage from '@/pages/login'
import SignupPage from '@/pages/signup'
import ForgotPasswordPage from '@/pages/forgot-password'
import ResetPasswordPage from '@/pages/reset-password'
import AuthCallbackPage from '@/pages/auth-callback'
import InvitationsPage from '@/pages/invitations'
import DevicePage from '@/pages/device'
import UsagePage from '@/pages/usage'
import LogsPage from '@/pages/logs'
import BillingPage from '@/pages/billing'
import ReferralPage from '@/pages/referral'
import AccountSettingsPage from '@/pages/settings/account'
import OrganizationPage from '@/pages/settings/organization'
import GuardrailsPage from '@/pages/guardrails'
import ObservabilityPage from '@/pages/observability'
import ModelsPage from '@/pages/models'
import ModelsCatalogPage from '@/pages/models/catalog'
import ModelsComparePage from '@/pages/models-compare'
import PlatformConfigPage from '@/pages/platform-config'
import ForbiddenPage from '@/pages/forbidden'
import { useAuthStore } from '@/store/auth'
import { useDevStore } from '@/store/use-dev-store'
import { getSession } from '@/services/auth'
import { storageKeys } from '@/lib/storage'
import { getMarket, type Market } from '@/lib/market'
import { applyBrandTheme, applyTheme, getSavedBrandTheme, getSavedTheme } from '@/lib/theme'
import { getPlatformConfig } from '@/services/platform'
import { useLangStore } from '@/store/use-brand-store'
import { toLoginWithRedirect } from '@/lib/redirect'
import { DevRequirements } from '@/components/dev-requirements'
import { DevToolbar } from '@/components/dev-toolbar'

import { Toaster } from 'sonner'

// 注入市场标识（初始值用域名探测，PlatformLoader 会用 API 结果覆盖）
document.documentElement.dataset.market = getMarket()

/** 将 API 返回的 site 字段映射为 Market 枚举 */
function siteToMarket(site: string): Market {
  return site === 'international' ? 'global' : 'domestic'
}

function applyMarket(market: Market) {
  document.documentElement.dataset.market = market
  useLangStore.getState().setMarket(market)
}

/**
 * 平台配置加载器 — stale-while-revalidate
 * 1. 读 localStorage 缓存 → 立刻应用（无闪烁）
 * 2. 若无缓存 → 等 API 返回后才渲染子树（onReady 回调）
 * 3. 后台静默刷新缓存，下次加载零等待
 */
function PlatformLoader({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    const cached = localStorage.getItem(storageKeys.platformSite())
    if (cached) {
      applyMarket(siteToMarket(cached))
      onReady()
    }

    getPlatformConfig()
      .then((config) => {
        if (!config?.site) return
        localStorage.setItem(storageKeys.platformSite(), config.site)
        applyMarket(siteToMarket(config.site))
      })
      .catch(() => {/* 静默失败，保持缓存/域名探测结果 */})
      .finally(() => {
        // 无缓存时，fetch 完成后才解锁渲染
        if (!cached) onReady()
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

let isFetchingSession = false

function SessionLoader() {
  const setAuth = useAuthStore((s) => s.setAuth)
  const setLoading = useAuthStore((s) => s.setLoading)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  useEffect(() => {
    if (isAuthenticated || isFetchingSession) return
    isFetchingSession = true
    getSession()
      .then((result) => {
        // 刷新时优先恢复用户上次选择的工作区（持久化于 localStorage），
        // 仅当本地无记录时才回退到会话下发的默认工作区，避免刷新后回到默认工作区。
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
          result.permissions?.menus ?? []
        )
      })
      .catch(() => {
        setLoading(false)
      })
      .finally(() => {
        isFetchingSession = false
      })
  }, [])

  return null
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)
  const activeTenantId = useAuthStore((s) => s.activeTenantId)

  if (isLoading) return null
  if (!isAuthenticated) return <Navigate to={toLoginWithRedirect()} replace />
  // 已登录但无组织 = 有身份、无授权 → 403，而非回跳登录（回跳会造成守卫互弹）
  if (!activeTenantId) return <ForbiddenPage />
  return <>{children}</>
}

export default function App() {
  const [platformReady, setPlatformReady] = useState(false)

  useEffect(() => {
    applyTheme(getSavedTheme())
    applyBrandTheme(getSavedBrandTheme())
  }, [])

  const showRequirements = useDevStore((s) => s.showRequirements)

  return (
    <Providers>
      <Toaster richColors position="top-right" closeButton />
      <BrowserRouter>
        <PlatformLoader onReady={() => setPlatformReady(true)} />
        {!platformReady && (
          <div style={{
            position: 'fixed', inset: 0,
            background: 'var(--site-bg, #f8fafc)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999,
          }}>
            <div style={{
              width: 28, height: 28,
              border: '2.5px solid var(--mg-border, rgba(15,23,42,0.08))',
              borderTopColor: 'var(--brand-base, #1DC39B)',
              borderRadius: '50%',
              animation: 'spin 0.7s linear infinite',
            }} />
          </div>
        )}
        <SessionLoader />
        {import.meta.env.DEV && showRequirements && <DevRequirements />}
        {import.meta.env.DEV && <DevToolbar />}
        <Routes>
          {/* 认证路由（公开） */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/invitations" element={<InvitationsPage />} />
          <Route path="/invitations/:token" element={<InvitationsPage />} />
          <Route path="/device" element={<DevicePage />} />

          {/* 控制台路由（需登录） */}
          <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
            <Route index element={<Navigate to="/dashboard" replace />} />

            {/* Tenant 级 */}
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="models">
              <Route index element={<Navigate to="catalog" replace />} />
              <Route path="catalog" element={<ModelsCatalogPage />} />
              <Route path="playground" element={<ModelsPage />} />
              <Route path="compare" element={<ModelsComparePage />} />
            </Route>
            <Route path="usage" element={<UsagePage />} />
            <Route path="logs" element={<LogsPage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="referral" element={<ReferralPage />} />
            <Route path="platform-config" element={<PlatformConfigPage />} />

            <Route path="settings">
              <Route index element={<Navigate to="workspace" replace />} />
              <Route path="workspace" element={<WorkspacesPage />} />
              <Route path="workspace/:workspaceId" element={<WorkspaceDetailPage />} />
              <Route path="account" element={<AccountSettingsPage />} />
              <Route path="organization" element={<OrganizationPage />} />
            </Route>

            {/* 工作区级（URL 携带 workspaceId） */}
            <Route path="workspace/:workspaceId">
              <Route path="api-keys" element={<ApiKeysPage />} />
              <Route path="guardrails" element={<GuardrailsPage />} />
              <Route path="observability" element={<ObservabilityPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </Providers>
  )
}
