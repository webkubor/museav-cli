import React from 'react'
import { Layout, Nav } from '@douyinfe/semi-ui'
import { useTranslation } from 'react-i18next'

const { Sider } = Layout

type NavItem = {
  itemKey: string
  text: string
  icon: React.ReactNode
  items?: NavItem[]
}

interface DashboardSidebarProps {
  collapsed: boolean
  setCollapsed: (c: boolean) => void
  selectedKey: string
  onSelect: (data: { itemKey: string | number }) => void
  tenantNavItems: NavItem[]
  workspaceNavItems: NavItem[]
}

const WORKSPACE_KEYS = ['api-keys', 'guardrails', 'observability', 'invitations-mgmt']

export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  collapsed,
  setCollapsed,
  selectedKey,
  onSelect,
  tenantNavItems,
  workspaceNavItems
}) => {
  const { t } = useTranslation()
  const isWorkspaceSelected = WORKSPACE_KEYS.includes(selectedKey)

  return (
    <Sider style={{
      backgroundColor: 'var(--semi-color-bg-0)',
      borderRight: '1px solid var(--semi-color-fill-0)',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)' }}>
        {/* Tenant 级导航 */}
        <Nav
          isCollapsed={collapsed}
          items={tenantNavItems}
          selectedKeys={isWorkspaceSelected ? [] : [selectedKey]}
          onSelect={(data) => onSelect({ itemKey: data.itemKey })}
          style={{ border: 'none', paddingTop: '8px', flex: 'none' }}
        />

        {/* 工作区分隔线 */}
        <div style={{
          padding: collapsed ? '8px 0' : '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          overflow: 'hidden',
        }}>
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--semi-color-fill-0)' }} />
          {!collapsed && (
            <span style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--semi-color-text-2)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>
              {t('nav.sidebarWorkspace')}
            </span>
          )}
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--semi-color-fill-0)' }} />
        </div>

        {/* Workspace 级导航 */}
        <Nav
          isCollapsed={collapsed}
          items={workspaceNavItems}
          selectedKeys={isWorkspaceSelected ? [selectedKey] : []}
          onSelect={(data) => onSelect({ itemKey: data.itemKey })}
          style={{ border: 'none', flex: 1 }}
          footer={{ collapseButton: true }}
          onCollapseChange={(col) => setCollapsed(col)}
        />
      </div>
    </Sider>
  )
}
