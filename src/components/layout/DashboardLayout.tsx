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
      {/* 顶部 Header：极致高级感轻拟物磨砂玻璃 */}
      <Header style={{
        height: '60px',
        background: 'rgba(255, 255, 255, 0.75)',
        borderBottom: '1px solid rgba(226, 232, 240, 0.7)',
        boxShadow: '0 1px 3px 0 rgba(15, 23, 42, 0.02), 0 1px 0px 0 rgba(15, 23, 42, 0.03)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 28px',
        position: 'sticky',
        top: 0,
        zIndex: 1000,
        backdropFilter: 'blur(12px) saturate(190%)',
        WebkitBackdropFilter: 'blur(12px) saturate(190%)',
        transition: 'all 0.3s ease'
      }}>
        {/* 左侧：Logo、切换区 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
          {/* Logo 区域：大厂拟物渐变微凸感 + 慢流光 */}
          <div 
            style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }} 
            onClick={() => navigate('/')}
          >
            <div 
              className="logo-flow-light"
              style={{
                width: '30px',
                height: '30px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #096dd9 0%, #1890ff 50%, #00d2ff 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                fontWeight: 800,
                fontSize: '15px',
                boxShadow: '0 4px 12px rgba(24, 144, 255, 0.25), inset 0 1px 1px rgba(255,255,255,0.4)',
                textShadow: '0 1px 2px rgba(0,0,0,0.1)'
              }}
            >
              M
            </div>
            <span style={{ 
              fontSize: '15px', 
              fontWeight: 700, 
              color: '#0f172a',
              letterSpacing: '-0.02em'
            }}>
              {companyName}
            </span>
            <span style={{
              fontSize: '13px',
              color: '#94a3b8',
              borderLeft: '1px solid rgba(226, 232, 240, 0.8)',
              paddingLeft: '10px',
              marginLeft: '2px',
              fontWeight: 500
            }}>
              开放平台
            </span>
          </div>

          {/* 业务空间切换 Dropdown：更雅致的胶囊状态选择器 */}
          <Dropdown
            trigger="click"
            render={
              <Dropdown.Menu style={{ width: '190px', borderRadius: '10px', padding: '6px' }}>
                <Dropdown.Item onClick={() => setActiveWorkspace('默认业务空间')} style={{ borderRadius: '6px', fontSize: '13px' }}>
                  默认业务空间
                </Dropdown.Item>
                <Dropdown.Item onClick={() => setActiveWorkspace('测试工作区')} style={{ borderRadius: '6px', fontSize: '13px' }}>
                  测试工作区
                </Dropdown.Item>
                <Dropdown.Item onClick={() => setActiveWorkspace('生产应用空间')} style={{ borderRadius: '6px', fontSize: '13px' }}>
                  生产应用空间
                </Dropdown.Item>
              </Dropdown.Menu>
            }
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              backgroundColor: '#f8fafc',
              padding: '6px 14px',
              borderRadius: '20px',
              cursor: 'pointer',
              fontSize: '12px',
              color: '#334155',
              border: '1px solid rgba(226, 232, 240, 0.8)',
              boxShadow: '0 1px 2px rgba(0, 0, 0, 0.01)',
              transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#ffffff';
              e.currentTarget.style.borderColor = 'rgba(59, 130, 246, 0.5)';
              e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.08)';
              e.currentTarget.style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = '#f8fafc';
              e.currentTarget.style.borderColor = 'rgba(226, 232, 240, 0.8)';
              e.currentTarget.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.01)';
              e.currentTarget.style.transform = 'none';
            }}
            >
              <span style={{ color: '#64748b', fontWeight: 400 }}>当前业务空间</span>
              <span style={{ fontWeight: 600, color: '#0f172a' }}>{activeWorkspace}</span>
              <IconChevronDown style={{ fontSize: '10px', color: '#64748b' }} />
            </div>
          </Dropdown>
        </div>

        {/* 右侧：更高级的微质感菜单与用户头像 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{ display: 'flex', gap: '18px', marginRight: '8px' }}>
            {['体验', '模型', '文档'].map((linkText) => (
              <span 
                key={linkText} 
                style={{ 
                  fontSize: '13px', 
                  color: '#475569', 
                  fontWeight: 500, 
                  cursor: 'pointer',
                  transition: 'color 0.2s ease'
                }}
                onMouseEnter={(e) => e.currentTarget.style.color = '#0066ff'}
                onMouseLeave={(e) => e.currentTarget.style.color = '#475569'}
              >
                {linkText}
              </span>
            ))}
          </div>

          <Button theme="borderless" icon={<IconLanguage />} style={{ color: '#475569' }} />
          <Button theme="borderless" icon={<IconHelpCircle />} style={{ color: '#475569' }} />

          {/* 用户头像 Dropdown */}
          <Dropdown
            trigger="click"
            position="bottomRight"
            render={
              <Dropdown.Menu style={{ width: '170px', borderRadius: '10px', padding: '6px' }}>
                <Dropdown.Item style={{ borderRadius: '6px', fontSize: '13px' }}>个人中心</Dropdown.Item>
                <Dropdown.Item style={{ borderRadius: '6px', fontSize: '13px' }}>企业认证</Dropdown.Item>
                <Dropdown.Divider />
                <Dropdown.Item style={{ color: '#ef4444', borderRadius: '6px', fontSize: '13px' }}>退出登录</Dropdown.Item>
              </Dropdown.Menu>
            }
          >
            <Avatar 
              size="small" 
              color="blue" 
              style={{ 
                cursor: 'pointer',
                boxShadow: '0 0 0 2px rgba(24, 144, 255, 0.15), 0 2px 4px rgba(0,0,0,0.06)',
                transition: 'transform 0.2s ease'
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'scale(1.05)';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.transform = 'none';
              }}
            >
              W
            </Avatar>
          </Dropdown>
        </div>
      </Header>

      <Layout>
        {/* 侧边栏 Sider：极简高雅黑线 + 弹性动画 */}
        <Sider style={{ 
          backgroundColor: '#ffffff', 
          borderRight: '1px solid rgba(241, 245, 249, 0.8)',
          transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
        }}>
          <Nav
            defaultIsCollapsed={collapsed}
            isCollapsed={collapsed}
            onCollapseChange={(col) => setCollapsed(col)}
            items={navItems}
            selectedKeys={[getSelectedKey()]}
            onSelect={(data) => navigate(`/${String(data.itemKey)}`)}
            style={{ 
              height: 'calc(100vh - 60px)', 
              border: 'none',
              paddingTop: '8px'
            }}
            footer={{
              collapseButton: true,
            }}
          />
        </Sider>

        {/* 主内容区 Content */}
        <Layout style={{ padding: '28px 36px', transition: 'all 0.3s ease' }}>
          {/* 面包屑导航：增加小写轻量感 */}
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
