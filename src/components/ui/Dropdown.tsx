/**
 * 极简现代高颜值通用 Dropdown 下拉菜单组件
 * 职责：提供轻量、半透明毛玻璃、手感平滑、支持 click-outside 自动收起的通用下拉组件
 * 兼容支持：自定义弹出位置、React 19 类型规范
 */

import React, { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

export interface DropdownProps {
  render: React.ReactNode
  trigger?: 'click' | 'hover'
  position?: 'bottomLeft' | 'bottomRight' | 'topLeft' | 'topRight'
  className?: string
  children: React.ReactNode
}

/** 1. 下拉定位核心包装器 */
export const Dropdown: React.FC<DropdownProps> = ({
  render,
  position = 'bottomRight',
  className,
  children
}) => {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    window.addEventListener('click', handleOutsideClick)
    return () => window.removeEventListener('click', handleOutsideClick)
  }, [open])

  return (
    <div 
      ref={containerRef} 
      className={cn("relative inline-flex text-left w-fit", className)}
      style={{ position: 'relative' }}
    >
      <div 
        onClick={() => setOpen(!open)}
        className="cursor-pointer inline-flex items-center justify-center w-full h-full"
      >
        {children}
      </div>

      {open && (
        <div 
          onClick={() => setOpen(false)} // 点击子项后自动闭合，手感符合直觉
          className={cn(
            "absolute z-50 mt-2 bg-[rgba(var(--mg-bg-0-rgb),0.88)] border border-mg-border/70 rounded-xl shadow-xl shadow-black/5 backdrop-blur-md p-1.5 min-w-[140px] animate-in fade-in-50 zoom-in-95 duration-150 origin-top-right",
            position === 'bottomRight' && "right-0 left-auto top-full",
            position === 'bottomLeft' && "left-0 right-auto top-full",
            position === 'topRight' && "right-0 left-auto bottom-full mb-2 origin-bottom-right",
            position === 'topLeft' && "left-0 right-auto bottom-full mb-2 origin-bottom-left"
          )}
        >
          {render}
        </div>
      )}
    </div>
  )
}

/** 2. 下拉菜单项容器 */
export const DropdownMenu: React.FC<{
  children: React.ReactNode
  style?: React.CSSProperties
  className?: string
}> = ({ children, style, className }) => {
  return (
    <div 
      className={cn("flex flex-col gap-0.5", className)} 
      style={style}
    >
      {children}
    </div>
  )
}

export interface DropdownItemProps {
  icon?: React.ReactNode
  onClick?: () => void
  style?: React.CSSProperties
  className?: string
  children: React.ReactNode
}

/** 3. 下拉菜单单项组件 */
export const DropdownItem: React.FC<DropdownItemProps> = ({
  icon,
  onClick,
  style,
  className,
  children
}) => {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          onClick?.()
        }
      }}
      className={cn(
        "flex items-center gap-2 px-3 py-2.5 text-[13px] rounded-lg text-mg-text-1 hover:bg-mg-fill-0/60 hover:text-mg-text-0 active:scale-[0.98] transition-all duration-150 cursor-pointer select-none font-semibold leading-none outline-none focus-visible:bg-mg-fill-0/60",
        className
      )}
      style={style}
    >
      {icon && <span className="text-mg-text-2 shrink-0">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
    </div>
  )
}

/** 4. 下拉菜单细分隔线 */
export const DropdownDivider: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn("h-[1px] bg-mg-border/40 my-1 mx-1", className)} />
)

export default Dropdown
