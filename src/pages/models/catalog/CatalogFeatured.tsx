/**
 * 精选轮播（对齐 PRD 原型 MarketplaceFeaturedCarousel）。
 *
 * 内容**完全**来自 GET /catalog/featured（后台配置），前端不得写死 model_id。
 * 指向已下架/隐藏模型的轮播位由后端剔除。
 *
 * 交互与原型一致：
 * - 相邻卡片露边（绝对定位 + 位移 76% + scale/opacity 弱化），只显示 offset 绝对值
 *   ≤1 的三张，其余隐藏；
 * - 5s 自动轮播，hover / 键盘聚焦时暂停 —— 不暂停会让用户读到一半被切走；
 * - 点非激活卡片可直接切到它；
 * - 圆点在下方居中，激活的加宽。
 *
 * 项数边界：0 项整块不渲染；1 项静态展示（无圆点、不自动播）。
 * background_key 为空时按 model_id 稳定映射，同一模型底色恒定不闪。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { trimPriceZeros } from '@/lib/utils'
import { useAuthStore } from '@/store/auth'
import { trackEvent } from '@/lib/track'
import type { CatalogFeaturedSlide } from '@/types'

/** 五张内置背景，对应后端 background_key 的 default_01..default_05。 */
const BACKGROUND_KEYS = ['default_01', 'default_02', 'default_03', 'default_04', 'default_05'] as const

function fallbackBackgroundKey(modelId: string): string {
  let hash = 0
  for (let i = 0; i < modelId.length; i += 1) hash = (hash * 31 + modelId.charCodeAt(i)) % 997
  return BACKGROUND_KEYS[hash % BACKGROUND_KEYS.length]
}

const AUTOPLAY_MS = 5000
const CCY_SYMBOL: Record<string, string> = { CNY: '¥', RMB: '¥', USD: '$', EUR: '€' }

interface Props {
  slides: CatalogFeaturedSlide[]
  isZh: boolean
  onTry: (modelId: string, e: React.MouseEvent) => void
}

export function CatalogFeatured({ slides, isZh, onTry }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  // 底部图片加载失败/为空时隐藏图片、回退水印字母兜底（PRD §模型广场 AC-24：
  // 缺失或加载失败时仅隐藏该图片，继续展示默认背景图和文本内容，不显示破图）。
  const [bottomImageFailed, setBottomImageFailed] = useState<Record<string, boolean>>({})

  const count = slides.length
  const safeIndex = count > 0 ? Math.min(active, count - 1) : 0

  // 埋点：切换来源（自动轮播 / 手动点击），供 marketplace_featured_switched 的
  // switch_source 使用；每次手动切换前先写入，读取后立即清回 'auto'（自动轮播的
  // 默认来源），避免手动标记残留到下一次自动切换。
  const switchSourceRef = useRef<'auto' | 'manual'>('auto')
  const goToSlide = (index: number, source: 'auto' | 'manual') => {
    switchSourceRef.current = source
    setActive(index)
  }

  useEffect(() => {
    if (paused || count <= 1) return
    const timer = window.setInterval(() => {
      switchSourceRef.current = 'auto'
      setActive((i) => (i + 1) % count)
    }, AUTOPLAY_MS)
    return () => window.clearInterval(timer)
  }, [paused, count])

  // marketplace_featured_impression：轮播项成为主卡时上报一次（含首次挂载）。
  // marketplace_featured_switched：非首次时额外上报本次切换（自动/手动 + 前后模型）。
  const prevIndexRef = useRef(safeIndex)
  const impressedKeyRef = useRef<string | null>(null)
  useEffect(() => {
    if (count === 0) return
    const current = slides[safeIndex]
    if (!current) return
    if (impressedKeyRef.current !== current.carousel_item_id) {
      const prevSlide = slides[prevIndexRef.current]
      if (prevSlide && prevSlide.carousel_item_id !== current.carousel_item_id) {
        trackEvent('marketplace_featured_switched', {
          from_model_id: prevSlide.model_id,
          to_model_id: current.model_id,
          switch_source: switchSourceRef.current,
          position: safeIndex,
        })
      }
      trackEvent('marketplace_featured_impression', {
        carousel_item_id: current.carousel_item_id,
        model_id: current.model_id,
        position: safeIndex,
        background_key: current.background_key || fallbackBackgroundKey(current.model_id),
        has_bottom_image: Boolean(current.bottom_image_url),
      })
      impressedKeyRef.current = current.carousel_item_id
      switchSourceRef.current = 'auto'
    }
    prevIndexRef.current = safeIndex
  }, [safeIndex, slides, count])

  const rendered = useMemo(
    () =>
      slides.map((s, index) => {
        // 环形位移：delta 归一到 [-count/2, count/2]，只有 |offset| <= 1 的三张可见。
        const delta = (((index - safeIndex) % count) + count) % count
        const offset = delta <= count / 2 ? delta : delta - count
        return { slide: s, index, offset, isActive: offset === 0, hidden: Math.abs(offset) > 1 }
      }),
    [slides, safeIndex, count],
  )

  if (count === 0) return null

  return (
    <section
      aria-label={isZh ? '推荐模型' : 'Featured models'}
      aria-roledescription={isZh ? '轮播' : 'carousel'}
      className="mg-featured"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="mg-featured-track">
        {rendered.map(({ slide, index, offset, isActive, hidden }) => {
          const bgKey = slide.background_key || fallbackBackgroundKey(slide.model_id)
          const pitch =
            (isZh ? slide.featured_pitch : slide.featured_pitch_en || slide.featured_pitch) ||
            slide.tagline ||
            ''
          const promo = slide.promotion
          const discountLabel = isZh
            ? promo?.discount_label
            : promo?.discount_label_en || promo?.discount_label
          const symbol = CCY_SYMBOL[(slide.currency || '').toUpperCase()] || slide.currency || '¥'
          const detailHref = `/models/${slide.slug || slide.model_id}`
          return (
            <article
              key={slide.carousel_item_id}
              className={`mg-featured-slide mg-featured-bg-${bgKey}${isActive ? ' is-active' : ''}${hidden ? ' is-hidden' : ''}`}
              style={{ ['--slide-offset' as string]: String(offset) }}
              aria-hidden={hidden}
              onClick={() => {
                if (isActive) {
                  trackEvent('marketplace_featured_clicked', {
                    carousel_item_id: slide.carousel_item_id,
                    model_id: slide.model_id,
                    action: 'detail',
                    auth_state: isAuthenticated ? 'authenticated' : 'anonymous',
                    position: index,
                  })
                  navigate(detailHref, { state: { source: 'catalog_featured', fromSearch: location.search } })
                } else {
                  goToSlide(index, 'manual')
                }
              }}
            >
              {/* 底部图片（PRD §模型广场 AC-24，后台可为单模型配置）：图片不遮挡名称/
                  文案/价格/CTA——放在水印字母同一视觉层级（z-index 低于 copy/actions），
                  配置了且未加载失败才展示；否则回退巨大水印首字母（与原型一致）。 */}
              {slide.bottom_image_url && !bottomImageFailed[slide.carousel_item_id] ? (
                <img
                  className="mg-featured-bottom-image"
                  src={slide.bottom_image_url}
                  alt=""
                  aria-hidden
                  onError={() => setBottomImageFailed((prev) => ({ ...prev, [slide.carousel_item_id]: true }))}
                />
              ) : (
                <span className="mg-featured-mark" aria-hidden>
                  {slide.name.slice(0, 1).toUpperCase()}
                </span>
              )}

              <div className="mg-featured-copy">
                <div className="mg-featured-badges">
                  {slide.is_new && (
                    <em className="mg-badge is-new">{isZh ? '最新发布' : 'New release'}</em>
                  )}
                  {promo?.free ? (
                    <em className="mg-badge is-free">{isZh ? '限时免费' : 'Free'}</em>
                  ) : discountLabel ? (
                    <em className="mg-badge is-discount">{discountLabel}</em>
                  ) : null}
                </div>
                <strong>{slide.name}</strong>
                <span className="mg-featured-meta">
                  {slide.vendor}
                  {promo?.free
                    ? ` · ${isZh ? '限时免费' : 'free'}`
                    : ` · ${isZh ? '输入' : 'in'} ${symbol}${trimPriceZeros(slide.input_price)}/M / ${isZh ? '输出' : 'out'} ${symbol}${trimPriceZeros(slide.output_price)}/M`}
                </span>
                {pitch && <p>{pitch}</p>}
              </div>

              <div className="mg-featured-actions">
                <button
                  type="button"
                  className="mg-featured-try"
                  onClick={(e) => {
                    e.stopPropagation()
                    trackEvent('marketplace_featured_clicked', {
                      carousel_item_id: slide.carousel_item_id,
                      model_id: slide.model_id,
                      action: 'try',
                      auth_state: isAuthenticated ? 'authenticated' : 'anonymous',
                      position: index,
                    })
                    onTry(slide.model_id, e)
                  }}
                >
                  {t('modelsCatalog.button.try')}
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    trackEvent('marketplace_featured_clicked', {
                      carousel_item_id: slide.carousel_item_id,
                      model_id: slide.model_id,
                      action: 'detail',
                      auth_state: isAuthenticated ? 'authenticated' : 'anonymous',
                      position: index,
                    })
                    navigate(detailHref, { state: { source: 'catalog_featured', fromSearch: location.search } })
                  }}
                >
                  {isZh ? '查看详情' : 'Details'}
                </button>
              </div>
            </article>
          )
        })}
      </div>

      {count > 1 && (
        <div
          className="mg-featured-dots"
          role="tablist"
          aria-label={isZh ? '切换推荐模型' : 'Switch featured model'}
        >
          {slides.map((s, i) => (
            <button
              key={s.carousel_item_id}
              type="button"
              role="tab"
              aria-selected={i === safeIndex}
              aria-label={s.name}
              className={`mg-featured-dot${i === safeIndex ? ' is-on' : ''}`}
              onClick={() => goToSlide(i, 'manual')}
            />
          ))}
        </div>
      )}
    </section>
  )
}
