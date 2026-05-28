import { useState } from 'react'
import { Layout, Breadcrumb } from '@douyinfe/semi-ui'
import { useAuthStore } from '@/store/auth'
import {
  IconHome,
  IconHistogram,
  IconList,
  IconCreditCard,
  IconShield,
  IconMail,
  IconKey,
  IconEyeOpened,
  IconApps,
  IconWrench,
} from '@douyinfe/semi-icons'
import { useNavigate, useLocation, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { DashboardHeader } from './DashboardHeader'
import { DashboardSidebar } from './DashboardSidebar'
import { CustomerService } from '@/components/customer-service'
import { navConfig } from '@/config/nav'
import { isDomestic } from '@/lib/market'

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
    home:        <IconHome        style={{ fontSize: '16px' }} />,
    apps:        <IconApps        style={{ fontSize: '16px' }} />,
    histogram:   <IconHistogram   style={{ fontSize: '16px' }} />,
    histogramSm: <IconHistogram   style={{ fontSize: '14px' }} />,
    list:        <IconList        style={{ fontSize: '14px' }} />,
    creditCard:  <IconCreditCard  style={{ fontSize: '16px' }} />,
    wrench:      <IconWrench      style={{ fontSize: '16px', color: '#d97706' }} />,
    key:         <IconKey         style={{ fontSize: '16px' }} />,
    shield:      <IconShield      style={{ fontSize: '16px' }} />,
    eye:         <IconEyeOpened   style={{ fontSize: '16px' }} />,
    mail:        <IconMail        style={{ fontSize: '16px' }} />,
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

  return (
    <Layout style={{ minHeight: '100vh', background: 'var(--semi-color-bg-1)' }}>
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

          <Content style={{
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
