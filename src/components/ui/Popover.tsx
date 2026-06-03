import React, { useState, useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface PopoverProps {
  trigger: React.ReactNode
  content: React.ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

/**
 * 现代高颜值 Popover 气泡卡片组件
 * 职责：点击触发器后弹出一个磨砂玻璃卡片面板，常用于放置二次控制开关或较复杂的注解，点击外部自动收回
 */
export const Popover: React.FC<PopoverProps> = ({
  trigger,
  content,
  position = 'bottom',
  className
}) => {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open])

  const posClasses = {
    top: 'bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 origin-bottom data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0',
    bottom: 'top-[calc(100%+8px)] left-1/2 -translate-x-1/2 origin-top data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0',
    left: 'right-[calc(100%+8px)] top-1/2 -translate-y-1/2 origin-right data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0',
    right: 'left-[calc(100%+8px)] top-1/2 -translate-y-1/2 origin-left data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0',
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <div 
        onClick={() => setOpen((o) => !o)} 
        className="cursor-pointer inline-flex"
      >
        {trigger}
      </div>

      {open && (
        <div
          data-state={open ? 'open' : 'closed'}
          className={cn(
            "absolute z-[999] w-72 p-4 rounded-xl glass-card-glow border border-mg-border shadow-xl select-none",
            posClasses[position],
            className
          )}
        >
          {content}
        </div>
      )}
    </div>
  )
}

export default Popover
