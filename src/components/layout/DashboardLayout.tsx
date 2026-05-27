import { useState } from 'react'
import { Layout, Breadcrumb } from '@douyinfe/semi-ui'
import {
  IconHome,
  IconHistogram,
  IconList,
  IconCreditCard,
  IconShield,
  IconMail,
  IconKey,
  IconSetting,
  IconUser,
  IconGlobe,
  IconUserGroup,
  IconEyeOpened,
  IconApps,
} from '@douyinfe/semi-icons'
import { useNavigate, useLocation, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { DashboardHeader } from './DashboardHeader'
import { DashboardSidebar } from './DashboardSidebar'
import { CustomerService } from '@/components/customer-service'

const { Content } = Layout

export function DashboardLayout() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  // Tenant级：切换工作区不影响这些页面
  const tenantNavItems = [
    { itemKey: 'dashboard', text: t('nav.dashboard'), icon: <IconHome style={{ fontSize: '16px' }} /> },
    { itemKey: 'models', text: t('nav.models'), icon: <IconApps style={{ fontSize: '16px' }} /> },
    {
      itemKey: 'analytics',
      text: t('nav.analytics'),
      icon: <IconHistogram style={{ fontSize: '16px' }} />,
      items: [
        { itemKey: 'usage', text: t('nav.usage'), icon: <IconHistogram style={{ fontSize: '14px' }} /> },
        { itemKey: 'logs', text: t('nav.logs'), icon: <IconList style={{ fontSize: '14px' }} /> }
      ]
    },
    {
      itemKey: 'billing',
      text: t('nav.billing'),
      icon: <IconCreditCard style={{ fontSize: '16px' }} />,
    },
    {
      itemKey: 'settings',
      text: t('nav.settings'),
      icon: <IconSetting style={{ fontSize: '16px' }} />,
      items: [
        { itemKey: 'settings/account', text: t('nav.account'), icon: <IconUser style={{ fontSize: '14px' }} /> },
        { itemKey: 'settings/workspace', text: t('nav.workspace'), icon: <IconGlobe style={{ fontSize: '14px' }} /> },
        { itemKey: 'settings/organization', text: t('nav.organization'), icon: <IconUserGroup style={{ fontSize: '14px' }} /> },
      ]
    }
  ]

  // Workspace级：切换工作区后内容随之变化
  const workspaceNavItems = [
    { itemKey: 'api-keys', text: t('nav.apiKeys'), icon: <IconKey style={{ fontSize: '16px' }} /> },
    { itemKey: 'guardrails', text: t('nav.guardrails'), icon: <IconShield style={{ fontSize: '16px' }} /> },
    { itemKey: 'observability', text: t('nav.observability'), icon: <IconEyeOpened style={{ fontSize: '16px' }} /> },
    { itemKey: 'invitations-mgmt', text: t('nav.invitations'), icon: <IconMail style={{ fontSize: '16px' }} /> },
  ]

  const getSelectedKey = () => {
    const path = location.pathname.replace(/^\//, '')
    if (!path) return 'dashboard'
    return path
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
        {/* 左侧侧边栏 Sider 子组件 */}
        <DashboardSidebar
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          selectedKey={getSelectedKey()}
          onSelect={(data) => navigate(`/${String(data.itemKey)}`)}
          tenantNavItems={tenantNavItems}
          workspaceNavItems={workspaceNavItems}
        />

        {/* 主内容区 Content */}
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
            <Outlet />
          </Content>
        </Layout>
      </Layout>
    </Layout>
  )
}
