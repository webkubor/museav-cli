import React, { useState, useRef } from 'react'
import { cn } from '@/lib/utils'

interface TooltipProps {
  content: React.ReactNode
  children: React.ReactElement
  position?: 'top' | 'bottom' | 'left' | 'right'
  delay?: number
  className?: string
  containerClassName?: string
  interactive?: boolean
  arrowClassName?: string
}

/**
 * 极简高颜值轻量 Tooltip 组件 (免外部库依赖)
 * 职责：鼠标悬停在触发元素上时提供精致、具有淡入微动效的说明浮层，支持交互模式
 */
export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  delay = 150,
  className,
  containerClassName,
  interactive = false,
  arrowClassName
}) => {
  const [visible, setVisible] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const showTooltip = () => {
    clearTimeout(leaveTimeoutRef.current)
    clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setVisible(true)
    }, delay)
  }

  const hideTooltip = () => {
    clearTimeout(timeoutRef.current)
    clearTimeout(leaveTimeoutRef.current)
    if (interactive) {
      leaveTimeoutRef.current = setTimeout(() => {
        setVisible(false)
      }, 200)
    } else {
      setVisible(false)
    }
  }

  const handleMouseEnterTooltip = () => {
    if (interactive) {
      clearTimeout(leaveTimeoutRef.current)
    }
  }

  const handleMouseLeaveTooltip = () => {
    if (interactive) {
      clearTimeout(leaveTimeoutRef.current)
      leaveTimeoutRef.current = setTimeout(() => {
        setVisible(false)
      }, 200)
    }
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

  const hasBg = className?.split(' ').some(c => c.startsWith('bg-'))
  const hasBorder = className?.split(' ').some(c => c.startsWith('border'))
  const hasRounded = className?.split(' ').some(c => c.startsWith('rounded-'))
  const hasPadding = className?.split(' ').some(c => c.startsWith('p-'))

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
          onMouseEnter={handleMouseEnterTooltip}
          onMouseLeave={handleMouseLeaveTooltip}
          className={cn(
            "absolute z-[9999] w-max backdrop-blur-md text-neutral-900 dark:text-neutral-100 shadow-[0_8px_30px_rgb(0,0,0,0.06)] dark:shadow-[0_16px_40px_rgb(0,0,0,0.35)]",
            !hasBg && "bg-white/98 dark:bg-neutral-950/98",
            !hasBorder && "border border-neutral-200/60 dark:border-neutral-800/60",
            !hasRounded && "rounded-xl",
            !hasPadding && "p-1",
            interactive ? "pointer-events-auto" : "pointer-events-none",
            !className?.includes('max-w-') && "max-w-[280px]",
            posClasses[position],
            className
          )}
        >
          {content}
          <span className={cn(arrowClasses[position], arrowClassName)} />
        </div>
      )}
    </div>
  )
}

export default Tooltip
