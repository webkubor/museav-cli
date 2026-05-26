import { useState } from 'react'
import { Layout, Nav, Button, Dropdown, Avatar, Breadcrumb } from '@douyinfe/semi-ui'
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
  IconBell,
  IconChevronDown,
  IconLanguage,
  IconHelpCircle
} from '@douyinfe/semi-icons'


import { useMarket } from '@/hooks/useMarket'
import { getMarketConfig } from '@/config/market'
import { useNavigate, useLocation, Outlet } from 'react-router-dom'

const { Header, Sider, Content } = Layout

export function DashboardLayout() {
  const market = useMarket()
  const { companyName } = getMarketConfig(market)
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)

  // 当前激活的 Workspace
  const [activeWorkspace, setActiveWorkspace] = useState('默认业务空间')

  // 左侧导航结构设计 (完美还原千问云云平台菜单)
  const navItems = [
    { itemKey: 'dashboard', text: '首页', icon: <IconHome /> },
    {
      itemKey: 'analytics',
      text: '用量分析',
      icon: <IconHistogram />,
      items: [
        { itemKey: 'usage', text: '用量', icon: <IconHistogram /> },
        { itemKey: 'logs', text: '日志', icon: <IconList /> }
      ]
    },

    {
      itemKey: 'billing',
      text: '账单',
      icon: <IconCreditCard />,
      items: [
        { itemKey: 'pay-as-you-go', text: '按量付费', icon: <IconShield /> },
        { itemKey: 'token-plan', text: 'Token Plan', icon: <IconMail /> },
        { itemKey: 'invoices', text: '发票管理', icon: <IconMail /> }
      ]
    },

    { itemKey: 'api-keys', text: 'API Keys', icon: <IconKey /> },
    {
      itemKey: 'settings',
      text: '设置',
      icon: <IconSetting />,
      items: [
        { itemKey: 'settings/account', text: '账号', icon: <IconUser /> },
        { itemKey: 'settings/workspace', text: '业务空间', icon: <IconGlobe /> },
        { itemKey: 'settings/alarms', text: '告警', icon: <IconBell /> }
      ]
    }
  ]

  // 根据当前路径确定选中的 nav itemKey
  const getSelectedKey = () => {
    const path = location.pathname.replace(/^\//, '')
    if (!path) return 'dashboard'
    return path
  }

  // 计算当前面包屑
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
    <Layout style={{ minHeight: 'screen', background: '#f9fafb' }}>
      {/* 顶部 Header：云平台风格 */}
      <Header style={{
        height: '60px',
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        position: 'sticky',
        top: 0,
        zIndex: 1000
      }}>
        {/* 左侧：Logo、切换区 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {/* Logo 区域 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => navigate('/')}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'linear-gradient(135deg, #0066ff 0%, #00ccff 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontWeight: 'bold',
              fontSize: '16px'
            }}>
              M
            </div>
            <span style={{ fontSize: '16px', fontWeight: 600, color: '#111827' }}>
              {companyName}
            </span>
            <span style={{
              fontSize: '14px',
              color: '#6b7280',
              borderLeft: '1px solid #d1d5db',
              paddingLeft: '8px',
              marginLeft: '4px'
            }}>
              开放平台
            </span>
          </div>

          {/* 业务空间切换 Dropdown */}
          <Dropdown
            trigger="click"
            render={
              <Dropdown.Menu style={{ width: '180px' }}>
                <Dropdown.Item onClick={() => setActiveWorkspace('默认业务空间')}>
                  默认业务空间
                </Dropdown.Item>
                <Dropdown.Item onClick={() => setActiveWorkspace('测试工作区')}>
                  测试工作区
                </Dropdown.Item>
                <Dropdown.Item onClick={() => setActiveWorkspace('生产应用空间')}>
                  生产应用空间
                </Dropdown.Item>
              </Dropdown.Menu>
            }
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#f3f4f6',
              padding: '6px 12px',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              color: '#374151',
              transition: 'background-color 0.2s'
            }}>
              <span style={{ color: '#9ca3af' }}>当前业务空间</span>
              <span style={{ fontWeight: 500 }}>{activeWorkspace}</span>
              <IconChevronDown style={{ fontSize: '12px', color: '#6b7280' }} />
            </div>
          </Dropdown>
        </div>

        {/* 右侧：辅助链接与用户头像 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <Button theme="borderless" icon={<IconLanguage />} style={{ color: '#4b5563' }} />
          <Button theme="borderless" icon={<IconHelpCircle />} style={{ color: '#4b5563' }} />
          
          <span style={{ fontSize: '13px', color: '#4b5563', marginRight: '4px' }}>体验</span>
          <span style={{ fontSize: '13px', color: '#4b5563', marginRight: '4px' }}>模型</span>
          <span style={{ fontSize: '13px', color: '#4b5563', marginRight: '4px' }}>文档</span>

          {/* 用户头像 Dropdown */}
          <Dropdown
            trigger="click"
            position="bottomRight"
            render={
              <Dropdown.Menu style={{ width: '160px' }}>
                <Dropdown.Item>个人中心</Dropdown.Item>
                <Dropdown.Item>企业认证</Dropdown.Item>
                <Dropdown.Divider />
                <Dropdown.Item style={{ color: '#ef4444' }}>退出登录</Dropdown.Item>
              </Dropdown.Menu>
            }
          >
            <Avatar size="small" color="blue" style={{ cursor: 'pointer' }}>
              W
            </Avatar>
          </Dropdown>
        </div>
      </Header>

      <Layout>
        {/* 侧边栏 Sider */}
        <Sider style={{ backgroundColor: '#ffffff', borderRight: '1px solid #e5e7eb' }}>
          <Nav
            defaultIsCollapsed={collapsed}
            isCollapsed={collapsed}
            onCollapseChange={(col) => setCollapsed(col)}
            items={navItems}
            selectedKeys={[getSelectedKey()]}
            onSelect={(data) => navigate(`/${String(data.itemKey)}`)}
            style={{ height: 'calc(100vh - 60px)', border: 'none' }}
            footer={{
              collapseButton: true,
            }}
          />
        </Sider>

        {/* 主内容区 Content */}
        <Layout style={{ padding: '24px 32px' }}>
          {/* 面包屑导航 */}
          <Breadcrumb style={{ marginBottom: '16px' }}>
            {getBreadcrumbs().map((b, idx) => (
              <Breadcrumb.Item key={idx}>{b}</Breadcrumb.Item>
            ))}
          </Breadcrumb>

          <Content style={{
            background: '#ffffff',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            padding: '32px',
            minHeight: '480px'
          }}>
            <Outlet />
          </Content>
        </Layout>
      </Layout>
    </Layout>
  )
}
