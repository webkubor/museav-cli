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
  IconBell
} from '@douyinfe/semi-icons'
import { useMarket } from '@/hooks/useMarket'
import { getMarketConfig } from '@/config/market'
import { useNavigate, useLocation, Outlet } from 'react-router-dom'
import { DashboardHeader } from './DashboardHeader'
import { DashboardSidebar } from './DashboardSidebar'

const { Content } = Layout

export function DashboardLayout() {
  const market = useMarket()
  const { companyName } = getMarketConfig(market)
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [activeWorkspace, setActiveWorkspace] = useState('默认业务空间')

  const navItems = [
    { itemKey: 'dashboard', text: '首页', icon: <IconHome style={{ fontSize: '16px' }} /> },
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
        { itemKey: 'token-plan', text: 'Token Plan', icon: <IconMail style={{ fontSize: '14px' }} /> },
        { itemKey: 'invoices', text: '发票管理', icon: <IconMail style={{ fontSize: '14px' }} /> }
      ]
    },
    { itemKey: 'api-keys', text: 'API Keys', icon: <IconKey style={{ fontSize: '16px' }} /> },
    {
      itemKey: 'settings',
      text: '设置',
      icon: <IconSetting style={{ fontSize: '16px' }} />,
      items: [
        { itemKey: 'settings/account', text: '账号', icon: <IconUser style={{ fontSize: '14px' }} /> },
        { itemKey: 'settings/workspace', text: '业务空间', icon: <IconGlobe style={{ fontSize: '14px' }} /> },
        { itemKey: 'settings/alarms', text: '告警', icon: <IconBell style={{ fontSize: '14px' }} /> }
      ]
    }
  ]

  const getSelectedKey = () => {
    const path = location.pathname.replace(/^\//, '')
    if (!path) return 'dashboard'
    return path
  }

  const getBreadcrumbs = () => {
    const path = location.pathname.replace(/^\//, '')
    if (!path) return ['首页']
    const breadcrumbs = ['首页']
    if (path.includes('settings')) {
      breadcrumbs.push('设置')
      if (path.includes('workspace')) breadcrumbs.push('业务空间')
      else if (path.includes('account')) breadcrumbs.push('账号')
      else if (path.includes('alarms')) breadcrumbs.push('告警')
    } else if (path === 'api-keys') {
      breadcrumbs.push('API Keys')
    } else if (path === 'logs') {
      breadcrumbs.push('用量分析', '日志')
    } else if (path === 'usage') {
      breadcrumbs.push('用量分析', '用量')
    } else if (path === 'billing') {
      breadcrumbs.push('账单')
    }
    return breadcrumbs
  }

  return (
    <Layout style={{ minHeight: '100vh', background: '#f8fafc' }}>
      {/* 顶部 Header 子组件 */}
      <DashboardHeader 
        companyName={companyName}
        activeWorkspace={activeWorkspace}
        setActiveWorkspace={setActiveWorkspace}
        navigate={navigate}
      />

      <Layout>
        {/* 左侧侧边栏 Sider 子组件 */}
        <DashboardSidebar 
          collapsed={collapsed}
          setCollapsed={setCollapsed}
          selectedKey={getSelectedKey()}
          onSelect={(data) => navigate(`/${String(data.itemKey)}`)}
          navItems={navItems}
        />

        {/* 主内容区 Content */}
        <Layout style={{ padding: '28px 36px', transition: 'all 0.3s ease' }}>
          <Breadcrumb style={{ marginBottom: '18px', fontSize: '12px', color: '#64748b' }}>
            {getBreadcrumbs().map((b, idx) => (
              <Breadcrumb.Item key={idx}>{b}</Breadcrumb.Item>
            ))}
          </Breadcrumb>

          <Content style={{
            background: '#ffffff',
            borderRadius: '16px',
            border: '1px solid rgba(241, 245, 249, 0.8)',
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
