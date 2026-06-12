import { useState, useEffect } from 'react'
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
  LuGift,
  LuClapperboard,
} from 'react-icons/lu'
import { useNavigate, useLocation, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { DashboardHeader } from './DashboardHeader'
import { DashboardSidebar } from './DashboardSidebar'
import { LowBalanceAlert } from './LowBalanceAlert'
import { Breadcrumb } from '@/components/ui/Breadcrumb'
import { CustomerService } from '@/components/customer-service'
import { navConfig } from '@/config/nav'
import type { NavItem } from '@/config/nav'
import { breadcrumbConfig, FLAT_ROUTES } from '@/config/breadcrumbs'
import { usePlatformConfig, useSite } from '@/hooks/use-platform-config'
import { usePermissions } from '@/hooks/use-permissions'
import { cn } from '@/lib/utils'
import { ParticleLinesBackground } from './ParticleLinesBackground'
import { useDevStore } from '@/store/use-dev-store'
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
        <LuLock size={36} className="text-mg-text-2" />
        <div className="text-base font-bold text-mg-text-0">
          无可用工作区
        </div>
        <div className="text-[13px] text-mg-text-2 text-center max-w-[320px] leading-relaxed">
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

  useEffect(() => {
    setNavigating(true)
    const timer = setTimeout(() => {
      setNavigating(false)
    }, 800)
    return () => clearTimeout(timer)
  }, [location.pathname])

  const tenants = useAuthStore((s) => s.tenants)
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const activeTenant = tenants.find((t) => t.tenant_id === activeTenantId)

  const { hasPermission } = usePermissions()
  const site = useSite()

  const navCtx = {
    isNonPersonal: activeTenant?.type !== 'personal',
    isDomestic: site === 'china',
    isDevTools,
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
    shield:      ic(<LuShield       size={16} />),
    eye:         ic(<LuEye          size={16} />),
    mail:        ic(<LuMail         size={16} />),
    message:     ic(<LuMessageSquare  size={16} />),
    gift:        ic(<LuGift           size={16} />),
    clapper:     ic(<LuClapperboard  size={16} />),
  }

  const showPlatformConfig = useDevStore((s) => s.showPlatformConfig)
  const tenantNavItems    = filterNavItems(navConfig.tenantItems(navCtx, t, icons))
  const baseWorkspaceNavItems = filterNavItems(navConfig.workspaceItems(navCtx, t, icons))
  const workspaceNavItems = [
    ...baseWorkspaceNavItems,
    ...(import.meta.env.DEV && showPlatformConfig
      ? navConfig.sandboxItems(navCtx, icons)
      : []),
  ]

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

  const isDashboardRoute = getSelectedKey() === 'dashboard'
  const isFlatRoute = FLAT_ROUTES.includes(getSelectedKey())

  return (
    <div className="dashboard-shell min-h-screen bg-site-bg flex flex-col font-sans relative overflow-hidden">
      <ParticleLinesBackground />
      <div className="dashboard-global-bottom-bg" aria-hidden="true" />
      <DashboardHeader />
      <div className={cn("shimmer-line", navigating && "navigating")} />
      <LowBalanceAlert />


      <div className="flex flex-1 relative z-10 overflow-hidden">
        <DashboardSidebar
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          selectedKey={getSelectedKey()}
          onSelect={(data) => {
            const key = String(data.itemKey)
            if (navConfig.workspaceScopedKeys.has(key)) {
              navigate(`/workspace/${activeWorkspaceId}/${key}`)
            } else {
              navigate(`/${key}`)
            }
          }}
          tenantNavItems={tenantNavItems}
          workspaceNavItems={workspaceNavItems}
          settingsLabel={t('nav.settings')}
        />

        <main className="flex-1 flex flex-col pt-3 px-6 pb-6 md:pt-4 md:px-9 md:pb-9 overflow-y-auto h-full min-h-0 transition-all duration-300">
          {/* 高阶极简自定义 Breadcrumbs */}
          <Breadcrumb items={getBreadcrumbs()} />

          <CustomerService />

          {/* 渲染主视图区域 */}
          <div className={cn(
            "shrink-0",
            isDashboardRoute || isFlatRoute ? (
              "bg-transparent border-none shadow-none p-0"
            ) : (
              "bg-mg-bg-0 rounded-2xl border border-mg-border/60 shadow-sm shadow-black/2 p-6 md:p-9 min-h-[520px] mb-8"
            )
          )}>
            <WorkspaceGuard currentKey={getSelectedKey()}>
              <Outlet />
            </WorkspaceGuard>
          </div>
        </main>
      </div>
    </div>
  )
}
