import React, { useState, useRef, useEffect } from 'react'
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
  const [flipped, setFlipped] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

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

  // Auto-flip: measure available space after open
  useEffect(() => {
    if (!open || !containerRef.current) return
    const triggerRect = containerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - triggerRect.bottom
    const spaceAbove = triggerRect.top
    if (position === 'bottom' && spaceBelow < 420 && spaceAbove > spaceBelow) {
      setFlipped(true)
    } else {
      setFlipped(false)
    }
  }, [open, position])

  const effectivePosition = (position === 'bottom' && flipped) ? 'top' : position

  const posClasses = {
    top: 'bottom-[calc(100%+8px)] left-0 origin-bottom',
    bottom: 'top-[calc(100%+8px)] left-0 origin-top',
    left: 'right-[calc(100%+8px)] top-0 origin-right',
    right: 'left-[calc(100%+8px)] top-0 origin-left',
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <div onClick={() => setOpen((o) => !o)} className="cursor-pointer inline-flex">
        {trigger}
      </div>

      {open && (
        <div
          ref={panelRef}
          className={cn(
            "absolute z-[999] p-4 rounded-xl glass-card-glow border border-mg-border shadow-xl select-none",
            "animate-in zoom-in-95 fade-in-0 duration-150",
            posClasses[effectivePosition],
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
