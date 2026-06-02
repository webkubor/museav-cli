import { useState } from 'react'
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
} from 'react-icons/lu'
import { useNavigate, useLocation, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { DashboardHeader } from './DashboardHeader'
import { DashboardSidebar } from './DashboardSidebar'
import { CustomerService } from '@/components/customer-service'
import { navConfig } from '@/config/nav'
import type { NavItem } from '@/config/nav'
import { isDomestic } from '@/lib/market'
import { usePlatformConfig } from '@/hooks/use-platform-config'
import { usePermissions } from '@/hooks/use-permissions'
import { cn } from '@/lib/utils'

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
          当前账号尚未加入任何工作区。请联系组织管理员将你加入工作区，或前往设置创建一个新工作区。
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

  const tenants = useAuthStore((s) => s.tenants)
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const activeTenant = tenants.find((t) => t.tenant_id === activeTenantId)

  const { hasPermission } = usePermissions()

  const navCtx = {
    isNonPersonal: activeTenant?.type !== 'personal',
    isDomestic: isDomestic(),
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
    message:     ic(<LuMessageSquare size={16} />),
  }

  const tenantNavItems    = filterNavItems(navConfig.tenantItems(navCtx, t, icons))
  const workspaceNavItems = filterNavItems(navConfig.workspaceItems(navCtx, t, icons))
  const sandboxNavItems   = navConfig.sandboxItems(navCtx, icons)

  const getSelectedKey = () => {
    const path = location.pathname
    const wsMatch = path.match(/^\/workspace\/[^/]+\/(.+)$/)
    if (wsMatch) return wsMatch[1]
    return path.replace(/^\//, '') || 'dashboard'
  }

  const BREADCRUMB_MAP: Record<string, string[]> = {
    dashboard:        [t('nav.home')],
    'models/explore': [t('nav.home'), t('nav.models'), t('nav.modelExplore')],
    'models/compare': [t('nav.home'), t('nav.models'), t('nav.modelCompare')],
    'models/chat':    [t('nav.home'), t('nav.playground'), t('nav.modelChat')],
    'api-keys':       [t('nav.home'), t('nav.apiKeys')],
    usage:            [t('nav.home'), t('nav.analytics'), t('nav.usage')],
    logs:             [t('nav.home'), t('nav.analytics'), t('nav.logs')],
    billing:          [t('nav.home'), t('nav.billing')],
    guardrails:       [t('nav.home'), t('nav.guardrails')],
    observability:    [t('nav.home'), t('nav.observability')],
    'invitations-mgmt':  [t('nav.home'), t('nav.invitations')],
    'chat-test':         [t('nav.home'), '测试区', '对话测试'],
    'platform-config':  [t('nav.home'), '接口调试'],
    'settings/account':      [t('nav.home'), t('nav.settings'), t('nav.account')],
    'settings/workspace':    [t('nav.home'), t('nav.workspace')],
    'settings/organization': [t('nav.home'), t('nav.settings'), t('nav.organization')],
  }

  const getBreadcrumbs = () => {
    const path = location.pathname.replace(/^\//, '')
    return BREADCRUMB_MAP[path] ?? [t('nav.home')]
  }

  const isDashboardRoute = getSelectedKey() === 'dashboard'
  const FLAT_ROUTES = ['logs', 'usage', 'observability', 'billing', 'platform-config', 'settings/organization']
  const isFlatRoute = FLAT_ROUTES.includes(getSelectedKey())

  return (
    <div className="min-h-screen bg-site-bg flex flex-col font-sans">
      <DashboardHeader />
      <div className="shimmer-line" />

      <div className="flex flex-1 relative overflow-hidden">
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
          sandboxNavItems={sandboxNavItems}
          settingsLabel={t('nav.settings')}
        />

        <main className="flex-1 flex flex-col p-6 md:p-9 overflow-y-auto h-[calc(100vh-60px)] transition-all duration-300">
          {/* 高阶极简自定义 Breadcrumbs */}
          <nav className="flex items-center gap-2 mb-5 text-[11px] font-bold text-mg-text-2 tracking-wider uppercase select-none">
            {getBreadcrumbs().map((b, idx) => (
              <div key={idx} className="flex items-center gap-2">
                {idx > 0 && <span className="opacity-45 text-mg-text-2">/</span>}
                <span className={cn(
                  idx === getBreadcrumbs().length - 1 
                    ? "text-mg-text-0 font-bold" 
                    : "text-mg-text-2/70 font-bold"
                )}>
                  {b}
                </span>
              </div>
            ))}
          </nav>

          <CustomerService />

          {/* 渲染主视图区域 */}
          <div className={cn(
            "transition-all duration-300 shrink-0",
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
