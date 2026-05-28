import React, { useState, useRef } from 'react'
import { Layout, Nav } from '@douyinfe/semi-ui'
import { LuSettings, LuChevronLeft, LuChevronRight } from 'react-icons/lu'
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
  sandboxNavItems: NavItem[]
  settingsLabel: string
}

const WORKSPACE_KEYS = ['api-keys', 'guardrails', 'observability', 'invitations-mgmt', 'api-playground', 'chat-test']
const SETTINGS_KEYS = ['settings', 'settings/account', 'settings/workspace', 'settings/organization']

const SANDBOX_KEYS = ['api-playground', 'chat-test']

export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  collapsed,
  setCollapsed,
  selectedKey,
  onSelect,
  tenantNavItems,
  workspaceNavItems,
  sandboxNavItems,
  settingsLabel,
}) => {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState(false)
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const isSandboxSelected = SANDBOX_KEYS.includes(selectedKey)
  const isWorkspaceSelected = WORKSPACE_KEYS.includes(selectedKey)
  const isSettingsSelected = SETTINGS_KEYS.includes(selectedKey)

  const onEnter = () => { clearTimeout(leaveTimer.current); setHovered(true) }
  const onLeave = () => { leaveTimer.current = setTimeout(() => setHovered(false), 150) }

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
      position: 'relative',
      overflow: 'visible',
      backgroundColor: 'var(--semi-color-bg-0)',
      borderRight: '1px solid var(--semi-color-fill-0)',
      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    }}>
      {/* 右边缘折叠触发器 */}
      <button
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? t('common.expand') : t('common.collapse')}
        style={{
          position: 'absolute',
          right: -12,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: 'var(--semi-color-bg-0)',
          border: '1px solid var(--semi-color-border)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.2s',
          zIndex: 10,
          boxShadow: '0 1px 6px rgba(0,0,0,0.1)',
          padding: 0,
          color: 'var(--semi-color-text-2)',
        }}
      >
        {collapsed
          ? <LuChevronRight size={13} />
          : <LuChevronLeft size={13} />
        }
      </button>

      <div
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)' }}
      >
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
          selectedKeys={isWorkspaceSelected && !isSandboxSelected ? [selectedKey] : []}
          onSelect={(data) => onSelect({ itemKey: data.itemKey })}
          style={{ border: 'none', flex: 'none' }}
        />

        {/* 测试区分隔线 */}
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
              测试区
            </span>
          )}
          <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--semi-color-fill-0)' }} />
        </div>

        {/* 测试区导航 */}
        <Nav
          isCollapsed={collapsed}
          items={sandboxNavItems}
          selectedKeys={isSandboxSelected ? [selectedKey] : []}
          onSelect={(data) => onSelect({ itemKey: data.itemKey })}
          style={{ border: 'none', flex: 1 }}
        />

        {/* 底部：Settings + 版本号 */}
        <div style={{ borderTop: '1px solid var(--semi-color-fill-0)', padding: '6px 0 0' }}>
          <div
            role="button"
            onClick={() => onSelect({ itemKey: 'settings/account' })}
            style={{
              ...rowBase,
              backgroundColor: isSettingsSelected ? 'var(--semi-color-primary-light-default)' : undefined,
              color: isSettingsSelected ? 'var(--semi-color-primary)' : 'var(--semi-color-text-1)',
            }}
          >
            <LuSettings size={16} style={{ flexShrink: 0 }} />
            {!collapsed && (
              <span style={{ fontSize: '14px', fontWeight: isSettingsSelected ? 600 : 400 }}>
                {settingsLabel}
              </span>
            )}
          </div>

          {!collapsed && (
            <div style={{
              padding: '4px 20px 8px',
              fontSize: '11px',
              color: 'var(--semi-color-text-2)',
              opacity: 0.45,
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
