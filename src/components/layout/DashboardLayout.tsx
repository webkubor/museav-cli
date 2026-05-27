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
import { DashboardHeader } from './DashboardHeader'
import { DashboardSidebar } from './DashboardSidebar'
import { CustomerService } from '@/components/customer-service'

const { Content } = Layout

export function DashboardLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  // Tenant级：切换工作区不影响这些页面
  const tenantNavItems = [
    { itemKey: 'dashboard', text: '总览', icon: <IconHome style={{ fontSize: '16px' }} /> },
    { itemKey: 'models', text: '模型目录', icon: <IconApps style={{ fontSize: '16px' }} /> },
    {
      itemKey: 'analytics',
      text: '用量分析',
      icon: <IconHistogram style={{ fontSize: '16px' }} />,
      items: [
        { itemKey: 'usage', text: '用量', icon: <IconHistogram style={{ fontSize: '14px' }} /> },
        { itemKey: 'logs', text: '日志', icon: <IconList style={{ fontSize: '14px' }} /> }
      ]
    },
    {
      itemKey: 'billing',
      text: '账单',
      icon: <IconCreditCard style={{ fontSize: '16px' }} />,
      items: [
        { itemKey: 'pay-as-you-go', text: '按量付费', icon: <IconShield style={{ fontSize: '14px' }} /> },
        { itemKey: 'billing-orders', text: '充值订单', icon: <IconList style={{ fontSize: '14px' }} /> },
        { itemKey: 'invoices', text: '发票管理', icon: <IconMail style={{ fontSize: '14px' }} /> }
      ]
    },
    {
      itemKey: 'settings',
      text: '设置',
      icon: <IconSetting style={{ fontSize: '16px' }} />,
      items: [
        { itemKey: 'settings/account', text: '账号', icon: <IconUser style={{ fontSize: '14px' }} /> },
        { itemKey: 'settings/workspace', text: '工作区管理', icon: <IconGlobe style={{ fontSize: '14px' }} /> },
        { itemKey: 'settings/organization', text: '组织管理', icon: <IconUserGroup style={{ fontSize: '14px' }} /> },
      ]
    }
  ]

  // Workspace级：切换工作区后内容随之变化
  const workspaceNavItems = [
    { itemKey: 'api-keys', text: 'API Keys', icon: <IconKey style={{ fontSize: '16px' }} /> },
    { itemKey: 'guardrails', text: '安全护栏', icon: <IconShield style={{ fontSize: '16px' }} /> },
    { itemKey: 'observability', text: '可观测性', icon: <IconEyeOpened style={{ fontSize: '16px' }} /> },
    { itemKey: 'invitations-mgmt', text: '邀请管理', icon: <IconMail style={{ fontSize: '16px' }} /> },
  ]

  const getSelectedKey = () => {
    const path = location.pathname.replace(/^\//, '')
    if (!path) return 'dashboard'
    return path
  }

  const BREADCRUMB_MAP: Record<string, string[]> = {
    dashboard:        ['首页'],
    models:           ['首页', '模型目录'],
    'api-keys':       ['首页', 'API Keys'],
    usage:            ['首页', '用量分析', '用量'],
    logs:             ['首页', '用量分析', '日志'],
    'pay-as-you-go':  ['首页', '账单', '按量付费'],
    'billing-orders': ['首页', '账单', '充值订单'],
    invoices:         ['首页', '账单', '发票管理'],
    guardrails:       ['首页', '安全护栏'],
    observability:    ['首页', '可观测性'],
    'invitations-mgmt': ['首页', '邀请管理'],
    'settings/account':      ['首页', '设置', '账号'],
    'settings/workspace':    ['首页', '设置', '工作区管理'],
    'settings/organization': ['首页', '设置', '组织管理'],
  }

  const getBreadcrumbs = () => {
    const path = location.pathname.replace(/^\//, '')
    return BREADCRUMB_MAP[path] ?? ['首页']
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
