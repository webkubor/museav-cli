import React, { useState, useRef, useEffect } from 'react'
import { LuSettings, LuChevronLeft, LuChevronRight } from 'react-icons/lu'

import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { SidebarSettingsPopup } from './SidebarSettingsPopup'

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

const WORKSPACE_KEYS = ['api-keys', 'guardrails', 'observability', 'settings/workspace', 'chat-test', 'platform-config']
const SETTINGS_KEYS = ['settings', 'settings/account', 'settings/organization']

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
        "group flex items-center gap-3 mx-2 my-0.5 px-3.5 py-2.5 rounded-lg cursor-pointer transition-all duration-300 select-none outline-none focus-visible:ring-1 focus-visible:ring-brand-glow relative",
        collapsed ? "justify-center" : "justify-start",
        isSelected
          ? "bg-brand-selected-bg text-brand-base font-bold shadow-sm shadow-brand-glow/5"
          : "text-mg-text-1 hover:bg-mg-fill-0/50 hover:text-mg-text-0 active:scale-[0.96] hover:translate-x-[2px]"
      )}
    >
      {/* 渐变流动指示线：选中时悬浮在最左边缘 */}
      {isSelected && (
        <span className="absolute left-0 top-[20%] bottom-[20%] w-[2.5px] rounded-r-md pointer-events-none bg-gradient-to-b from-brand-base to-brand-mid dark:shadow-[0_0_6px_var(--brand-glow)]" />
      )}
      <span className={cn(
        "text-base shrink-0 transition-all duration-300 ease-out",
        isSelected ? "text-brand-base scale-110" : "text-mg-text-2 group-hover:text-mg-text-0 group-hover:scale-105 group-hover:translate-x-[1.5px]"
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
            isChildSelected ? "text-brand-base scale-110" : "text-mg-text-2 group-hover:text-mg-text-0 group-hover:scale-105 group-hover:translate-x-[1px]"
          )}>
            {item.icon}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0.5 relative">
      {/* 展开相邻主菜单时，垂直连通这两个主菜单图标的渐变流动垂线 */}
      {item.items && isOpen && (
        <div 
          className="absolute left-[30px] w-[2px] sidebar-flow-line pointer-events-none rounded-full"
          style={{
            top: '28px',
            bottom: '-20px',
            zIndex: 10,
          }}
        />
      )}

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
            isChildSelected ? "text-brand-base scale-110" : "text-mg-text-2 group-hover:text-mg-text-0 group-hover:scale-105 group-hover:translate-x-[1.5px]"
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

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  if (collapsed) return null

  const timeStr = time.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })

  const offset = -time.getTimezoneOffset() / 60
  const zoneStr = `GMT${offset >= 0 ? '+' : ''}${offset}`

  return (
    <div className="mx-4 mt-3 mb-6 flex flex-col gap-1.5 select-none text-mg-text-2">
      {/* 第一行：版本和在线健康度 */}
      <div className="flex items-center justify-between text-[11px] font-mono">
        <div className="flex items-center gap-1.5 font-semibold">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
          </span>
          <span className="tracking-wide">v{__APP_VERSION__}</span>
        </div>
        <span className="opacity-80 font-bold uppercase text-[9px] text-mg-success tracking-widest">ONLINE</span>
      </div>

      {/* 第二行：时间与时区 */}
      <div className="flex items-center justify-between text-[11px] font-mono border-t border-mg-border/25 pt-1.5">
        <span className="tabular-nums text-mg-text-1 hover:text-mg-text-0 transition-colors">{timeStr}</span>
        <span className="px-1 py-0.5 rounded bg-mg-fill-1 text-[9px] text-mg-text-2 tracking-wide font-bold">{zoneStr}</span>
      </div>
    </div>
  )
}

/**
 * 侧边栏底部设置按钮（向上弹出/向右弹出菜单）
 */
const SidebarSettingsButton: React.FC<{
  collapsed: boolean
  selectedKey: string
  onSelect: (data: { itemKey: string | number }) => void
  label: string
  accountLabel: string
  orgLabel: string
}> = ({ collapsed, selectedKey, onSelect, label, accountLabel, orgLabel }) => {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleItemClick = (key: string) => {
    onSelect({ itemKey: key })
    setIsOpen(false)
  }

  const isSelected = selectedKey.startsWith('settings')

  return (
    <div ref={containerRef} className="relative z-[60]">
      {/* 触发按钮 */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            setIsOpen(!isOpen)
          }
        }}
        className={cn(
          "group flex items-center gap-3 mx-2 my-0.5 px-3.5 py-2.5 rounded-lg cursor-pointer transition-all duration-300 select-none outline-none focus-visible:ring-1 focus-visible:ring-brand-glow justify-between",
          isSelected
            ? "bg-brand-selected-bg text-brand-base font-bold shadow-sm shadow-brand-glow/5"
            : "text-mg-text-1 hover:bg-mg-fill-0/50 hover:text-mg-text-0 active:scale-[0.96] hover:translate-x-[2px]"
        )}
      >
        <div className={cn("flex items-center gap-3 min-w-0", collapsed && "w-full justify-center")}>
          <span className={cn(
            "text-base shrink-0 transition-transform duration-500 ease-out",
            isSelected ? "text-brand-base scale-110" : "text-mg-text-2 group-hover:text-mg-text-0 group-hover:rotate-[60deg]"
          )}>
            <LuSettings />
          </span>
          {!collapsed && (
            <span className="text-[15px] truncate tracking-tight font-medium leading-none">
              {label}
            </span>
          )}
        </div>
        {!collapsed && (
          <span className={cn(
            "text-mg-text-2 shrink-0 transition-all duration-300 ml-2",
            isOpen ? "rotate-90 text-brand-base" : "group-hover:text-mg-text-0"
          )}>
            <LuChevronRight size={14} />
          </span>
        )}
      </div>

      <SidebarSettingsPopup
        isOpen={isOpen}
        collapsed={collapsed}
        selectedKey={selectedKey}
        accountLabel={accountLabel}
        orgLabel={orgLabel}
        handleItemClick={handleItemClick}
      />
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
  settingsLabel,
}) => {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState(false)
  const [workspaceOpen, setWorkspaceOpen] = useState(true)
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

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

        {/* 工作区折叠标题 */}
        <div 
          role="button"
          onClick={() => !collapsed && setWorkspaceOpen(!workspaceOpen)}
          className={cn(
            "flex items-center gap-2 py-4 select-none px-4 group/section justify-between transition-colors",
            !collapsed && "cursor-pointer hover:text-mg-text-0",
            collapsed && "px-2 pointer-events-none"
          )}
        >
          <div className="flex-1 h-[1px] bg-mg-border/40" />
          {!collapsed && (
            <span className="text-[11px] font-bold text-mg-text-2/80 tracking-wider uppercase whitespace-nowrap shrink-0 flex items-center gap-1 group-hover/section:text-mg-text-1 transition-colors">
              {t('nav.sidebarWorkspace')}
              <LuChevronRight 
                size={11} 
                className={cn(
                  "transition-transform duration-300 text-mg-text-2", 
                  workspaceOpen ? "rotate-90 text-brand-base" : "rotate-0"
                )} 
              />
            </span>
          )}
          <div className="flex-1 h-[1px] bg-mg-border/40" />
        </div>

        {/* Workspace 级导航 */}
        <div 
          className={cn(
            "relative flex flex-col gap-0.5 transition-all duration-300 overflow-hidden flex-1",
            (!collapsed && !workspaceOpen) ? "max-h-0 opacity-0 pointer-events-none" : "max-h-[500px] opacity-100"
          )}
        >
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
                isSelected={isWorkspaceSelected && selectedKey === item.itemKey}
                onClick={() => onSelect({ itemKey: item.itemKey })}
              />
            )
          })}
        </div>
      </div>

      {/* 底部设置及版本信息 */}
      <div className="pt-2 border-t border-mg-border/40 bg-mg-bg-0 shrink-0 relative">
        <SidebarSettingsButton
          collapsed={collapsed}
          selectedKey={selectedKey}
          onSelect={onSelect}
          label={settingsLabel}
          accountLabel={t('nav.account')}
          orgLabel={t('nav.organization')}
        />

        <SidebarFooterInfo collapsed={collapsed} />
      </div>
    </aside>
  )
}
