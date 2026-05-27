import React from 'react'
import { Layout, Button, Dropdown, Avatar, Toast } from '@douyinfe/semi-ui'
import { IconChevronDown, IconHelpCircle } from '@douyinfe/semi-icons'
import { useNavigate } from 'react-router-dom'
import { modelGoLogos } from '@/config/brand-assets'
import { getMarket, getMarketConfig } from '@/lib/market'
import { useAuthStore } from '@/store/auth'
import { switchTenant, logout } from '@/services/auth'
import type { TenantBrief } from '@/types'

const { Header } = Layout
const market = getMarket()
const { companyName } = getMarketConfig(market)

export const DashboardHeader: React.FC = () => {
  const navigate = useNavigate()
  const { account, tenants, activeTenantId, activeWorkspaceId, setAuth, clearAuth } = useAuthStore()

  const activeTenant = tenants.find((t) => t.tenant_id === activeTenantId)
  const avatarLetter = (account?.display_name || account?.email || 'U').charAt(0).toUpperCase()

  async function handleSwitchTenant(tenant: TenantBrief) {
    if (tenant.tenant_id === activeTenantId) return
    try {
      await switchTenant({ tenant_id: tenant.tenant_id })
      setAuth(account!, tenant.tenant_id, tenants, activeWorkspaceId ?? undefined)
    } catch {
      Toast.error('切换组织失败')
    }
  }

  async function handleLogout() {
    try {
      await logout()
    } finally {
      clearAuth()
      navigate('/login', { replace: true })
    }
  }

  return (
    <Header style={{
      height: '60px',
      background: 'rgba(255, 255, 255, 0.75)',
      borderBottom: '1px solid rgba(226, 232, 240, 0.7)',
      boxShadow: '0 1px 3px 0 rgba(15, 23, 42, 0.02)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 28px',
      position: 'sticky',
      top: 0,
      zIndex: 1000,
      backdropFilter: 'blur(12px) saturate(190%)',
      WebkitBackdropFilter: 'blur(12px) saturate(190%)',
    }}>
      {/* 左侧：Logo + 租户切换 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
          onClick={() => navigate('/')}
        >
          <img
            src={modelGoLogos[market]}
            alt="ModelGo"
            style={{ width: '30px', height: '30px', objectFit: 'contain' }}
          />
          <span style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', letterSpacing: '-0.02em' }}>
            {companyName}
          </span>
          <span style={{
            fontSize: '13px',
            color: '#94a3b8',
            borderLeft: '1px solid rgba(226, 232, 240, 0.8)',
            paddingLeft: '10px',
            marginLeft: '2px',
            fontWeight: 500,
          }}>
            开放平台
          </span>
        </div>

        {/* 租户切换 */}
        <Dropdown
          trigger="click"
          render={
            <Dropdown.Menu style={{ width: '200px', borderRadius: '10px', padding: '6px' }}>
              {tenants.map((tenant) => (
                <Dropdown.Item
                  key={tenant.tenant_id}
                  onClick={() => handleSwitchTenant(tenant)}
                  style={{
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: tenant.tenant_id === activeTenantId ? 600 : 400,
                    color: tenant.tenant_id === activeTenantId ? 'var(--semi-color-primary)' : '#334155',
                  }}
                >
                  {tenant.name}
                </Dropdown.Item>
              ))}
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
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = '#ffffff'
            ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(59, 130, 246, 0.5)'
            ;(e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.08)'
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc'
            ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(226, 232, 240, 0.8)'
            ;(e.currentTarget as HTMLElement).style.boxShadow = 'none'
          }}
          >
            <span style={{ color: '#64748b', fontWeight: 400 }}>当前组织</span>
            <span style={{ fontWeight: 600, color: '#0f172a' }}>{activeTenant?.name ?? '—'}</span>
            <IconChevronDown style={{ fontSize: '10px', color: '#64748b' }} />
          </div>
        </Dropdown>
      </div>

      {/* 右侧：文档链接 + 用户头像 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <Button
          theme="borderless"
          icon={<IconHelpCircle />}
          style={{ color: '#475569' }}
          onClick={() => window.open('https://docs.modelgo.com', '_blank')}
        />

        <Dropdown
          trigger="click"
          position="bottomRight"
          render={
            <Dropdown.Menu style={{ width: '170px', borderRadius: '10px', padding: '6px' }}>
              <div style={{ padding: '8px 12px 6px', borderBottom: '1px solid #f1f5f9', marginBottom: '4px' }}>
                <div style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a' }}>
                  {account?.display_name || '—'}
                </div>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
                  {account?.email}
                </div>
              </div>
              <Dropdown.Item
                onClick={() => navigate('/settings/account')}
                style={{ borderRadius: '6px', fontSize: '13px' }}
              >
                账号设置
              </Dropdown.Item>
              <Dropdown.Divider />
              <Dropdown.Item
                onClick={handleLogout}
                style={{ color: '#ef4444', borderRadius: '6px', fontSize: '13px' }}
              >
                退出登录
              </Dropdown.Item>
            </Dropdown.Menu>
          }
        >
          <Avatar
            src={account?.avatar_url ?? undefined}
            size="small"
            style={{
              cursor: 'pointer',
              backgroundColor: 'var(--semi-color-primary)',
              boxShadow: '0 0 0 2px rgba(24, 144, 255, 0.15)',
            }}
          >
            {avatarLetter}
          </Avatar>
        </Dropdown>
      </div>
    </Header>
  )
}
