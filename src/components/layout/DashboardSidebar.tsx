import React from 'react'
import { Layout, Nav } from '@douyinfe/semi-ui'

const { Sider } = Layout

interface DashboardSidebarProps {
  collapsed: boolean
  setCollapsed: (c: boolean) => void
  selectedKey: string
  onSelect: (data: { itemKey: string | number }) => void
  navItems: Array<{
    itemKey: string
    text: string
    icon: React.ReactNode
    items?: Array<{ itemKey: string; text: string; icon: React.ReactNode }>
  }>
}

export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  collapsed,
  setCollapsed,
  selectedKey,
  onSelect,
  navItems
}) => {
  return (
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
        selectedKeys={[selectedKey]}
        onSelect={(data) => onSelect({ itemKey: data.itemKey })}
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
  )
}
