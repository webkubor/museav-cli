import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface PopoverProps {
  trigger: React.ReactNode
  /** 内容；传函数可拿到 close()，用于点击「确定」后主动收起弹层 */
  content: React.ReactNode | ((close: () => void) => React.ReactNode)
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
            // pointer-events-auto: Radix Dialog(modal) 打开时会把 body 设为 pointer-events:none，
            // 而本组件 portal 到 body，必须显式恢复，否则弹层内（如日期选择）全部无法点击
            // 不透明实底：bg-mg-bg-0 对应 --mg-surface 已并入玻璃系统（暗色下 color-mix 到 7% 透明），
            // 换成类名并不能换掉透明度；bg-mg-bg-2 对应 --mg-surface-2，语义即「悬浮卡片 / Dropdown」，
            // 两套主题都是实色 hex，下拉面板必须完整遮挡背景（需求方#504，同源#449）
            "pointer-events-auto mg-panel rounded-md bg-mg-bg-2 border border-mg-border shadow-xl select-none",
            "animate-in zoom-in-95 fade-in-0 duration-150",
            className
          )}
        >
          {typeof content === 'function' ? content(() => setOpen(false)) : content}
        </div>,
        document.body
      )}
    </>
  )
}

export default Popover
