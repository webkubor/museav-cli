import { useState, useEffect, Suspense } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/auth'
import {
  LuHouse,
  LuTrendingUp,
  LuList,
  LuCreditCard,
  LuShield,
  LuMail,
  LuKey,
  LuEye,
  LuLayoutGrid,
  LuWrench,
  LuTerminal,
  LuLock,
  LuMessageSquare,
  LuClapperboard,
  LuBuilding2,
} from 'react-icons/lu'
import { useNavigate, useLocation, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { DashboardHeader } from './DashboardHeader'
import { DashboardSidebar } from './DashboardSidebar'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { CustomerService } from '@/components/customer-service'
import { PhoneBindingGuard } from '@/components/auth/PhoneBindingGuard'
import { TopUpModal } from '@/pages/billing/TopUpModal'
import { useRechargeStore } from '@/store/use-recharge-store'
import { navConfig } from '@/config/nav'
import type { NavItem } from '@/config/nav'
import { installAgentTools } from '@/lib/dev-agent-tools'
import { breadcrumbConfig, FLAT_ROUTES } from '@/config/breadcrumbs'
import { usePlatformConfig, useSite } from '@/hooks/use-platform-config'
import { usePermissions } from '@/hooks/use-permissions'
import { useTenantRole } from '@/hooks/use-tenant-role'
import { useTrackContext } from '@/hooks/use-track-context'
import { trackEvent } from '@/lib/track'
import { listWorkspaces } from '@/services/workspaces'
import { cn } from '@/lib/utils'
import { ParticleLinesBackground } from './ParticleLinesBackground'
import './layout.css'


const isDevTools = import.meta.env.VITE_SHOW_DEV_TOOLS === 'true'

function WorkspaceGuard({
  currentKey,
  children,
}: {
  currentKey: string
  children: React.ReactNode
}) {
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)

  if (!activeWorkspaceId && navConfig.workspaceScopedKeys.has(currentKey)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 select-none animate-in fade-in duration-300">
        <LuLock size={36} className="text-mg-text-3" />
        <div className="text-base font-bold text-mg-text-1">
          无可用工作区
        </div>
        <div className="text-[13px] text-mg-text-3 text-center max-w-[320px] leading-relaxed">
          当前账号尚未加入任何工作区。请联系企业管理员将你加入工作区，或前往设置创建一个新工作区。
        </div>
      </div>
    )
  }

  return <>{children}</>
}

export function DashboardLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  usePlatformConfig()
  const [collapsed, setCollapsed] = useState(false)
  const [navigating, setNavigating] = useState(false)
  // 窄屏（<md）侧栏抽屉开合；桌面（≥md）不使用（侧栏常驻）
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    // 路由切换（外部事件）触发 800ms 导航过渡指示，无法从渲染派生
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNavigating(true)
    const timer = setTimeout(() => {
      setNavigating(false)
    }, 800)
    return () => clearTimeout(timer)
  }, [location.pathname])

  // 抽屉打开态：Esc 关闭
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  const tenants = useAuthStore((s) => s.tenants)
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const activeTenant = tenants.find((t) => t.tenant_id === activeTenantId)
  const rechargeOpen = useRechargeStore((s) => s.isOpen)
  const closeRecharge = useRechargeStore((s) => s.close)

  const { hasPermission } = usePermissions()
  const trackCtx = useTrackContext()
  const site = useSite()
  const { canManage, isEnterprise } = useTenantRole()
  const isPersonal = activeTenant?.type === 'personal'
  const { data: workspaceItems = [] } = useQuery({
    queryKey: ['workspaces', activeTenantId],
    queryFn: () => listWorkspaces().then((res) => res.items ?? []),
    enabled: Boolean(activeTenantId),
    staleTime: 60_000,
  })
  const ownsWorkspace = workspaceItems.some((workspace) => workspace.my_role === 'ws_owner')

  const navCtx = {
    isNonPersonal: activeTenant?.type !== 'personal',
    isDomestic: site === 'china',
    isDevTools,
    // 企业管理：仅企业租户 Owner/Admin。空间管理：Owner/Admin、个人租户或任一空间负责人。
    isOrgManager: isEnterprise && canManage,
    isSpaceManager: canManage || isPersonal || ownsWorkspace,
  }

  const filterNavItems = (items: NavItem[]): NavItem[] =>
    items.reduce<NavItem[]>((acc, item) => {
      if (item.permission && !hasPermission(item.permission)) return acc
      if (item.items) {
        const children = filterNavItems(item.items)
        if (children.length === 0) return acc
        return [...acc, { ...item, items: children }]
      }
      return [...acc, item]
    }, [])

  const ic = (node: React.ReactNode) => (
    <span className="inline-flex w-4 h-4 items-center justify-center shrink-0">
      {node}
    </span>
  )

  const icons = {
    home:        ic(<LuHouse        size={16} />),
    apps:        ic(<LuLayoutGrid   size={16} />),
    histogram:   ic(<LuTrendingUp   size={16} />),
    histogramSm: ic(<LuTrendingUp   size={14} />),
    list:        ic(<LuList         size={14} />),
    creditCard:  ic(<LuCreditCard   size={16} />),
    wrench:      ic(<LuWrench       size={16} className="text-amber-600" />),
    terminal:    ic(<LuTerminal     size={16} />),
    key:         ic(<LuKey          size={16} />),
    building:    ic(<LuBuilding2    size={16} />),
    shield:      ic(<LuShield       size={16} />),
    eye:         ic(<LuEye          size={16} />),
    mail:        ic(<LuMail         size={16} />),
    message:     ic(<LuMessageSquare  size={16} />),
    gift:        ic(<span className="text-[15px] leading-none" role="img" aria-label="gift">🎁</span>),
    clapper:     ic(<LuClapperboard  size={16} />),
  }

  // 按权限过滤每个分组的入口，丢弃过滤后为空的分组（开发者菜单已移入 dev 工具栏，不入业务侧栏）
  const navGroups = navConfig
    .groups(navCtx, t, icons)
    .map((group) => ({ ...group, items: filterNavItems(group.items) }))
    .filter((group) => group.items.length > 0)

  // Dev/test：把可见导航暴露成 agent 工具（window.__mg_nav + WebMCP），供 UI 自动化按菜单枚举/跳转。
  // 仅 VITE_SHOW_DEV_TOOLS 装载；菜单键集或工作区变化时重挂（WebMCP register/unregister on change）。
  const menuSignature = navGroups.map((g) => `${g.scope}:${g.items.map((i) => i.itemKey).join(',')}`).join('|')
  useEffect(() => {
    if (!isDevTools) return
    return installAgentTools({ navGroups, activeWorkspaceId, navigate })
    // navGroups 用 menuSignature 稳定判等，避免每次渲染重挂
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuSignature, activeWorkspaceId, navigate])

  const getSelectedKey = () => {
    const path = location.pathname
    const wsMatch = path.match(/^\/workspace\/[^/]+\/(.+)$/)
    if (wsMatch) return wsMatch[1]
    return path.replace(/^\//, '') || 'dashboard'
  }

  const getBreadcrumbs = () => {
    const key = getSelectedKey()
    const raw = breadcrumbConfig[key] ?? [{ label: 'nav.home', path: '/dashboard' }]
    return raw.map((item) => ({ ...item, label: t(item.label) }))
  }

  const handleNavSelect = (data: { itemKey: string | number }) => {
    const key = String(data.itemKey)
    const isWorkspaceScoped = navConfig.workspaceScopedKeys.has(key)
    const targetRoute = isWorkspaceScoped ? `/workspace/${activeWorkspaceId}/${key}` : `/${key}`
    const group = navGroups.find((g) => g.items.some((it) => it.itemKey === key))
    trackEvent(
      'console_nav_click',
      {
        ...trackCtx,
        nav_key: key,
        nav_group: group?.key ?? '',
        target_route: targetRoute,
        scope_type: group?.scope ?? (isWorkspaceScoped ? 'workspace' : 'tenant'),
        sidebar_state: collapsed ? 'collapsed' : 'expanded',
      },
      { source: 'sidebar_nav' },
    )
    navigate(targetRoute)
  }

  const isDashboardRoute = getSelectedKey() === 'dashboard'
  const isFlatRoute = FLAT_ROUTES.includes(getSelectedKey())

  return (
    <div className="dashboard-shell h-screen bg-site-bg flex flex-col font-sans relative overflow-hidden">
      <ParticleLinesBackground />
      <div className="dashboard-global-bottom-bg" aria-hidden="true" />
      <DashboardHeader onMenuClick={() => setMobileOpen(true)} />
      <div className={cn("shimmer-line", navigating && "navigating")} />

      <div className="flex flex-1 min-h-0 relative z-10 overflow-hidden">
        {/* 桌面（≥md）：侧栏常驻。display:contents 让 wrapper 在 md+ 消失，aside 直接作为 flex 项参与布局 */}
        <div className="hidden md:contents">
          <DashboardSidebar
            collapsed={collapsed}
            setCollapsed={setCollapsed}
            selectedKey={getSelectedKey()}
            onSelect={handleNavSelect}
            groups={navGroups}
            settingsLabel={t('nav.settings')}
          />
        </div>

        {/* 窄屏（<md）：抽屉 + 遮罩。默认隐藏，从左滑入；点遮罩 / 选中入口 / Esc 关闭 */}
        <div className="md:hidden">
          <div
            aria-hidden="true"
            onClick={() => setMobileOpen(false)}
            className={cn(
              "fixed inset-0 z-50 bg-black/40 backdrop-blur-sm transition-opacity duration-300",
              mobileOpen ? "opacity-100" : "opacity-0 pointer-events-none"
            )}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('nav.dashboard')}
            className={cn(
              "fixed left-0 top-0 bottom-0 z-50 w-60 max-w-[80vw] shadow-xl transition-transform duration-300 ease-out",
              mobileOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"
            )}
          >
            <DashboardSidebar
              collapsed={false}
              setCollapsed={() => {}}
              selectedKey={getSelectedKey()}
              onSelect={(data) => {
                handleNavSelect(data)
                setMobileOpen(false)
              }}
              groups={navGroups}
              settingsLabel={t('nav.settings')}
            />
          </div>
        </div>

        <main className="flex-1 flex flex-col pt-3 px-6 pb-6 md:pt-4 md:px-9 md:pb-9 overflow-y-auto h-full min-h-0 transition-all duration-300">
          {/* 高阶极简自定义 Breadcrumbs */}
          <Breadcrumb items={getBreadcrumbs()} />

          <CustomerService />

          {/* 国内环境强制绑定手机号守卫（#366）：无手机号时弹不可跳过的绑定弹窗，挂一次即可 */}
          <PhoneBindingGuard />

          {/* 全局充值弹框：任意入口经 useRechargeStore.open() 就地弹出，挂一次即可 */}
          <TopUpModal visible={rechargeOpen} onClose={closeRecharge} tenantId={activeTenantId ?? ''} />

          {/* 渲染主视图区域 */}
          <div className={cn(
            "shrink-0",
            isDashboardRoute || isFlatRoute ? (
              "bg-transparent border-none shadow-none p-6 md:p-9"
            ) : (
              "bg-mg-bg-0 rounded-lg border border-mg-border/60 shadow-sm shadow-black/2 p-6 md:p-9 min-h-[320px] mb-8"
            )
          )}>
            <WorkspaceGuard currentKey={getSelectedKey()}>
              {/* 内容区级 Suspense：切菜单时只在内容区转圈，侧栏/头/面包屑常驻不闪，
                  路由立即响应（不再被 App 级全屏 RouteFallback 盖住整屏） */}
              <Suspense
                fallback={
                  <div className="flex items-center justify-center py-24">
                    <div className="h-7 w-7 animate-spin rounded-full border-2 border-mg-border border-t-brand-base" />
                  </div>
                }
              >
                <Outlet />
              </Suspense>
            </WorkspaceGuard>
          </div>
        </main>
      </div>
    </div>
  )
}
