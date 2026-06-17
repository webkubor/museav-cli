import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface PopoverProps {
  trigger: React.ReactNode
  content: React.ReactNode
  position?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

export const Popover: React.FC<PopoverProps> = ({
  trigger,
  content,
  position = 'bottom',
  className
}) => {
  const [open, setOpen] = useState(false)
  // 首帧 hidden+fixed，测量完坐标后才 visible，杜绝位置闪烁
  const [style, setStyle] = useState<React.CSSProperties>({ position: 'fixed', visibility: 'hidden' })
  const triggerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const computePosition = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const gap = 8
    const vw = window.innerWidth
    const vh = window.innerHeight

    let top: number | undefined
    let bottom: number | undefined
    let left = rect.left

    const spaceBelow = vh - rect.bottom
    const spaceAbove = rect.top
    const useTop = position === 'bottom' && spaceBelow < 420 && spaceAbove > spaceBelow

    if (useTop) {
      bottom = vh - rect.top + gap
      top = undefined
    } else {
      top = rect.bottom + gap
      bottom = undefined
    }

    // 防止右侧溢出
    const panelW = panelRef.current?.offsetWidth ?? 460
    if (left + panelW > vw - 8) {
      left = Math.max(8, vw - panelW - 8)
    }

    setStyle({ position: 'fixed', top, bottom, left, zIndex: 9999, visibility: 'visible' })
  }, [position])

  useLayoutEffect(() => {
    if (open) {
      computePosition()
    } else {
      // 同步 DOM 布局测量结果：关闭时先隐藏，避免下次打开首帧闪到旧位置（1088d15）
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStyle({ position: 'fixed', visibility: 'hidden' })
    }
  }, [open, computePosition])

  useEffect(() => {
    if (!open) return

    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        panelRef.current && !panelRef.current.contains(target)
      ) {
        setOpen(false)
      }
    }

    function handleScroll() { computePosition() }

    document.addEventListener('mousedown', handleClickOutside)
    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', computePosition)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', computePosition)
    }
  }, [open, computePosition])

  return (
    <>
      <div ref={triggerRef} className="relative w-full" onClick={() => setOpen(o => !o)}>
        {trigger}
      </div>

      {open && createPortal(
        <div
          ref={panelRef}
          style={style}
          className={cn(
            "p-4 rounded-md glass-card-glow border border-mg-border shadow-xl select-none",
            "animate-in zoom-in-95 fade-in-0 duration-150",
            className
          )}
        >
          {content}
        </div>,
        document.body
      )}
    </>
  )
}

export default Popover
