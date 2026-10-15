import { useEffect, useState, lazy, Suspense, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, useSearchParams } from 'react-router-dom'
import { Providers } from '@/components/providers'
import { VersionUpdateNotice } from '@/components/VersionUpdateNotice'
import { useActiveTheme } from '@/hooks/use-active-theme'
import { DashboardLayout } from '@/components/layout/DashboardLayout'
import { OfficialModelsRedirect } from '@/pages/models/OfficialModelsRedirect'
import { AuthProvider, RequireAuth } from '@/components/auth/AuthProvider'
import { RequirePermission } from '@/components/auth/RequirePermission'
import { RequireEnterpriseTenant } from '@/components/auth/RequireEnterpriseTenant'
import { RequireWorkspace } from '@/components/auth/RequireWorkspace'
import { LocaleNamespaces } from '@/components/i18n/LocaleNamespaces'
import { CONSOLE_ROUTES, type ConsoleRouteMeta } from '@/config/console-routes'
import { useAuthStore } from '@/store/auth'
import { resolveReferralCode } from '@/pages/signup/referral-code'
import type { LocaleNamespace } from '@/i18n'

// 页面路由懒加载：各页面拆为独立 chunk，按需加载，缩小首屏体积
/** 重定向并透传当前 query：推荐链接的 ?aff= 等参数不能在路由跳转中丢失（需求方#714）。 */
function RedirectPreservingSearch({ to }: { to: string }) {
  const location = useLocation()
  return <Navigate to={{ pathname: to, search: location.search }} replace />
}

/**
 * 根路径落点：登录了进控制台，没登录去公开的模型广场——不再把访客弹到登录页。
 * 1.0.6 起模型广场是对外挂出去的公开页，访客访问站点根地址应该直接看到模型，
 * 登录留给顶栏按钮，而不是进门先拦一道。广场拆到官网后（prd#1272）落点不变，
 * 仍走 /models，由那条路由按市场转去官网广场（query 一路带着）。
 *
 * 推荐码在这里先落一次 session：原先 /?aff=X 会被 RequireAuth 折成
 * /login?redirect=%2F%3Faff%3DX，由登录页从 redirect 内嵌 query 里解出来；现在不经过
 * 登录页了，广场页也不解析推荐码，不在这一跳存住就 100% 丢码（qa#675 同源）。
 */
function RootEntry() {
  const [searchParams] = useSearchParams()
  const location = useLocation()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isLoading = useAuthStore((s) => s.isLoading)

  resolveReferralCode(searchParams)

  // 会话还在拉：先不跳，否则已登录用户会闪一下广场再弹回控制台
  if (isLoading) return null
  if (isAuthenticated) return <Navigate to="/dashboard" replace />
  return <Navigate to={{ pathname: '/models', search: location.search }} replace />
}

const DashboardPage = lazy(() => import('@/pages/dashboard'))
const ApiKeysPage = lazy(() => import('@/pages/api-keys'))
// `/api-keys`（不带 workspaceId）的中转：解析默认工作空间后重定向到真实路由
const ApiKeysRedirectPage = lazy(() => import('@/pages/api-keys/redirect'))
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
const ModelsPage = lazy(() => import('@/pages/models'))
const ModelsComparePage = lazy(() => import('@/pages/models-compare'))
// DEV 专属页面/工具必须放在可静态消除的条件分支内，确保生产构建既不生成对应 chunk，
// 也不注册路由——否则 /dev-config 在生产环境仍可被直接访问到。
const PlatformConfigPage = import.meta.env.DEV
  ? lazy(() => import('@/pages/platform-config'))
  : null
const NavLogger = import.meta.env.DEV
  ? lazy(() => import('@/components/dev/NavLogger').then((m) => ({ default: m.NavLogger })))
  : null
const NotFoundPage = lazy(() => import('@/pages/not-found'))

const DASHBOARD_NAMESPACES = ['dashboard', 'dashboardTop', 'billing', 'logs'] satisfies LocaleNamespace[]
const MODEL_NAMESPACES = ['models', 'modelsCatalog', 'modelsCompare', 'modelsExperience', 'modelsChat', 'modelsHistory', 'apiKeys'] satisfies LocaleNamespace[]

const CONSOLE_NAMESPACES: Record<string, readonly LocaleNamespace[]> = {
  dashboard: DASHBOARD_NAMESPACES,
  organization: ['enterprise', 'workspaces'],
  workspaces: ['workspaces', 'enterprise', 'observability', 'logs'],
  billing: ['billing'],
  usage: ['usage', 'dashboard'],
  logs: ['logs', 'tasks'],
  referral: ['billing'],
  'api-keys': ['apiKeys', 'guardrails', 'models', 'modelsCatalog'],
  guardrails: ['guardrails'],
}

function withLocaleNamespaces(element: ReactNode, namespaces: readonly LocaleNamespace[]) {
  return (
    <LocaleNamespaces namespaces={namespaces} fallback={<RouteFallback />}>
      {element}
    </LocaleNamespaces>
  )
}

// 菜单驱动页面：key → 页面元素（路由/scope/权限见 config/console-routes 单一真源）
const CONSOLE_ELEMENTS: Record<string, ReactNode> = {
  dashboard: withLocaleNamespaces(<DashboardPage />, CONSOLE_NAMESPACES.dashboard),
  organization: withLocaleNamespaces(<OrganizationPage />, CONSOLE_NAMESPACES.organization),
  workspaces: withLocaleNamespaces(<WorkspacesPage />, CONSOLE_NAMESPACES.workspaces),
  billing: withLocaleNamespaces(<BillingPage />, CONSOLE_NAMESPACES.billing),
  usage: withLocaleNamespaces(<UsagePage />, CONSOLE_NAMESPACES.usage),
  logs: withLocaleNamespaces(<LogsPage />, CONSOLE_NAMESPACES.logs),
  referral: withLocaleNamespaces(<ReferralPage />, CONSOLE_NAMESPACES.referral),
  'api-keys': withLocaleNamespaces(<ApiKeysPage />, CONSOLE_NAMESPACES['api-keys']),
  guardrails: withLocaleNamespaces(<GuardrailsPage />, CONSOLE_NAMESPACES.guardrails),
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
import { getMarket, getMarketQueryOverride, marketFromSite, type Market } from '@/lib/market'
import { marketLockedByDomain } from '@/lib/market-domain'
import { applyBrandTheme, applyTheme, getSavedBrandTheme, getSavedTheme, readThemeFromUrl, saveTheme } from '@/lib/theme'
import { getPlatformConfig } from '@/services/platform'
import { useLangStore } from '@/store/use-brand-store'
import { usePublicProtocolsStore } from '@/store/use-public-protocols-store'

import { Toaster } from 'sonner'
import { CustomerService } from '@/components/customer-service'

// 注入市场标识（初始值用域名探测，PlatformLoader 会用 API 结果覆盖）
document.documentElement.dataset.market = getMarket()

/**
 * site 即 Market——市场词汇已与后端 platform-config 对齐（'china' | 'global'），
 * 转换层消失。仅一次性归一历史遗留值（旧后端/旧 localStorage 缓存的 'international'）。
 */
const normalizeSite = marketFromSite   // 判断收归 lib/market，这里只保留本地别名

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
    // 共享 test 域名可由国际站显式传入 ?market=global；该参数只在非生产锁定域名生效，
    // 并优先于缓存/API，避免国际站跳转被国内 platform-config 覆盖。
    // 覆盖链必须与 getMarket() 同源（query + sessionStorage 兜底），
    // 否则路由跳转丢 query 后 data-market 与主题口径分叉（qa#603）。
    const locked = marketLockedByDomain(window.location.hostname)
    const marketOverride = locked ? null : getMarketQueryOverride()
    const forcedMarket = locked ?? marketOverride
    if (forcedMarket) {
      applyMarket(forcedMarket)
      onReady()
    }

    const cached = localStorage.getItem(storageKeys.platformSite())
    if (!forcedMarket && cached) {
      applyMarket(normalizeSite(cached))
      onReady()
    }

    // 用 fetchQuery 而非裸 fetch：让 React Query 追踪这个飞行中的请求，
    // DashboardLayout 的 usePlatformConfig() 进来时会复用同一个请求，不再重发。
    qc.fetchQuery({ queryKey: ['platform-config'], queryFn: getPlatformConfig, staleTime: Infinity })
      .then((config) => {
        if (!config?.site) return
        localStorage.setItem(storageKeys.platformSite(), config.site)
        if (!forcedMarket) applyMarket(normalizeSite(config.site))
      })
      .catch(() => {/* 静默失败，保持缓存/域名探测结果 */})
      .finally(() => {
        // 强制市场已提前 onReady；其余非锁定且无缓存场景等待配置返回后再解锁渲染。
        if (!forcedMarket && !cached) onReady()
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
  // sonner 不吃 CSS 变量，主题得走 prop；用响应式 hook 让运行时切主题的 toast 也跟上
  const activeTheme = useActiveTheme()

  // 协议标签目录：fetch-once-on-app-load，非阻塞——不接 onReady/platformReady，
  // 拿不到就让消费方（CatalogSidebar/model-format/api-code-samples）一直用本地
  // 兜底文案，不影响首屏（该接口依赖的三个后端仓库尚未合并到 test 前必然如此）。
  useEffect(() => {
    usePublicProtocolsStore.getState().fetchPublicProtocols()
  }, [])

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
      {/* 提示顶部居中，不能放 top-right —— 右上角被 header 占着（导航 + 头像 + 租户名/用户名，
          实测 console.test 在 1728px 宽下它们从 x=1106 一直排到 1703），而 toast 宽 360、
          贴右边缘，必然整个压在上面。用户反馈原话：「右上角提示会遮住 PayLinker，
          新建一个 key 就能看到」。居中后横跨 684~1044，与导航起点 1106 不重叠；
          窄屏有 min(360, 100vw-32) 兜底，也不会顶到边。 */}
      <Toaster
        position="top-center"
        /* offset 必须给：header 高 60px，而 toast 默认贴视口顶部，会落在 header 的高度带里。
           光改横向位置躲不开 —— 窗口一窄，导航往左挤、居中的 toast 也往左移，照样重叠
           （实测 1440/1280/1100px 分别重叠 132/212/122px）。72 = header 60 + 12 间距。 */
        offset="72px"
        /* 不给关闭按钮：toast 本来就自动消失，多一个关闭键既无必要，样式也定不住 ——
           sonner 的关闭键靠它自己的 --toast-close-button-* 变量定位，而本项目把 toast
           改成了自定义布局（top-center + 自定义 padding），按钮会被甩到卡片外的左上角
           （2026-09-08 owner 截图实证）。要恢复必须同时接过定位变量，只改配色不管定位
           就是那个 bug。 */
        theme={activeTheme}
        toastOptions={{
          classNames: {
            toast: 'mg-toast',
            title: 'mg-toast-title',
            description: 'mg-toast-description',
            icon: 'mg-toast-icon',
            success: 'mg-toast-success',
            warning: 'mg-toast-warning',
            error: 'mg-toast-error',
            info: 'mg-toast-info',
          },
        }}
      />
      <BrowserRouter>
        {/* 线上换版后在下一次路由切换时静默刷新（qa#741 / prd#838）。必须在 Router 内（要监听路由），
            又在 Providers 内（用 react-query 轮询）。自身不渲染 DOM。 */}
        <VersionUpdateNotice />
        {NavLogger && <Suspense fallback={null}><NavLogger /></Suspense>}
        <PlatformLoader onReady={() => setPlatformReady(true)} />
        {!platformReady && (
          <div style={{
            position: 'fixed', inset: 0,
            background: 'var(--site-bg, #f8fafc)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 'var(--mg-z-blocking)',
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
        <AuthProvider>
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* 认证路由（公开） */}
          <Route path="/login" element={withLocaleNamespaces(<LoginPage />, ['account'])} />
          <Route path="/signup" element={withLocaleNamespaces(<SignupPage />, ['account'])} />
          {/* /register 无此路由——历史外链/书签（如国内官网旧 CTA）重定向到 /signup 防呆。
              指 /signup 而非 /login：/signup 已市场自适应（国内自动转 /login，国际是注册页），两端都对。 */}
          <Route path="/register" element={<RedirectPreservingSearch to="/signup" />} />
          <Route path="/legal/privacy" element={<LegalPage docType="privacy" />} />
          <Route path="/legal/terms" element={<LegalPage docType="terms" />} />
          <Route path="/forgot-password" element={withLocaleNamespaces(<ForgotPasswordPage />, ['account'])} />
          <Route path="/reset-password" element={withLocaleNamespaces(<ResetPasswordPage />, ['account'])} />
          <Route path="/auth/callback" element={withLocaleNamespaces(<AuthCallbackPage />, ['account'])} />
          <Route path="/invitations" element={withLocaleNamespaces(<InvitationsPage />, ['invitations'])} />
          <Route path="/invitations/:token" element={withLocaleNamespaces(<InvitationsPage />, ['invitations'])} />
          <Route path="/device" element={withLocaleNamespaces(<DevicePage />, ['device'])} />
          <Route path="/billing/wechat-cashier" element={withLocaleNamespaces(<WechatCashierPage />, ['billing'])} />

          {/* 根路径：登录进控制台、未登录进模型广场。必须声明在下面受保护的 path="/" 之前，
              且那一组不再留 index 子路由，否则 "/" 会先被它吃掉、访客又被弹回登录页。 */}
          <Route path="/" element={<RootEntry />} />

          {/* 模型广场 / 排行 / 详情已拆到两站官网（prd#1269/#1270/#1272），旧路径不删、按市场转去官网
              对应页（父单硬约束 3「旧链接不能 404」）。登录态的 /models/playground、/models/compare
              在下面受保护的那组里，静态段优先于 :modelId，不会被这里吃掉。 */}
          <Route path="/models">
            <Route index element={<OfficialModelsRedirect kind="catalog" />} />
            {/* discovery 必须声明在 :modelId **之前** —— 否则会被参数路由吃掉，当成一个叫 "discovery" 的模型 */}
            <Route path="discovery" element={<OfficialModelsRedirect kind="rankings" />} />
            <Route path=":modelId" element={<OfficialModelsRedirect kind="detail" />} />
          </Route>

          {/* 控制台路由（需登录） */}
          <Route path="/" element={<RequireAuth><DashboardLayout /></RequireAuth>}>
            {/* 无 index 子路由：根路径由上面的 RootEntry 接管（登录→/dashboard，访客→/models） */}

            {/* 租户级菜单页：由 config/console-routes 单一真源驱动 + 逐路由权限守卫 */}
            {CONSOLE_ROUTES.filter((r) => r.scope === 'tenant').map(consoleRoute)}

            {/* /models 公开广场已在登录组外；此处仅登录态子页 */}
            <Route path="models">
              <Route path="playground" element={withLocaleNamespaces(<ModelsPage />, MODEL_NAMESPACES)} />
              <Route path="compare" element={withLocaleNamespaces(<ModelsComparePage />, MODEL_NAMESPACES)} />
            </Route>
            {/* 任务历史已并入调用日志（#361）：旧路由重定向到「异步任务」记录类型 */}
            <Route path="tasks" element={<Navigate to="/logs?record_type=async" replace />} />

            {/* API Keys 是工作区级页面（真实路由在下面的 workspace/:workspaceId 组里）。
                但模型详情页「获取 API Key」、模型体验的 API 弹窗、以及未登录时的
                `redirect=/api-keys` 回跳手上都没有 workspaceId —— 给它们一个稳定的
                无参入口，由中转页解析默认工作空间后再跳。此前这些入口直接落 404。 */}
            <Route path="api-keys" element={withLocaleNamespaces(<ApiKeysRedirectPage />, ['apiKeys', 'workspaces'])} />

            {/* 开发者菜单（DEV 调试页）——挂在后台壳内（带侧栏/头部），不再独立整页。
                编译期 DEV 专属：生产构建时页面 import 与整条路由均被静态消除。 */}
            {PlatformConfigPage && <Route path="dev-config" element={withLocaleNamespaces(<PlatformConfigPage />, ['platformConfig'])} />}

            {/* 企业管理/空间管理是主入口顶层页（nav.ts main 组），不是「设置」子页——
                路径保持扁平（/organization、/workspaces），与 usage/logs/billing 同级。
                历史上二者曾是 Settings 下的 tab，迁移后路径一直挂在 /settings/* 下，
                导致面包屑误显示「设置」、URL 与信息架构不一致（用户实测发现，见 fix/nav-route-naming）。 */}
            {/* 仅「账号设置」真正属于 Settings（底部固定入口） */}
            <Route path="settings">
              <Route index element={<Navigate to="account" replace />} />
              <Route path="account" element={withLocaleNamespaces(<AccountSettingsPage />, ['account'])} />
              {/* 旧路径向后兼容：v1.0.1 已发布过 /settings/organization、/settings/workspace，
                  可能被收藏/分享，重定向到新扁平路径，不能直接删。 */}
              <Route path="organization" element={<Navigate to="/organization" replace />} />
              <Route path="workspace" element={<Navigate to="/workspaces" replace />} />
            </Route>

            {/* 工作区级菜单页（URL 携带 workspaceId）：同一清单驱动 + 权限守卫。
                RequireWorkspace 校验 URL 上的空间确实属于当前租户——失效链接（空间已删/
                切组织后的旧书签）此前会让三个子页各自打接口失败，只剩两条红提示（qa#594）。 */}
            <Route path="workspace/:workspaceId" element={<RequireWorkspace><Outlet /></RequireWorkspace>}>
              {CONSOLE_ROUTES.filter((r) => r.scope === 'workspace').map(consoleRoute)}
            </Route>
          </Route>

          <Route path="*" element={withLocaleNamespaces(<NotFoundPage />, ['common'])} />
        </Routes>
        </Suspense>
        {/* 智能助手：全站挂一次，**含未登录与登录页**（prd#996）。
            PRD 原型 modelgo_prd/src/App.tsx 把 <CustomerSupportWidget /> 挂了三处，
            其中一处就在 `shell === "login"` 分支里 —— 未登录可见是产品口径，不是遗漏。
            §11.6 也要求「官网、登录页和 Console 右下角共用 ModelGo 圆形入口」。
            ⚠️ 不要挪回 DashboardLayout：那样未登录看不到入口，
            「未登录可问平台知识 / 账户问题提示 needs_login」这两条 AC 就无从触发。 */}
        <CustomerService />
        </AuthProvider>
      </BrowserRouter>
    </Providers>
  )
}
