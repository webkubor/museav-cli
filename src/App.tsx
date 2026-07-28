import { useEffect, useState, lazy, Suspense, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Providers } from '@/components/providers'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { PublicShell } from '@/components/layout/PublicShell'
import { AuthProvider, RequireAuth } from '@/components/auth/AuthProvider'
import { RequirePermission } from '@/components/auth/RequirePermission'
import { RequireEnterpriseTenant } from '@/components/auth/RequireEnterpriseTenant'
import { CONSOLE_ROUTES, type ConsoleRouteMeta } from '@/config/console-routes'

// 页面路由懒加载：各页面拆为独立 chunk，按需加载，缩小首屏体积
const DashboardPage = lazy(() => import('@/pages/dashboard'))
const ApiKeysPage = lazy(() => import('@/pages/api-keys'))
const WorkspacesPage = lazy(() => import('@/pages/workspaces'))
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
const ModelDetailPage = lazy(() => import('@/pages/models/detail'))
const ModelsComparePage = lazy(() => import('@/pages/models-compare'))
// DEV 专属页面必须放在可静态消除的条件分支内，确保生产构建既不生成对应 chunk，
// 也不注册路由——否则 /dev-config 在生产环境仍可被直接访问到。
const PlatformConfigPage = import.meta.env.DEV
  ? lazy(() => import('@/pages/platform-config'))
  : null
const NotFoundPage = lazy(() => import('@/pages/not-found'))

// 菜单驱动页面：key → 页面元素（路由/scope/权限见 config/console-routes 单一真源）
const CONSOLE_ELEMENTS: Record<string, ReactNode> = {
  dashboard: <DashboardPage />,
  organization: <OrganizationPage />,
  workspaces: <WorkspacesPage />,
  billing: <BillingPage />,
  usage: <UsagePage />,
  logs: <LogsPage />,
  referral: <ReferralPage />,
  'api-keys': <ApiKeysPage />,
  guardrails: <GuardrailsPage />,
  observability: <ObservabilityPage />,
}

/** 按清单渲染一条菜单页路由：有 view 权限则套 RequirePermission 守卫，否则仅需登录；
    enterpriseOnly 页再叠租户类型守卫（个人租户 403，与菜单隐藏同源） */
function consoleRoute(meta: ConsoleRouteMeta) {
  let element = meta.permission ? (
    <RequirePermission perm={meta.permission}>{CONSOLE_ELEMENTS[meta.key]}</RequirePermission>
  ) : (
    CONSOLE_ELEMENTS[meta.key]
  )
  if (meta.enterpriseOnly) element = <RequireEnterpriseTenant>{element}</RequireEnterpriseTenant>
  return <Route key={meta.key} path={meta.path} element={element} />
}
import { storageKeys } from '@/lib/storage'
import { getMarket, type Market } from '@/lib/market'
import { marketLockedByDomain } from '@/lib/market-domain'
import { applyBrandTheme, applyTheme, getSavedBrandTheme, getSavedTheme, readThemeFromUrl, saveTheme } from '@/lib/theme'
import { getPlatformConfig } from '@/services/platform'
import { useLangStore } from '@/store/use-brand-store'
import { NavLogger } from '@/components/dev/NavLogger'
import { DevToolbar } from '@/components/dev-toolbar'
import { ServerErrorDialog } from '@/components/server-error/ServerErrorDialog'
import { AppUpdatePrompt } from '@/components/app-update/AppUpdatePrompt'
import { PwaInstallPrompt } from '@/components/app-update/PwaInstallPrompt'

import { Toaster } from 'sonner'

// 注入市场标识（初始值用域名探测，PlatformLoader 会用 API 结果覆盖）
document.documentElement.dataset.market = getMarket()

/**
 * site 即 Market——市场词汇已与后端 platform-config 对齐（'china' | 'global'），
 * 转换层消失。仅一次性归一历史遗留值（旧后端/旧 localStorage 缓存的 'international'）。
 */
function normalizeSite(site: string): Market {
  return site === 'international' || site === 'global' ? 'global' : 'china'
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
    // 生产域名前置锁定（注册入口/主题色/logo 域名一到手就定,秒渲染）：
    // .ai=global、.com=china,platform-config 的 site 不得覆盖（后端配置错不能翻品牌,qa#480）。
    // test 单域名/localhost 不锁,保持 platform-config 驱动可切两端（#466）。
    const locked = marketLockedByDomain(window.location.hostname)
    if (locked) {
      applyMarket(locked)
      onReady()
    }

    const cached = localStorage.getItem(storageKeys.platformSite())
    if (!locked && cached) {
      applyMarket(normalizeSite(cached))
      onReady()
    }

    // 用 fetchQuery 而非裸 fetch：让 React Query 追踪这个飞行中的请求，
    // DashboardLayout 的 usePlatformConfig() 进来时会复用同一个请求，不再重发。
    qc.fetchQuery({ queryKey: ['platform-config'], queryFn: getPlatformConfig, staleTime: Infinity })
      .then((config) => {
        if (!config?.site) return
        localStorage.setItem(storageKeys.platformSite(), config.site)
        if (!locked) applyMarket(normalizeSite(config.site))
      })
      .catch(() => {/* 静默失败，保持缓存/域名探测结果 */})
      .finally(() => {
        // 锁定域名已提前 onReady；非锁定且无缓存时,fetch 完成后才解锁渲染
        if (!locked && !cached) onReady()
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
      <AppUpdatePrompt />
      <PwaInstallPrompt />
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
          {/* /register 无此路由——历史外链/书签（如国内官网旧 CTA）重定向到 /signup 防呆。
              指 /signup 而非 /login：/signup 已市场自适应（国内自动转 /login，国际是注册页），两端都对。 */}
          <Route path="/register" element={<Navigate to="/signup" replace />} />
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
            <Route path=":modelId" element={<ModelDetailPage />} />
          </Route>

          {/* 控制台路由（需登录） */}
          <Route path="/" element={<RequireAuth><DashboardLayout /></RequireAuth>}>
            <Route index element={<Navigate to="/dashboard" replace />} />

            {/* 租户级菜单页：由 config/console-routes 单一真源驱动 + 逐路由权限守卫 */}
            {CONSOLE_ROUTES.filter((r) => r.scope === 'tenant').map(consoleRoute)}

            {/* /models 公开广场已在登录组外；此处仅登录态子页 */}
            <Route path="models">
              <Route path="playground" element={<ModelsPage />} />
              <Route path="compare" element={<ModelsComparePage />} />
            </Route>
            {/* 任务历史已并入调用日志（#361）：旧路由重定向到「异步任务」记录类型 */}
            <Route path="tasks" element={<Navigate to="/logs?record_type=async" replace />} />

            {/* 开发者菜单（DEV 调试页）——挂在后台壳内（带侧栏/头部），不再独立整页。
                编译期 DEV 专属：生产构建时页面 import 与整条路由均被静态消除。 */}
            {PlatformConfigPage && <Route path="dev-config" element={<PlatformConfigPage />} />}

            {/* 企业管理/空间管理是主入口顶层页（nav.ts main 组），不是「设置」子页——
                路径保持扁平（/organization、/workspaces），与 usage/logs/billing 同级。
                历史上二者曾是 Settings 下的 tab，迁移后路径一直挂在 /settings/* 下，
                导致面包屑误显示「设置」、URL 与信息架构不一致（用户实测发现，见 fix/nav-route-naming）。 */}
            {/* 仅「账号设置」真正属于 Settings（底部固定入口） */}
            <Route path="settings">
              <Route index element={<Navigate to="account" replace />} />
              <Route path="account" element={<AccountSettingsPage />} />
              {/* 旧路径向后兼容：v1.0.1 已发布过 /settings/organization、/settings/workspace，
                  可能被收藏/分享，重定向到新扁平路径，不能直接删。 */}
              <Route path="organization" element={<Navigate to="/organization" replace />} />
              <Route path="workspace" element={<Navigate to="/workspaces" replace />} />
            </Route>

            {/* 工作区级菜单页（URL 携带 workspaceId）：同一清单驱动 + 权限守卫 */}
            <Route path="workspace/:workspaceId">
              {CONSOLE_ROUTES.filter((r) => r.scope === 'workspace').map(consoleRoute)}
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
