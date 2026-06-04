import React, { useState, useRef } from 'react'
import { cn } from '@/lib/utils'

interface TooltipProps {
  content: React.ReactNode
  children: React.ReactElement
  position?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
  className?: string
  containerClassName?: string
}

/**
 * 极简高颜值轻量 Tooltip 组件 (免外部库依赖)
 * 职责：鼠标悬停在触发元素上时提供精致、具有淡入微动效的说明浮层
 */
export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  delay = 150,
  className,
  containerClassName
}) => {
  const [visible, setVisible] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const showTooltip = () => {
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setVisible(true)
    }, delay)
  }

  const hideTooltip = () => {
    clearTimeout(timeoutRef.current)
    setVisible(false)
  }

  const posClasses = {
    top: 'bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 origin-bottom data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0',
    bottom: 'top-[calc(100%+8px)] left-1/2 -translate-x-1/2 origin-top data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0',
    left: 'right-[calc(100%+8px)] top-1/2 -translate-y-1/2 origin-right data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0',
    right: 'left-[calc(100%+8px)] top-1/2 -translate-y-1/2 origin-left data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0',
  }

  const arrowClasses = {
    top: 'absolute top-full left-1/2 -translate-x-1/2 border-t-white dark:border-t-neutral-950 border-x-transparent border-b-transparent border-[5px]',
    bottom: 'absolute bottom-full left-1/2 -translate-x-1/2 border-b-white dark:border-b-neutral-950 border-x-transparent border-t-transparent border-[5px]',
    left: 'absolute left-full top-1/2 -translate-y-1/2 border-l-white dark:border-l-neutral-950 border-y-transparent border-r-transparent border-[5px]',
    right: 'absolute right-full top-1/2 -translate-y-1/2 border-r-white dark:border-r-neutral-950 border-y-transparent border-l-transparent border-[5px]',
  }

  return (
    <div
      className={cn("relative inline-block w-fit", containerClassName)}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      {visible && (
        <div
          data-state={visible ? 'open' : 'closed'}
          className={cn(
            "absolute z-[9999] pointer-events-none w-max max-w-[280px] p-1 rounded-xl bg-white/98 dark:bg-neutral-950/98 backdrop-blur-md border border-neutral-200/60 dark:border-neutral-800/60 text-neutral-900 dark:text-neutral-100 shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_16px_40px_rgb(0,0,0,0.35)]",
            posClasses[position],
            className
          )}
        >
          {content}
          <span className={arrowClasses[position]} />
        </div>
      )}
    </div>
  )
}

export default Tooltip
