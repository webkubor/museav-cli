import { useEffect, useState, lazy, Suspense } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Providers } from '@/components/providers'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { PublicShell } from '@/components/layout/PublicShell'
import { AuthProvider, RequireAuth } from '@/components/auth/AuthProvider'

// 页面路由懒加载：各页面拆为独立 chunk，按需加载，缩小首屏体积
const DashboardPage = lazy(() => import('@/pages/dashboard'))
const ApiKeysPage = lazy(() => import('@/pages/api-keys'))
const WorkspacesPage = lazy(() => import('@/pages/workspaces'))
const WorkspaceDetailPage = lazy(() => import('@/pages/settings/workspace-detail'))
const LoginPage = lazy(() => import('@/pages/login'))
const SignupPage = lazy(() => import('@/pages/signup'))
const LegalPage = lazy(() => import('@/pages/legal'))
const ForgotPasswordPage = lazy(() => import('@/pages/forgot-password'))
const ResetPasswordPage = lazy(() => import('@/pages/reset-password'))
const AuthCallbackPage = lazy(() => import('@/pages/auth-callback'))
const InvitationsPage = lazy(() => import('@/pages/invitations'))
const DevicePage = lazy(() => import('@/pages/device'))
const UsagePage = lazy(() => import('@/pages/usage'))
const LogsPage = lazy(() => import('@/pages/logs'))
const BillingPage = lazy(() => import('@/pages/billing'))
const WechatCashierPage = lazy(() => import('@/pages/billing/WechatCashierPage'))
const ReferralPage = lazy(() => import('@/pages/referral'))
const AccountSettingsPage = lazy(() => import('@/pages/settings/account'))
const OrganizationPage = lazy(() => import('@/pages/settings/organization'))
const GuardrailsPage = lazy(() => import('@/pages/guardrails'))
const ObservabilityPage = lazy(() => import('@/pages/observability'))
const ModelsPage = lazy(() => import('@/pages/models'))
const ModelsCatalogPage = lazy(() => import('@/pages/models/catalog'))
const ModelsComparePage = lazy(() => import('@/pages/models-compare'))
const PlatformConfigPage = lazy(() => import('@/pages/platform-config'))
const TasksPage = lazy(() => import('@/pages/tasks'))
const NotFoundPage = lazy(() => import('@/pages/not-found'))
import { storageKeys } from '@/lib/storage'
import { getMarket, type Market } from '@/lib/market'
import { applyBrandTheme, applyTheme, getSavedBrandTheme, getSavedTheme, readThemeFromUrl, saveTheme } from '@/lib/theme'
import { getPlatformConfig } from '@/services/platform'
import { useLangStore } from '@/store/use-brand-store'
import { NavLogger } from '@/components/dev/NavLogger'
import { DevToolbar } from '@/components/dev-toolbar'
import { ServerErrorDialog } from '@/components/server-error/ServerErrorDialog'

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
  const qc = useQueryClient()
  useEffect(() => {
    const cached = localStorage.getItem(storageKeys.platformSite())
    if (cached) {
      applyMarket(siteToMarket(cached))
      onReady()
    }

    // 用 fetchQuery 而非裸 fetch：让 React Query 追踪这个飞行中的请求，
    // DashboardLayout 的 usePlatformConfig() 进来时会复用同一个请求，不再重发。
    qc.fetchQuery({ queryKey: ['platform-config'], queryFn: getPlatformConfig, staleTime: Infinity })
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


/** 懒加载页面 chunk 加载中的占位（居中 spinner，复用平台加载样式） */
function RouteFallback() {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 28, height: 28,
        border: '2.5px solid var(--mg-border, rgba(15,23,42,0.08))',
        borderTopColor: 'var(--brand-base, #1DC39B)',
        borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }} />
    </div>
  )
}


export default function App() {
  const [platformReady, setPlatformReady] = useState(false)

  useEffect(() => {
    // 从文档站跳转过来时 URL 带 ?theme=dark|light：优先采用并持久化，实现跨站主题同步。
    // 账号就绪后 DashboardHeader 会回写到用户偏好 key（见 mg:theme_from_url），避免被 getUserTheme 覆盖。
    const fromUrl = readThemeFromUrl()
    if (fromUrl) {
      saveTheme(fromUrl)
      sessionStorage.setItem('mg:theme_from_url', fromUrl)
      applyTheme(fromUrl)
      // 清掉 query，避免刷新/收藏时残留
      const url = new URL(window.location.href)
      url.searchParams.delete('theme')
      window.history.replaceState({}, '', url)
    } else {
      applyTheme(getSavedTheme())
    }
    applyBrandTheme(getSavedBrandTheme())
  }, [])

  return (
    <Providers>
      <Toaster richColors position="top-right" closeButton />
      <ServerErrorDialog />
      <BrowserRouter>
        {import.meta.env.DEV && <NavLogger />}
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
        {import.meta.env.DEV && <DevToolbar />}
        <AuthProvider>
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* 认证路由（公开） */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/legal/privacy" element={<LegalPage docType="privacy" />} />
          <Route path="/legal/terms" element={<LegalPage docType="terms" />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/invitations" element={<InvitationsPage />} />
          <Route path="/invitations/:token" element={<InvitationsPage />} />
          <Route path="/device" element={<DevicePage />} />
          <Route path="/billing/wechat-cashier" element={<WechatCashierPage />} />

          {/* 模型广场（公开，免登录，双主题）— 与官网同路径 /models，官网「模型」直接跳此 */}
          <Route path="/models" element={<PublicShell />}>
            <Route index element={<ModelsCatalogPage />} />
          </Route>

          {/* 控制台路由（需登录） */}
          <Route path="/" element={<RequireAuth><DashboardLayout /></RequireAuth>}>
            <Route index element={<Navigate to="/dashboard" replace />} />

            {/* Tenant 级 */}
            <Route path="dashboard" element={<DashboardPage />} />
            {/* /models 公开广场已在登录组外；此处仅登录态子页 */}
            <Route path="models">
              <Route path="playground" element={<ModelsPage />} />
              <Route path="compare" element={<ModelsComparePage />} />
            </Route>
            <Route path="usage" element={<UsagePage />} />
            <Route path="logs" element={<LogsPage />} />
            <Route path="tasks" element={<TasksPage />} />
            <Route path="billing" element={<BillingPage />} />
            <Route path="referral" element={<ReferralPage />} />
            <Route path="dev-config" element={<PlatformConfigPage />} />

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

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </Providers>
  )
}
