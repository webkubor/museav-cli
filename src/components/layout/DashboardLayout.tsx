import { useState } from 'react'
import { Layout, Breadcrumb } from '@douyinfe/semi-ui'
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
} from 'react-icons/lu'
import { useNavigate, useLocation, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { DashboardHeader } from './DashboardHeader'
import { DashboardSidebar } from './DashboardSidebar'
import { CustomerService } from '@/components/customer-service'
import { navConfig } from '@/config/nav'
import { isDomestic } from '@/lib/market'
import { usePlatformConfig } from '@/hooks/use-platform-config'

const { Content } = Layout

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
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px 0',
        gap: '16px',
      }}>
        <div style={{ fontSize: '40px' }}>🔒</div>
        <div style={{ fontSize: '16px', fontWeight: 700, color: 'var(--semi-color-text-0)' }}>
          无可用工作区
        </div>
        <div style={{ fontSize: '13px', color: 'var(--semi-color-text-2)', textAlign: 'center', maxWidth: '320px', lineHeight: '1.6' }}>
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
  usePlatformConfig() // 预热全局缓存，子组件通过 useCurrency() 零请求读取
  const [collapsed, setCollapsed] = useState(false)

  const tenants = useAuthStore((s) => s.tenants)
  const activeTenantId = useAuthStore((s) => s.activeTenantId)
  const activeWorkspaceId = useAuthStore((s) => s.activeWorkspaceId)
  const activeTenant = tenants.find((t) => t.tenant_id === activeTenantId)

  // ─── 菜单可见性上下文（所有条件集中在 src/config/nav.ts） ───────────────
  const navCtx = {
    isNonPersonal: activeTenant?.type !== 'personal',
    isDomestic: isDomestic(),
    isDevTools,
  }

  const icons = {
    home:        <LuHouse        size={16} />,
    apps:        <LuLayoutGrid   size={16} />,
    histogram:   <LuTrendingUp   size={16} />,
    histogramSm: <LuTrendingUp   size={14} />,
    list:        <LuList         size={14} />,
    creditCard:  <LuCreditCard   size={16} />,
    wrench:      <LuWrench       size={16} color="#d97706" />,
    key:         <LuKey          size={16} />,
    shield:      <LuShield       size={16} />,
    eye:         <LuEye          size={16} />,
    mail:        <LuMail         size={16} />,
  }

  const tenantNavItems    = navConfig.tenantItems(navCtx, t, icons)
  const workspaceNavItems = navConfig.workspaceItems(navCtx, t, icons)

  const getSelectedKey = () => {
    const path = location.pathname
    // 工作区级路由：/workspace/:workspaceId/<key>
    const wsMatch = path.match(/^\/workspace\/[^/]+\/(.+)$/)
    if (wsMatch) return wsMatch[1]
    return path.replace(/^\//, '') || 'dashboard'
  }

  const BREADCRUMB_MAP: Record<string, string[]> = {
    dashboard:        [t('nav.home')],
    models:           [t('nav.home'), t('nav.models')],
    'api-keys':       [t('nav.home'), t('nav.apiKeys')],
    usage:            [t('nav.home'), t('nav.analytics'), t('nav.usage')],
    logs:             [t('nav.home'), t('nav.analytics'), t('nav.logs')],
    billing:          [t('nav.home'), t('nav.billing')],
    guardrails:       [t('nav.home'), t('nav.guardrails')],
    observability:    [t('nav.home'), t('nav.observability')],
    'invitations-mgmt': [t('nav.home'), t('nav.invitations')],
    'platform-config':  [t('nav.home'), '接口调试'],
    'settings/account':      [t('nav.home'), t('nav.settings'), t('nav.account')],
    'settings/workspace':    [t('nav.home'), t('nav.settings'), t('nav.workspace')],
    'settings/organization': [t('nav.home'), t('nav.settings'), t('nav.organization')],
  }

  const getBreadcrumbs = () => {
    const path = location.pathname.replace(/^\//, '')
    return BREADCRUMB_MAP[path] ?? [t('nav.home')]
  }

  const isDashboardRoute = getSelectedKey() === 'dashboard'

  return (
    <Layout style={{ minHeight: '100vh', background: 'var(--site-bg)' }}>
      <DashboardHeader />

      <Layout>
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

        <Layout style={{ padding: '28px 36px', flex: 1, transition: 'all 0.3s ease' }}>
          <Breadcrumb style={{ marginBottom: '18px', fontSize: '12px', color: 'var(--semi-color-text-1)' }}>
            {getBreadcrumbs().map((b, idx) => (
              <Breadcrumb.Item key={idx}>{b}</Breadcrumb.Item>
            ))}
          </Breadcrumb>

          <CustomerService />

          <Content style={isDashboardRoute ? {
            background: 'transparent',
            border: 'none',
            boxShadow: 'none',
            padding: 0,
            minHeight: 'auto',
            transition: 'all 0.3s ease'
          } : {
            background: 'var(--semi-color-bg-0)',
            borderRadius: '16px',
            border: '1px solid var(--semi-color-fill-0)',
            boxShadow: '0 4px 20px -2px rgba(15, 23, 42, 0.03), 0 2px 8px -1px rgba(15, 23, 42, 0.02)',
            padding: '36px',
            minHeight: '520px',
            transition: 'all 0.3s ease'
          }}>
            <WorkspaceGuard currentKey={getSelectedKey()}>
              <Outlet />
            </WorkspaceGuard>
          </Content>
        </Layout>
      </Layout>
    </Layout>
  )
}
