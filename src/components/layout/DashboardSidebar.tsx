import React from 'react'
import { Layout, Nav } from '@douyinfe/semi-ui'
import { IconSetting, IconChevronLeft, IconChevronRight } from '@douyinfe/semi-icons'
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
  settingsLabel: string
}

const WORKSPACE_KEYS = ['api-keys', 'guardrails', 'observability', 'invitations-mgmt']
const SETTINGS_KEYS = ['settings', 'settings/account', 'settings/workspace', 'settings/organization']

export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  collapsed,
  setCollapsed,
  selectedKey,
  onSelect,
  tenantNavItems,
  workspaceNavItems,
  settingsLabel,
}) => {
  const { t } = useTranslation()
  const isWorkspaceSelected = WORKSPACE_KEYS.includes(selectedKey)
  const isSettingsSelected = SETTINGS_KEYS.includes(selectedKey)

  const rowBase: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    margin: '2px 8px',
    padding: collapsed ? '9px 0' : '9px 12px',
    borderRadius: '8px',
    cursor: 'pointer',
    justifyContent: collapsed ? 'center' : 'flex-start',
    transition: 'background 0.15s',
  }

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
          selectedKeys={!isWorkspaceSelected && !isSettingsSelected ? [selectedKey] : []}
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
        />

        {/* 底部固定区：Settings + 折叠按钮 */}
        <div style={{ borderTop: '1px solid var(--semi-color-fill-0)', padding: '6px 0' }}>
          {/* Settings 行 */}
          <div
            role="button"
            onClick={() => onSelect({ itemKey: 'settings/account' })}
            style={{
              ...rowBase,
              backgroundColor: isSettingsSelected ? 'var(--semi-color-primary-light-default)' : undefined,
              color: isSettingsSelected ? 'var(--semi-color-primary)' : 'var(--semi-color-text-1)',
            }}
          >
            <IconSetting style={{ fontSize: '16px', flexShrink: 0 }} />
            {!collapsed && (
              <span style={{ fontSize: '14px', fontWeight: isSettingsSelected ? 600 : 400 }}>
                {settingsLabel}
              </span>
            )}
          </div>

          {/* 折叠/展开按钮 */}
          <div
            role="button"
            onClick={() => setCollapsed(!collapsed)}
            style={{
              ...rowBase,
              color: 'var(--semi-color-text-2)',
            }}
          >
            {collapsed
              ? <IconChevronRight style={{ fontSize: '15px' }} />
              : <IconChevronLeft style={{ fontSize: '15px' }} />
            }
            {!collapsed && (
              <span style={{ fontSize: '13px' }}>{collapsed ? t('common.expand') : t('common.collapse')}</span>
            )}
          </div>

          {/* 版本号 */}
          {!collapsed && (
            <div style={{
              padding: '4px 20px 6px',
              fontSize: '11px',
              color: 'var(--semi-color-text-2)',
              opacity: 0.5,
              userSelect: 'none',
            }}>
              v{__APP_VERSION__}
            </div>
          )}
        </div>
      </div>
    </Sider>
  )
}
