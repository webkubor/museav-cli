/**
 * 侧边栏底部「运营位」（PRD §7.3：轻量、可配置的活动运营位）
 * - 数据/开关来自 src/config/promo.ts，不再写死拉模型目录
 * - enabled=false 或侧栏折叠时不渲染（折叠态降级为不显示，避免挤占窄侧栏）
 * - 视觉等级低于导航项：克制的品牌渐变小卡，点击进配置的 route（站内）或 href（外链）
 */
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LuArrowRight } from 'react-icons/lu'
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
    <div className="px-3 pb-2.5">
      <button
        type="button"
        onClick={go}
        title={title}
        className="group relative flex w-full items-center gap-3 overflow-hidden rounded-lg px-3.5 py-3 text-left shadow-md transition-transform duration-200 hover:-translate-y-0.5 cursor-pointer"
        style={{ background: 'linear-gradient(135deg, var(--brand-base), var(--brand-deep))' }}
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          {badgeKey && (
            <span className="inline-flex w-fit items-center rounded-full bg-white/22 px-1.5 text-xs font-extrabold leading-[15px] text-white">
              {t(badgeKey)}
            </span>
          )}
          <span className="truncate text-[13px] font-bold leading-tight text-white" title={title}>
            {title}
          </span>
          {descriptionKey && (
            <span className="truncate text-xs leading-tight text-white/80">
              {t(descriptionKey)}
            </span>
          )}
        </span>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition-transform duration-200 group-hover:translate-x-0.5">
          <LuArrowRight size={13} />
        </span>
      </button>
    </div>
  )
}
