import React from 'react'
import { LuChevronRight, LuHouse } from 'react-icons/lu'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

export interface BreadcrumbItem {
  label: string
  path?: string
}

interface BreadcrumbProps {
  items: BreadcrumbItem[]
  className?: string
}

/**
 * 高阶 Web3 质感胶囊面包屑导航组件
 * 职责：展示当前页面在系统层级中的位置，并支持点击跳转与 Hover 物理微动效
 */
export const Breadcrumb: React.FC<BreadcrumbProps> = ({ items, className }) => {
  const navigate = useNavigate()

  return (
    <nav
      className={cn(
        "flex items-center gap-2 px-[var(--mg-control-px-md)] py-1.5 bg-mg-bg-0 border border-mg-border/60 rounded-full w-fit mb-4 mg-compact-badge text-mg-text-3 tracking-wide select-none shadow-sm transition-all duration-300 hover:border-brand-base/30 hover:shadow-brand-glow/5 animate-in fade-in slide-in-from-top-1 duration-300",
        className
      )}
    >
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1
        const hasLink = !!item.path && !isLast

        return (
          <div key={idx} className="flex items-center gap-2 group/item">
            {idx > 0 && (
              <LuChevronRight size={12} className="text-mg-text-3/40 shrink-0" />
            )}
            
            {hasLink ? (
              <button
                type="button"
                onClick={() => navigate(item.path!)}
                className="flex items-center gap-1.5 text-mg-text-3 hover:text-brand-base dark:hover:text-brand-base font-bold transition-all duration-200 cursor-pointer hover:-translate-y-[0.5px] active:scale-95 bg-transparent border-none p-0 outline-none"
              >
                {idx === 0 && (
                  <div className="relative flex items-center shrink-0">
                    <LuHouse size={13} className="shrink-0 text-mg-text-3/80 group-hover/item:text-brand-base transition-colors" />
                    <span className="absolute -top-[1px] -right-[1px] w-1.5 h-1.5 rounded-full bg-brand-base animate-pulse" />
                  </div>
                )}
                <span>{item.label}</span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                {idx === 0 && (
                  <div className="relative flex items-center shrink-0">
                    <LuHouse size={13} className="text-mg-text-3/80 shrink-0" />
                    <span className="absolute -top-[1px] -right-[1px] w-1.5 h-1.5 rounded-full bg-brand-base animate-pulse" />
                  </div>
                )}
                {isLast && idx > 0 && (
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-base animate-pulse shrink-0" />
                )}
                <span className={cn(
                  isLast
                    ? "text-mg-text-1 font-extrabold"
                    : "text-mg-text-3/70 font-semibold"
                )}>
                  {item.label}
                </span>
              </div>
            )}
          </div>
        )
      })}
    </nav>
  )
}

export default Breadcrumb
