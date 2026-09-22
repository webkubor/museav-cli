/**
 * 侧边栏底部「运营位」（PRD §7.3：轻量、可配置的活动运营位）
 * - 数据/开关来自 src/config/promo.ts，不再写死拉模型目录
 * - enabled=false 或侧栏折叠时不渲染（折叠态降级为不显示，避免挤占窄侧栏）
 * - 视觉等级低于导航项：克制的品牌渐变小卡，点击进配置的 route（站内）或 href（外链）
 */
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LuArrowRight, LuGift } from 'react-icons/lu'
import { sidebarPromo } from '@/config/promo'

export function SidebarPromoCarousel({ collapsed }: { collapsed: boolean }) {
  const navigate = useNavigate()
  const { t } = useTranslation()

  // 折叠态降级：不渲染（侧栏收窄时运营位让位于导航）
  if (collapsed || !sidebarPromo.enabled) return null

  const { titleKey, descriptionKey, badgeKey, route, href } = sidebarPromo
  const title = t(titleKey)

  const go = () => {
    if (href) {
      window.open(href, '_blank', 'noopener,noreferrer')
    } else if (route) {
      navigate(route)
    }
  }

  return (
    <div className="px-3 pb-3">
      <button
        type="button"
        onClick={go}
        title={title}
        className="group relative flex w-full items-center gap-3 overflow-hidden rounded-lg px-4 py-3.5 text-left ring-1 ring-inset ring-white/15 shadow-[0_8px_24px_-8px_var(--brand-base)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-8px_var(--brand-base)] cursor-pointer"
        style={{ background: 'linear-gradient(135deg, var(--brand-base), var(--brand-deep))' }}
      >
        {/* 装饰性光晕（右上角柔光），不参与交互；hover 时增强 */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -right-7 -top-9 h-24 w-24 rounded-full bg-white/20 blur-2xl opacity-70 transition-opacity duration-300 group-hover:opacity-100"
        />

        {/* 焦点徽章：礼物图标（邀请返利），磨砂圆章托底 */}
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/18 text-white ring-1 ring-inset ring-white/25 shadow-inner transition-transform duration-300 group-hover:scale-105">
          <LuGift size={17} />
        </span>

        <span className="relative flex min-w-0 flex-1 flex-col gap-0.5">
          {badgeKey && (
            <span className="inline-flex w-fit items-center rounded-full bg-white/22 px-1.5 text-[11px] font-extrabold leading-[15px] text-white">
              {t(badgeKey)}
            </span>
          )}
          <span className="truncate text-sm font-bold leading-tight text-white" title={title}>
            {title}
          </span>
          {descriptionKey && (
            <span className="truncate text-xs leading-snug text-white/75">
              {t(descriptionKey)}
            </span>
          )}
        </span>

        <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition-transform duration-300 group-hover:translate-x-0.5">
          <LuArrowRight size={13} />
        </span>
      </button>
    </div>
  )
}
