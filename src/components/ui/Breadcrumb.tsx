import React from 'react'
import { LuChevronRight } from 'react-icons/lu'
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
        "flex items-center gap-1.5 px-3.5 py-1.5 bg-mg-bg-0/30 dark:bg-neutral-900/30 backdrop-blur-md border border-mg-border/20 dark:border-neutral-800/40 rounded-full w-fit mb-6 text-[10.5px] font-bold text-mg-text-2 tracking-wider select-none shadow-sm shadow-black/5 animate-in fade-in slide-in-from-top-1 duration-300",
        className
      )}
    >
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1
        const hasLink = !!item.path && !isLast

        return (
          <div key={idx} className="flex items-center gap-1.5">
            {idx > 0 && (
              <LuChevronRight size={10} className="text-mg-text-2/40 dark:text-neutral-600/80 shrink-0" />
            )}
            <div className="flex items-center">
              {isLast && (
                <span className="w-1.5 h-1.5 rounded-full bg-brand-base mr-1.5 animate-pulse" />
              )}
              {hasLink ? (
                <button
                  type="button"
                  onClick={() => navigate(item.path!)}
                  className="text-mg-text-2 hover:text-brand-base dark:hover:text-brand-base font-bold transition-all duration-200 cursor-pointer hover:-translate-y-[0.5px] active:scale-95 bg-transparent border-none p-0 outline-none"
                >
                  {item.label}
                </button>
              ) : (
                <span className={cn(
                  isLast
                    ? "text-mg-text-0 font-extrabold"
                    : "text-mg-text-2/70 font-semibold"
                )}>
                  {item.label}
                </span>
              )}
            </div>
          </div>
        )
      })}
    </nav>
  )
}

export default Breadcrumb
