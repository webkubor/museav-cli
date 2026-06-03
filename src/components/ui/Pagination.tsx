import React from 'react'
import { LuChevronLeft, LuChevronRight } from 'react-icons/lu'
import { cn } from '@/lib/utils'

interface PaginationProps {
  currentPage: number
  total: number
  pageSize: number
  onChange: (page: number) => void
  className?: string
}

/**
 * 现代高颜值 Pagination 分页组件
 * 职责：提供数据表格下方的分页控制器，采用极简药丸按钮风格，内置严谨的数字折叠溢出省略逻辑
 */
export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  total,
  pageSize,
  onChange,
  className
}) => {
  const totalPages = Math.ceil(total / pageSize) || 1

  // 生成展示的页数列表（智能省略折叠算法）
  const getPageNumbers = () => {
    const pages: Array<number | string> = []
    const siblingCount = 1 // 邻近页码数

    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i)
      }
      return pages
    }

    const leftSiblingIndex = Math.max(currentPage - siblingCount, 1)
    const rightSiblingIndex = Math.min(currentPage + siblingCount, totalPages)

    const showLeftSpill = leftSiblingIndex > 2
    const showRightSpill = rightSiblingIndex < totalPages - 1

    if (!showLeftSpill && showRightSpill) {
      const leftItemCount = 3 + 2 * siblingCount
      for (let i = 1; i <= leftItemCount; i++) {
        pages.push(i)
      }
      pages.push('...')
      pages.push(totalPages)
      return pages
    }

    if (showLeftSpill && !showRightSpill) {
      const rightItemCount = 3 + 2 * siblingCount
      pages.push(1)
      pages.push('...')
      for (let i = totalPages - rightItemCount + 1; i <= totalPages; i++) {
        pages.push(i)
      }
      return pages
    }

    if (showLeftSpill && showRightSpill) {
      pages.push(1)
      pages.push('...')
      for (let i = leftSiblingIndex; i <= rightSiblingIndex; i++) {
        pages.push(i)
      }
      pages.push('...')
      pages.push(totalPages)
      return pages
    }

    return pages
  }

  const pages = getPageNumbers()

  return (
    <div className={cn("flex items-center gap-1.5 select-none", className)}>
      {/* 上一页 */}
      <button
        onClick={() => currentPage > 1 && onChange(currentPage - 1)}
        disabled={currentPage <= 1}
        className={cn(
          "w-8.5 h-8.5 rounded-lg border border-mg-border flex items-center justify-center text-mg-text-2 transition-all cursor-pointer bg-mg-bg-0 hover:text-mg-text-0 hover:bg-mg-fill-0/50 active:scale-95",
          currentPage <= 1 && "opacity-40 cursor-not-allowed pointer-events-none"
        )}
        aria-label="上一页"
      >
        <LuChevronLeft size={15} />
      </button>

      {/* 页码数字项 */}
      {pages.map((p, idx) => {
        if (p === '...') {
          return (
            <span
              key={`dots-${idx}`}
              className="w-8.5 h-8.5 flex items-center justify-center text-xs text-mg-text-2 tracking-widest"
            >
              ...
            </span>
          )
        }

        const isCurrent = p === currentPage

        return (
          <button
            key={`page-${p}`}
            onClick={() => onChange(p as number)}
            className={cn(
              "w-8.5 h-8.5 rounded-lg text-xs font-semibold flex items-center justify-center transition-all cursor-pointer",
              isCurrent
                ? "bg-brand-base text-white shadow-sm shadow-brand-glow/20 border border-brand-mid/10 font-bold"
                : "border border-mg-border text-mg-text-2 bg-mg-bg-0 hover:text-mg-text-0 hover:bg-mg-fill-0/50 active:scale-95"
            )}
          >
            {p}
          </button>
        )
      })}

      {/* 下一页 */}
      <button
        onClick={() => currentPage < totalPages && onChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        className={cn(
          "w-8.5 h-8.5 rounded-lg border border-mg-border flex items-center justify-center text-mg-text-2 transition-all cursor-pointer bg-mg-bg-0 hover:text-mg-text-0 hover:bg-mg-fill-0/50 active:scale-95",
          currentPage >= totalPages && "opacity-40 cursor-not-allowed pointer-events-none"
        )}
        aria-label="下一页"
      >
        <LuChevronRight size={15} />
      </button>
    </div>
  )
}

export default Pagination
