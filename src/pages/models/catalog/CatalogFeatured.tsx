/**
 * 精选轮播。
 *
 * 内容**完全**来自 GET /catalog/featured（后台配置），前端不得写死 model_id。
 * 指向已下架/隐藏模型的轮播位由后端剔除，这里拿到的就是可展示的。
 *
 * 项数边界：0 项整块不渲染；1 项静态展示（不显示切换点、不自动轮播）。
 * background_key 是五张内置背景之一，为空时按 model_id 稳定映射 —— 同一个模型
 * 每次进来看到的底色一致，不会闪。
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LuChevronRight } from 'react-icons/lu'
import { Button } from '@/components/ui/Button'
import { ModelIcon } from '@/features/models/components/ModelIcon'
import type { CatalogFeaturedSlide } from '@/types'

/** 五张内置背景，对应后端 background_key 的 default_01..default_05。 */
const BACKGROUND_KEYS = ['default_01', 'default_02', 'default_03', 'default_04', 'default_05'] as const

/** 无 background_key 时按 model_id 稳定映射一张，保证同一模型底色恒定。 */
function fallbackBackgroundKey(modelId: string): string {
  let hash = 0
  for (let i = 0; i < modelId.length; i += 1) hash = (hash * 31 + modelId.charCodeAt(i)) % 997
  return BACKGROUND_KEYS[hash % BACKGROUND_KEYS.length]
}

const AUTOPLAY_MS = 6000

interface Props {
  slides: CatalogFeaturedSlide[]
  isZh: boolean
  onTry: (modelId: string, e: React.MouseEvent) => void
}

export function CatalogFeatured({ slides, isZh, onTry }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [active, setActive] = useState(0)

  const count = slides.length
  // 单项不轮播：一张图来回切换没有意义，还会让页面无端动。
  const autoplay = count > 1

  useEffect(() => {
    if (!autoplay) return
    const timer = window.setInterval(() => setActive((i) => (i + 1) % count), AUTOPLAY_MS)
    return () => window.clearInterval(timer)
  }, [autoplay, count])

  /**
   * 配置变化（项数变少）后 active 可能越界。在渲染时夹住而不是用 effect 回写
   * state —— effect 里 setState 会多一次渲染，且 lint 明确禁止。
   */
  const safeIndex = count > 0 ? Math.min(active, count - 1) : 0
  const current = useMemo(() => slides[safeIndex], [slides, safeIndex])

  if (count === 0 || !current) return null

  const pitch = (isZh ? current.featured_pitch : current.featured_pitch_en || current.featured_pitch)
    || current.tagline
    || ''
  const bgKey = current.background_key || fallbackBackgroundKey(current.model_id)
  const detailHref = `/models/${current.slug || current.model_id}`
  const promo = current.promotion
  const discountLabel = isZh ? promo?.discount_label : (promo?.discount_label_en || promo?.discount_label)

  return (
    <section className={`mg-featured mg-featured-bg-${bgKey}`} aria-label={isZh ? '精选模型' : 'Featured models'}>
      <div className="mg-featured-body">
        <div className="mg-featured-head">
          <ModelIcon
            model={{ display_name: current.name, vendor: current.vendor }}
            size={34}
            rounded="rounded-full"
          />
          <div className="mg-featured-title">
            <strong>{current.name}</strong>
            <span>{current.vendor}</span>
          </div>
          <div className="mg-featured-badges">
            {promo?.free ? (
              <em className="mg-badge is-free">{isZh ? '限时免费' : 'Free'}</em>
            ) : discountLabel ? (
              <em className="mg-badge is-discount">{discountLabel}</em>
            ) : null}
          </div>
        </div>

        {pitch && <p className="mg-featured-pitch">{pitch}</p>}

        <div className="mg-featured-actions">
          <Button variant="brand" size="sm" onClick={(e) => onTry(current.model_id, e)}>
            {t('modelsCatalog.button.try')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => navigate(detailHref)}>
            {isZh ? '查看详情' : 'Details'}
            <LuChevronRight size={14} />
          </Button>
        </div>
      </div>

      {/* 底部装饰图：失效只隐藏装饰，不破图（onError 摘掉元素） */}
      {current.bottom_image_url && (
        <img
          className="mg-featured-deco"
          src={current.bottom_image_url}
          alt=""
          aria-hidden
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      )}

      {count > 1 && (
        <div className="mg-featured-dots" role="tablist" aria-label={isZh ? '切换精选模型' : 'Switch featured model'}>
          {slides.map((s, i) => (
            <button
              key={s.carousel_item_id}
              type="button"
              role="tab"
              aria-selected={i === safeIndex}
              aria-label={s.name}
              className={`mg-featured-dot ${i === safeIndex ? 'is-on' : ''}`}
              onClick={() => setActive(i)}
            />
          ))}
        </div>
      )}
    </section>
  )
}
