import React, { useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import type { SyncedNavItem } from './dashboard-header-utils'

interface DashboardHeaderNavProps {
  items: SyncedNavItem[]
  onNavClick: (key: string, to: string) => void
}

/** 顶栏三端同步导航：磁性悬浮滑块 + pill hover；静止时滑块隐藏，活跃项仅靠品牌色+粗体体现。 */
export const DashboardHeaderNav: React.FC<DashboardHeaderNavProps> = ({ items, onNavClick }) => {
  const location = useLocation()
  const navRef = useRef<HTMLDivElement>(null)
  const [sliderStyle, setSliderStyle] = useState<React.CSSProperties>({
    left: 0,
    width: 0,
    opacity: 0,
  })

  const updateSlider = (el: HTMLElement) => {
    if (!el) return
    setSliderStyle({
      left: el.offsetLeft,
      width: el.offsetWidth,
      opacity: 1,
    })
  }

  // 与官网一致：静止时滑块隐藏（active 仅靠品牌色+粗体体现），pill 仅 hover 滑入
  const resetSlider = () => {
    setSliderStyle((prev) => ({ ...prev, opacity: 0 }))
  }

  const navClass = (active: boolean) =>
    cn(
      'relative px-3 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap select-none',
      'transition-all duration-200 active:scale-[0.96]',
      'motion-reduce:transition-none motion-reduce:active:scale-100',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-base/40',
      active
        ? 'text-brand-base font-semibold'
        : 'text-mg-text-2 hover:text-brand-base',
    )

  return (
    <nav ref={navRef} onMouseLeave={resetSlider} className="hidden md:flex items-center gap-0.5 relative">
      {/* 磁性悬浮滑块（胶囊气泡） */}
      <div
        style={sliderStyle}
        className="pointer-events-none absolute top-1.5 bottom-1.5 rounded-lg bg-brand-base/[0.08] transition-all duration-[380ms] ease-[var(--mg-ease-decelerate)]"
      />

      {items.map((item) => {
        const active = !!item.match?.(location.pathname)
        return item.to ? (
          <button
            key={item.key}
            type="button"
            onMouseEnter={(e) => updateSlider(e.currentTarget)}
            onClick={() => onNavClick(item.key, item.to!)}
            aria-current={active ? 'page' : undefined}
            className={navClass(active)}
          >
            {item.label}
          </button>
        ) : (
          <a
            key={item.key}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            onMouseEnter={(e) => updateSlider(e.currentTarget)}
            className={navClass(false)}
          >
            {item.label}
          </a>
        )
      })}
    </nav>
  )
}
