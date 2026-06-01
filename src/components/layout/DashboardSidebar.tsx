import React, { useState, useRef } from 'react'
import { LuSettings, LuChevronLeft, LuChevronRight, LuGlobe } from 'react-icons/lu'

import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

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

const WORKSPACE_KEYS = ['api-keys', 'guardrails', 'observability', 'invitations-mgmt', 'chat-test']
const SETTINGS_KEYS = ['settings', 'settings/account', 'settings/workspace', 'settings/organization']
const SANDBOX_KEYS = ['platform-config']

/**
 * 极简高颜值自定义 Sidebar 导航单项
 */
const SidebarNavItem: React.FC<{
  item: NavItem
  collapsed: boolean
  isSelected: boolean
  onClick: () => void
}> = ({ item, collapsed, isSelected, onClick }) => {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick()
        }
      }}
      className={cn(
        "group flex items-center gap-3 mx-2 my-0.5 px-3.5 py-2.5 rounded-lg cursor-pointer transition-all duration-300 select-none outline-none focus-visible:ring-1 focus-visible:ring-brand-glow",
        collapsed ? "justify-center" : "justify-start",
        isSelected
          ? "bg-brand-selected-bg text-brand-base font-bold shadow-sm shadow-brand-glow/5"
          : "text-mg-text-1 hover:bg-mg-fill-0/50 hover:text-mg-text-0 active:scale-[0.96] hover:translate-x-[2px]"
      )}
    >
      <span className={cn(
        "text-base shrink-0 transition-all duration-300 ease-out",
        isSelected ? "text-brand-base scale-110" : "text-mg-text-2 group-hover:text-mg-text-0 group-hover:scale-115 group-hover:rotate-[8deg]"
      )}>
        {item.icon}
      </span>
      {!collapsed && (
        <span className={cn(
          "text-[15px] truncate tracking-tight font-medium leading-none transition-transform duration-300 ease-out",
          isSelected ? "translate-x-0.5" : "group-hover:translate-x-0.5"
        )}>
          {item.text}
        </span>
      )}
    </div>
  )
}

/**
 * 支持折叠与展开的子菜单组组件 (SidebarMenuGroup)
 */
const SidebarMenuGroup: React.FC<{
  item: NavItem
  collapsed: boolean
  selectedKey: string
  onSelect: (data: { itemKey: string | number }) => void
}> = ({ item, collapsed, selectedKey, onSelect }) => {
  const isChildSelected = item.items?.some(sub => selectedKey === sub.itemKey) ?? false
  const [isOpen, setIsOpen] = useState(isChildSelected)

  if (collapsed) {
    return (
      <div className="flex flex-col gap-0.5">
        <div
          role="button"
          className={cn(
            "group flex items-center justify-center mx-2 my-0.5 px-3.5 py-2.5 rounded-lg cursor-pointer text-mg-text-2 hover:bg-mg-fill-0/50 hover:text-mg-text-0 active:scale-[0.96] transition-all duration-300",
            isChildSelected && "bg-brand-selected-bg text-brand-base font-bold shadow-sm shadow-brand-glow/5"
          )}
          title={item.text}
          onClick={() => {
            // 点击后自动跳转到首个子项
            if (item.items?.[0]) {
              onSelect({ itemKey: item.items[0].itemKey })
            }
          }}
        >
          <span className={cn(
            "text-base shrink-0 transition-all duration-300 ease-out",
            isChildSelected ? "text-brand-base scale-110" : "text-mg-text-2 group-hover:text-mg-text-0 group-hover:scale-115 group-hover:rotate-[8deg]"
          )}>
            {item.icon}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0.5">
      {/* 文件夹父级 Trigger */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsOpen(!isOpen) }}
        className={cn(
          "group flex items-center justify-between mx-2 my-0.5 px-3.5 py-2.5 rounded-lg cursor-pointer transition-all duration-300 select-none outline-none text-mg-text-1 hover:bg-mg-fill-0/50 hover:text-mg-text-0 active:scale-[0.98]",
          isChildSelected && "text-brand-base font-bold"
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={cn(
            "text-base shrink-0 transition-all duration-300 ease-out",
            isChildSelected ? "text-brand-base scale-110" : "text-mg-text-2 group-hover:text-mg-text-0 group-hover:scale-115 group-hover:rotate-[8deg]"
          )}>
            {item.icon}
          </span>
          <span className="text-[15px] truncate tracking-tight font-medium leading-none">
            {item.text}
          </span>
        </div>
        <span className={cn(
          "text-mg-text-2 shrink-0 transition-all duration-300 ml-2",
          isOpen ? "rotate-90 text-brand-base" : "group-hover:text-mg-text-0"
        )}>
          <LuChevronRight size={14} />
        </span>
      </div>

      {/* 子项列表 ( Indented ) - 物理高度弹性折叠 */}
      {item.items && (
        <div 
          className={cn(
            "sidebar-submenu-container",
            isOpen && "open"
          )}
        >
          <div className="min-h-0 flex flex-col pl-4 ml-7 gap-1 relative">
            {/* 展开时才显示的、高颜值流动渐变指示竖线：起点终点完美契合子菜单首尾 */}
            <div className="absolute left-0 top-2.5 bottom-2.5 w-[1.5px] sidebar-flow-line pointer-events-none rounded-full" />
            {item.items.map((sub) => {
              const isSubSelected = selectedKey === sub.itemKey
              return (
                <div
                  key={sub.itemKey}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect({ itemKey: sub.itemKey })}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect({ itemKey: sub.itemKey }) }}
                  className={cn(
                    "flex items-center gap-3 px-3.5 py-2.5 rounded-lg cursor-pointer transition-all duration-150 select-none outline-none",
                    isSubSelected
                      ? "text-brand-base font-bold bg-brand-selected-bg/60"
                      : "text-mg-text-1 hover:text-mg-text-0 hover:bg-mg-fill-0/30 active:scale-[0.98] hover:translate-x-[2px]"
                  )}
                >
                  <span className="text-[14px] truncate tracking-tight font-medium leading-none">
                    {sub.text}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * 侧边栏底部信息：高颜值系统状态面板（版本、时区、实时时间）
 */
const SidebarFooterInfo: React.FC<{ collapsed: boolean }> = ({ collapsed }) => {
  const [time, setTime] = useState(new Date())

  React.useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  if (collapsed) return null

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  const city = tz.split('/').pop()?.replace(/_/g, ' ') || 'Local'
  const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })

  return (
    <div className="mx-3 mt-2 mb-6 p-3.5 rounded-2xl bg-mg-fill-0/20 border border-mg-border/30 flex flex-col gap-3 group transition-all duration-500 hover:bg-mg-fill-0/40 hover:border-brand-base/20 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] font-bold text-mg-text-3 uppercase tracking-widest leading-none">System Version</span>
          <span className="text-[11px] font-black font-mono text-mg-text-0 tracking-tight">
            v{__APP_VERSION__}
          </span>
        </div>
        <div className="w-8 h-8 rounded-xl bg-mg-bg-1 border border-mg-border/50 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
           <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
        </div>
      </div>

      <div className="h-px w-full bg-gradient-to-r from-transparent via-mg-border/50 to-transparent" />

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1 rounded-md bg-mg-bg-1 text-mg-text-2 group-hover:text-brand-base transition-colors">
            <LuGlobe size={11} />
          </div>
          <span className="text-[10px] font-bold text-mg-text-2 uppercase truncate group-hover:text-mg-text-1" title={tz}>
            {city}
          </span>
        </div>
        <div className="font-mono text-[11px] font-bold text-brand-base tabular-nums">
          {timeStr}
        </div>
      </div>
    </div>
  )
}

/**
 * 重构后的高颜值自定义 DashboardSidebar 组件
 */
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

  const onEnter = () => {
    clearTimeout(leaveTimer.current)
    setHovered(true)
  }
  
  const onLeave = () => {
    leaveTimer.current = setTimeout(() => setHovered(false), 150)
  }

  return (
    <aside
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      className={cn(
        "relative flex flex-col h-[calc(100vh-60px)] bg-mg-bg-0 border-r border-mg-border/60 transition-all duration-300 ease-out select-none",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* 右边缘微悬浮折叠触发器 */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? t('common.expand') : t('common.collapse')}
        className={cn(
          "absolute right-[-11px] top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-mg-bg-0 border border-mg-border hover:border-brand-mid text-mg-text-2 hover:text-brand-base flex items-center justify-center cursor-pointer transition-all duration-300 z-50 shadow-sm active:scale-90",
          hovered ? "opacity-100 translate-x-0" : "opacity-0 translate-x-[-4px] pointer-events-none"
        )}
      >
        <div className="transition-transform duration-300 group-hover:scale-110">
          {collapsed ? <LuChevronRight size={13} /> : <LuChevronLeft size={13} />}
        </div>
      </button>

      {/* 主导航区 */}
      <div className="flex flex-col flex-1 py-3 overflow-y-auto overflow-x-hidden no-scrollbar">
        {/* Tenant 级导航 */}
        <div className="relative flex flex-col gap-0.5">
          {!collapsed && tenantNavItems.length > 1 && (
            <div className="absolute left-[30px] top-[22px] bottom-[22px] w-px bg-mg-border/35 pointer-events-none" />
          )}
          {tenantNavItems.map((item) => {
            if (item.items && item.items.length > 0) {
              return (
                <SidebarMenuGroup
                  key={item.itemKey}
                  item={item}
                  collapsed={collapsed}
                  selectedKey={selectedKey}
                  onSelect={onSelect}
                />
              )
            }
            return (
              <SidebarNavItem
                key={item.itemKey}
                item={item}
                collapsed={collapsed}
                isSelected={!isWorkspaceSelected && !isSettingsSelected && selectedKey === item.itemKey}
                onClick={() => onSelect({ itemKey: item.itemKey })}
              />
            )
          })}
        </div>

        {/* 工作区分隔线 */}
        <div className={cn("flex items-center gap-2 py-4 select-none", collapsed ? "px-2" : "px-4")}>
          <div className="flex-1 h-[1px] bg-mg-border/40" />
          {!collapsed && (
            <span className="text-[11px] font-bold text-mg-text-2/80 tracking-wider uppercase whitespace-nowrap shrink-0">
              {t('nav.sidebarWorkspace')}
            </span>
          )}
          <div className="flex-1 h-[1px] bg-mg-border/40" />
        </div>

        {/* Workspace 级导航 */}
        <div className="relative flex flex-col gap-0.5">
          {!collapsed && workspaceNavItems.length > 1 && (
            <div className="absolute left-[30px] top-[22px] bottom-[22px] w-px bg-mg-border/35 pointer-events-none" />
          )}
          {workspaceNavItems.map((item) => {
            if (item.items && item.items.length > 0) {
              return (
                <SidebarMenuGroup
                  key={item.itemKey}
                  item={item}
                  collapsed={collapsed}
                  selectedKey={selectedKey}
                  onSelect={onSelect}
                />
              )
            }
            return (
              <SidebarNavItem
                key={item.itemKey}
                item={item}
                collapsed={collapsed}
                isSelected={isWorkspaceSelected && !isSandboxSelected && selectedKey === item.itemKey}
                onClick={() => onSelect({ itemKey: item.itemKey })}
              />
            )
          })}
        </div>

        {/* 测试区分隔线 */}
        <div className={cn("flex items-center gap-2 py-4 select-none", collapsed ? "px-2" : "px-4")}>
          <div className="flex-1 h-[1px] bg-mg-border/40" />
          {!collapsed && (
            <span className="text-[11px] font-bold text-mg-text-2/80 tracking-wider uppercase whitespace-nowrap shrink-0">
              测试区
            </span>
          )}
          <div className="flex-1 h-[1px] bg-mg-border/40" />
        </div>

        {/* 测试区导航 */}
        <div className="relative flex flex-col gap-0.5 flex-1">
          {!collapsed && sandboxNavItems.length > 1 && (
            <div className="absolute left-[30px] top-[22px] bottom-[22px] w-px bg-mg-border/35 pointer-events-none" />
          )}
          {sandboxNavItems.map((item) => {
            if (item.items && item.items.length > 0) {
              return (
                <SidebarMenuGroup
                  key={item.itemKey}
                  item={item}
                  collapsed={collapsed}
                  selectedKey={selectedKey}
                  onSelect={onSelect}
                />
              )
            }
            return (
              <SidebarNavItem
                key={item.itemKey}
                item={item}
                collapsed={collapsed}
                isSelected={isSandboxSelected && selectedKey === item.itemKey}
                onClick={() => onSelect({ itemKey: item.itemKey })}
              />
            )
          })}
        </div>

        {/* 底部设置及版本信息 */}
        <div className="mt-auto pt-2 border-t border-mg-border/40">
          <SidebarNavItem
            item={{
              itemKey: 'settings/account',
              text: settingsLabel,
              icon: <LuSettings />,
            }}
            collapsed={collapsed}
            isSelected={isSettingsSelected}
            onClick={() => onSelect({ itemKey: 'settings/account' })}
          />

          <SidebarFooterInfo collapsed={collapsed} />
        </div>
      </div>
    </aside>
  )
}
