import React from 'react'
import { Layout, Button, Dropdown, Avatar } from '@douyinfe/semi-ui'
import {
  IconChevronDown,
  IconLanguage,
  IconHelpCircle
} from '@douyinfe/semi-icons'
import { modelGoBrandIcons } from '@/config/brand-assets'

const { Header } = Layout

interface DashboardHeaderProps {
  companyName: string
  activeWorkspace: string
  setActiveWorkspace: (w: string) => void
  navigate: (path: string) => void
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  companyName,
  activeWorkspace,
  setActiveWorkspace,
  navigate
}) => {
  return (
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
          <img
            src={modelGoBrandIcons.onLight}
            alt="ModelGo"
            style={{ width: '30px', height: '30px', objectFit: 'contain' }}
          />
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

        {/* 业务空间切换 Dropdown */}
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
            (e.currentTarget as HTMLElement).style.backgroundColor = '#ffffff';
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(59, 130, 246, 0.5)';
            (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.08)';
            (e.currentTarget as HTMLElement).style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc';
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(226, 232, 240, 0.8)';
            (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.01)';
            (e.currentTarget as HTMLElement).style.transform = 'none';
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
              onMouseEnter={(e) => (e.currentTarget as HTMLElement).style.color = '#0066ff'}
              onMouseLeave={(e) => (e.currentTarget as HTMLElement).style.color = '#475569'}
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
  )
}
