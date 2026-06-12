/**
 * 侧边栏底部促销小卡轮播
 * - 自动轮播（悬停暂停）、圆点指示、点击跳转
 * - 卡片由 PROMO_CARDS 数组驱动，改文案/增减卡片只需动数组
 * - 侧边栏折叠时不渲染
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LuArrowRight, LuSparkles } from 'react-icons/lu'

type PromoCard = {
  id: string
  title: string
  subtitle: string
  icon: React.ReactNode
  to: string
  /** 卡片渐变底（Tailwind 渐变工具类） */
  gradient: string
}

const PROMO_CARDS: PromoCard[] = [
  {
    id: 'referral',
    title: '邀请有礼',
    subtitle: '赠友 ¥2，返你 ¥2',
    icon: <span role="img" aria-label="gift">🎁</span>,
    to: '/referral',
    gradient: 'from-orange-500 to-rose-500',
  },
  {
    id: 'recharge',
    title: '充值特惠',
    subtitle: '六月限时 · 整月有效',
    icon: <span role="img" aria-label="party">🎉</span>,
    to: '/billing',
    gradient: 'from-emerald-600 to-teal-700',
  },
]

const ROTATE_MS = 5000

export function SidebarPromoCarousel({ collapsed }: { collapsed: boolean }) {
  const navigate = useNavigate()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const count = PROMO_CARDS.length

  useEffect(() => {
    if (collapsed || paused || count <= 1) return
    timerRef.current = setInterval(() => {
      setIndex((i) => (i + 1) % count)
    }, ROTATE_MS)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [collapsed, paused, count])

  if (collapsed || count === 0) return null

  const active = PROMO_CARDS[index]

  return (
    <div className="px-3 pb-2.5">
      <button
        type="button"
        onClick={() => navigate(active.to)}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        className={`group relative flex w-full items-center gap-2.5 overflow-hidden rounded-xl bg-gradient-to-br ${active.gradient} px-3 py-2.5 text-left shadow-sm transition-transform duration-200 hover:-translate-y-0.5 cursor-pointer`}
      >
        <LuSparkles className="pointer-events-none absolute right-9 top-2 h-3.5 w-3.5 text-white/30" />
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 text-[18px] leading-none backdrop-blur-sm">
          {active.icon}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-bold leading-tight text-white">{active.title}</span>
          <span className="mt-0.5 block truncate text-[11px] font-medium leading-tight text-white/85">{active.subtitle}</span>
        </span>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition-transform duration-200 group-hover:translate-x-0.5">
          <LuArrowRight size={13} />
        </span>
      </button>

      {count > 1 && (
        <div className="mt-2 flex items-center justify-center gap-1.5">
          {PROMO_CARDS.map((card, i) => (
            <button
              key={card.id}
              type="button"
              aria-label={`切换到 ${card.title}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === index ? 'w-4 bg-brand-base' : 'w-1.5 bg-mg-border hover:bg-mg-text-3'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
