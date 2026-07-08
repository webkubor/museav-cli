import React, { useState, useRef } from 'react'
import { LuSettings, LuChevronLeft, LuChevronRight } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { SidebarPromoCarousel } from './SidebarPromoCarousel'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import type { NavItem, NavGroup } from '@/config/nav'

interface DashboardSidebarProps {
  collapsed: boolean
  setCollapsed: (c: boolean) => void
  selectedKey: string
  onSelect: (data: { itemKey: string | number }) => void
  groups: NavGroup[]
  settingsLabel: string
}

const SidebarSystemStatus: React.FC<{ collapsed: boolean }> = ({ collapsed }) => {
  const { t } = useTranslation()
  const buildTime = __BUILD_TIME__.slice(0, 16).replace('T', ' ')
  const buildMode = import.meta.env.MODE.toUpperCase()

  if (collapsed) {
    return (
      <div
        className="flex justify-center pb-3 pt-1"
        title={`v${__APP_VERSION__} · ${buildMode} · ${t('common.online')}`}
      >
        <span className="h-2 w-2 rounded-full bg-mg-success shadow-[0_0_0_3px_color-mix(in_srgb,var(--mg-success)_14%,transparent)]" />
      </div>
    )
  }

  return (
    <div className="mx-3 mb-3 mt-1 px-1.5 py-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate font-mono text-xs leading-none text-mg-text-3">
          v{__APP_VERSION__} · {__BUILD_TAG__ || __BUILD_COMMIT__}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-bold leading-none text-mg-success">
          <span className="h-1.5 w-1.5 rounded-full bg-mg-success" />
          {t('common.online')}
        </span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2 font-mono text-xs leading-none text-mg-text-4">
        <span>{buildMode}</span>
        <span>{buildTime} UTC</span>
      </div>
    </div>
  )
}

/** 分组小标题（左右分隔线 + 居中标题；折叠态只留一条分隔线） */
const SidebarGroupLabel: React.FC<{ text: string; collapsed: boolean }> = ({ text, collapsed }) => (
  <div className={cn('flex items-center gap-2 py-3 select-none px-4', collapsed && 'px-2')}>
    <div className="flex-1 h-[1px] bg-mg-border/40" />
    {!collapsed && (
      <span className="text-xs font-bold text-mg-text-3/80 tracking-wider uppercase whitespace-nowrap shrink-0">
        {text}
      </span>
    )}
    {!collapsed && <div className="flex-1 h-[1px] bg-mg-border/40" />}
  </div>
)

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
      title={collapsed ? item.text : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick()
        }
      }}
      className={cn(
        "group flex items-center gap-3 mx-2 my-0.5 px-3.5 py-2.5 rounded-lg cursor-pointer transition-all duration-300 select-none outline-none focus-visible:ring-1 focus-visible:ring-brand-glow relative border",
        collapsed ? "justify-center" : "justify-start",
        isSelected
          ? "bg-brand-selected-bg text-brand-base font-bold border-brand-base/15 shadow-sm shadow-brand-base/5"
          : "text-mg-text-2 border-transparent hover:bg-mg-fill-0/50 hover:text-mg-text-1 hover:border-mg-border/20 active:scale-[0.96] hover:translate-x-[2px]"
      )}
    >
      <span className={cn(
        "inline-flex items-center justify-center text-base leading-none shrink-0 transition-all duration-300 ease-out",
        isSelected ? "text-brand-base scale-110" : "text-mg-text-3 group-hover:text-mg-text-1 group-hover:scale-105 group-hover:translate-x-[1.5px]"
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
            "group flex items-center justify-center mx-2 my-0.5 px-3.5 py-2.5 rounded-lg cursor-pointer text-mg-text-3 hover:bg-mg-fill-0/50 hover:text-mg-text-1 active:scale-[0.96] transition-all duration-300",
            isChildSelected && "bg-brand-selected-bg text-brand-base font-bold"
          )}
          title={item.text}
          onClick={() => {
            if (item.items?.[0]) {
              onSelect({ itemKey: item.items[0].itemKey })
            }
          }}
        >
          <span className={cn(
            "inline-flex items-center justify-center text-base leading-none shrink-0 transition-all duration-300 ease-out",
            isChildSelected ? "text-brand-base scale-110" : "text-mg-text-3 group-hover:text-mg-text-1 group-hover:scale-105 group-hover:translate-x-[1px]"
          )}>
            {item.icon}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0.5 relative">
      {item.items && isOpen && (
        <div
          className="absolute left-[29px] w-[2px] sidebar-flow-line pointer-events-none rounded-full"
          style={{ top: '36px', bottom: '-20px', zIndex: 10 }}
        />
      )}

      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsOpen(!isOpen) }}
        className={cn(
          "group flex items-center justify-between mx-2 my-0.5 px-3.5 py-2.5 rounded-lg cursor-pointer transition-all duration-300 select-none outline-none text-mg-text-2 hover:bg-mg-fill-0/50 hover:text-mg-text-1 active:scale-[0.98]",
          isChildSelected && "text-brand-base font-bold"
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={cn(
            "inline-flex items-center justify-center text-base leading-none shrink-0 transition-all duration-300 ease-out",
            isChildSelected ? "text-brand-base scale-110" : "text-mg-text-3 group-hover:text-mg-text-1 group-hover:scale-105 group-hover:translate-x-[1.5px]"
          )}>
            {item.icon}
          </span>
          <span className="text-[15px] truncate tracking-tight font-medium leading-none">
            {item.text}
          </span>
        </div>
        <span className={cn(
          "text-mg-text-3 shrink-0 transition-all duration-300 ml-2",
          isOpen ? "rotate-90 text-brand-base" : "group-hover:text-mg-text-1"
        )}>
          <LuChevronRight size={14} />
        </span>
      </div>

      {item.items && (
        <div className={cn("sidebar-submenu-container", isOpen && "open")}>
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
                    "flex items-center gap-3 px-3.5 py-2.5 rounded-lg cursor-pointer transition-all duration-150 select-none outline-none border",
                    isSubSelected
                      ? "text-brand-base font-bold bg-brand-selected-bg/60 border-brand-base/15 shadow-sm shadow-brand-base/5"
                      : "text-mg-text-2 border-transparent hover:text-mg-text-1 hover:bg-mg-fill-0/30 hover:border-mg-border/20 active:scale-[0.98] hover:translate-x-[2px]"
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
 * 底部「设置」入口——直达账号设置。组织/工作区已上升为主入口（企业管理/空间管理），
 * 不再挂在设置弹层里。
 */
const SidebarSettingsButton: React.FC<{
  collapsed: boolean
  selectedKey: string
  onSelect: (data: { itemKey: string | number }) => void
  label: string
}> = ({ collapsed, selectedKey, onSelect, label }) => {
  const isSelected = selectedKey === 'settings' || selectedKey.startsWith('settings/account')

  return (
    <div
      role="button"
      tabIndex={0}
      title={collapsed ? label : undefined}
      onClick={() => onSelect({ itemKey: 'settings/account' })}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onSelect({ itemKey: 'settings/account' }) }}
      className={cn(
        "group flex items-center gap-3 mx-2 my-0.5 px-3.5 py-2.5 rounded-lg cursor-pointer transition-all duration-300 select-none outline-none focus-visible:ring-1 focus-visible:ring-brand-glow border",
        collapsed ? "justify-center" : "justify-start",
        isSelected
          ? "bg-brand-selected-bg text-brand-base font-bold border-brand-base/15 shadow-sm shadow-brand-base/5"
          : "text-mg-text-2 border-transparent hover:bg-mg-fill-0/50 hover:text-mg-text-1 hover:border-mg-border/20 active:scale-[0.96] hover:translate-x-[2px]"
      )}
    >
      <span className={cn(
        "inline-flex items-center justify-center text-base leading-none shrink-0 transition-transform duration-500 ease-out",
        isSelected ? "text-brand-base scale-110" : "text-mg-text-3 group-hover:text-mg-text-1 group-hover:rotate-[60deg]"
      )}>
        <LuSettings />
      </span>
      {!collapsed && (
        <span className="text-[15px] truncate tracking-tight font-medium leading-none">
          {label}
        </span>
      )}
    </div>
  )
}

/**
 * 重构后的高颜值自定义 DashboardSidebar 组件——按对象边界分组渲染（PRD：五分组 IA）
 */
export const DashboardSidebar: React.FC<DashboardSidebarProps> = ({
  collapsed,
  setCollapsed,
  selectedKey,
  onSelect,
  groups,
  settingsLabel,
}) => {
  const { t } = useTranslation()
  const [hovered, setHovered] = useState(false)
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

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
        "relative flex flex-col h-full min-h-0 bg-mg-bg-0 border-r border-mg-border/60 transition-all duration-300 ease-out select-none",
        collapsed ? "w-16" : "w-56"
      )}
    >
      {/* 右边缘微悬浮折叠触发器 */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        title={collapsed ? t('common.expand') : t('common.collapse')}
        className={cn(
          "absolute right-[-9px] top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-mg-bg-0 border border-mg-border hover:border-brand-mid text-mg-text-3 hover:text-brand-base flex items-center justify-center cursor-pointer transition-all duration-300 z-50 shadow-sm active:scale-90",
          hovered ? "opacity-100 translate-x-0" : "opacity-0 translate-x-[-4px] pointer-events-none"
        )}
      >
        <div className="transition-transform duration-300 group-hover:scale-110">
          {collapsed ? <LuChevronRight size={13} /> : <LuChevronLeft size={13} />}
        </div>
      </button>

      {/* 主导航区——按分组渲染 */}
      <div className="flex flex-col flex-1 py-3 overflow-y-auto overflow-x-hidden no-scrollbar">
        {groups.map((group) => (
          <div key={group.key} className="relative flex flex-col gap-0.5">
            {group.label && <SidebarGroupLabel text={group.label} collapsed={collapsed} />}
            {group.scope === 'workspace' && <WorkspaceSwitcher collapsed={collapsed} />}
            {group.items.map((item) =>
              item.items && item.items.length > 0 ? (
                <SidebarMenuGroup
                  key={item.itemKey}
                  item={item}
                  collapsed={collapsed}
                  selectedKey={selectedKey}
                  onSelect={onSelect}
                />
              ) : (
                <SidebarNavItem
                  key={item.itemKey}
                  item={item}
                  collapsed={collapsed}
                  isSelected={selectedKey === item.itemKey}
                  onClick={() => onSelect({ itemKey: item.itemKey })}
                />
              )
            )}
          </div>
        ))}
      </div>

      {/* 底部促销轮播 */}
      <SidebarPromoCarousel collapsed={collapsed} />

      {/* 底部设置及版本信息 */}
      <div className="pt-2 border-t border-mg-border/40 bg-mg-bg-0 shrink-0 relative">
        <SidebarSettingsButton
          collapsed={collapsed}
          selectedKey={selectedKey}
          onSelect={onSelect}
          label={settingsLabel}
        />
        <SidebarSystemStatus collapsed={collapsed} />
      </div>
    </aside>
  )
}
