import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { LuArrowUpRight, LuBadgePercent } from 'react-icons/lu'

import { ModelIcon } from '@/features/models/components/ModelIcon'
import { listModels } from '@/services/catalog'
import {
  currencySymbol,
  isZhLang,
  priceText,
  priceUnitSuffix,
} from '@/features/models/model-format'
import {
  buildDiscountShowcase,
  maxDiscount,
  type DiscountShowcaseItem,
} from '@/components/auth/global-discount-models'
import type { CatalogModelItem } from '@/types'

const AUTO_SCROLL_PIXELS_PER_SECOND = 22

interface DiscountRowsProps {
  items: DiscountShowcaseItem[]
  clone?: boolean
  discountLabel: (discount: number) => string
  ref?: React.Ref<HTMLUListElement>
}

function DiscountRows({ items, clone = false, discountLabel, ref }: DiscountRowsProps) {
  return (
    <ul ref={ref} className="auth-discount-track" aria-hidden={clone || undefined}>
      {items.map((model) => {
        const meta = [model.providerLabel, model.price].filter(Boolean).join(' · ')
        return (
          <li key={model.modelId} className="auth-discount-row">
            <ModelIcon
              model={{ display_name: model.name, vendor: model.vendor }}
              variant="compact"
              rounded="rounded-sm"
              className="auth-discount-model-icon"
            />
            <div className="auth-discount-model-copy">
              <strong title={model.name}>{model.name}</strong>
              <span title={meta}>{meta}</span>
            </div>
            <span className="auth-discount-value">{discountLabel(model.discount)}</span>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * Global 登录页折扣橱窗。数据来自模型广场同一个公开目录接口（匿名可读），
 * 口径与筛选规则见 global-discount-models.ts；没有合格折扣数据时整块不渲染。
 */
export function GlobalDiscountShowcase() {
  const { t } = useTranslation('account')
  const listRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLUListElement>(null)
  const pausedRef = useRef(false)
  // 无缝循环需要复制一份轨道，但**只有装不下时才需要**：真实折扣可能只有两三条，
  // 无脑复制会在面板里并排显示两遍同样的模型（mock 有 12 条时看不出来这个问题）。
  const [loopable, setLoopable] = useState(false)
  const title = t('account.auth.globalEmailAuth.discountShowcase.title')

  // 登录页是匿名态：这个接口不带租户上下文，和模型广场首屏拉的是同一份数据。
  const modelsQuery = useQuery({
    queryKey: ['auth-discount-models'],
    queryFn: () => listModels({ page_size: 100 }),
    staleTime: 5 * 60_000,
  })

  const items = useMemo(() => {
    const isZh = isZhLang()
    const formatPrice = (model: CatalogModelItem) => {
      const isPerCall = model.pricing?.mode === 'per_call'
      const symbol = currencySymbol(model.pricing?.currency, isZh)
      const unit = priceUnitSuffix(model.price_unit, model.pricing?.mode, model.price_unit_en)
      const amount = isPerCall ? model.pricing?.per_call_price : model.pricing?.input_per_1m
      const { value, unit: unitSuffix } = priceText(amount, symbol, '', unit)
      return value ? `${value}${unitSuffix}` : ''
    }
    return buildDiscountShowcase(modelsQuery.data?.items, { formatPrice })
  }, [modelsQuery.data])

  // 单轨是否已经超出容器 ⇒ 决定要不要克隆轨道。数据条数与行高都会变，所以每次数据变化后重算。
  useEffect(() => {
    const list = listRef.current
    const track = trackRef.current
    if (!list || !track) {
      setLoopable(false)
      return
    }
    setLoopable(track.scrollHeight > list.clientHeight)
  }, [items.length])

  useEffect(() => {
    const list = listRef.current
    if (!list || typeof window.requestAnimationFrame !== 'function') return

    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    let animationFrame = 0
    let previousTimestamp: number | null = null
    let scrollPosition = list.scrollTop

    const advance = (timestamp: number) => {
      if (previousTimestamp === null) previousTimestamp = timestamp
      const elapsed = Math.min(timestamp - previousTimestamp, 64)
      previousTimestamp = timestamp

      if (!pausedRef.current && !reduceMotion?.matches && list.scrollHeight > list.clientHeight) {
        // 克隆存在时循环长度是一半（两条等高轨道）；没克隆时按整段滚动到底再回头。
        const loopHeight = loopable ? list.scrollHeight / 2 : list.scrollHeight
        scrollPosition = (
          scrollPosition + (elapsed * AUTO_SCROLL_PIXELS_PER_SECOND) / 1000
        ) % loopHeight
        list.scrollTop = scrollPosition
      }

      animationFrame = window.requestAnimationFrame(advance)
    }

    animationFrame = window.requestAnimationFrame(advance)
    return () => window.cancelAnimationFrame(animationFrame)
    // 依赖 items.length：列表是等目录接口回来才渲染的，首帧 listRef 还是 null。
    // 只写 [] 的话这个 effect 只在首帧跑一次、直接 early-return，数据到了也不会再绑，
    // 自动滚动就永远不启动（改成接口数据源时踩到的真实回归）。
  }, [items.length, loopable])

  const setPaused = (paused: boolean) => {
    pausedRef.current = paused
  }

  const discountLabel = (discount: number) => t(
    'account.auth.globalEmailAuth.discountShowcase.discount',
    { discount },
  )

  // 一条合格折扣都没有（接口失败 / 当前没有促销 / 促销数据撑不起双价）⇒ 整块不渲染，
  // 不展示"最高省 0%"，也不回落到写死的示例模型。
  if (items.length === 0) return null

  return (
    <aside className="auth-discount-showcase auth-flow-surface" aria-labelledby="auth-discount-title">
      <header className="auth-discount-header">
        <div className="auth-discount-heading">
          <LuBadgePercent size={18} aria-hidden="true" />
          <h2 id="auth-discount-title">
            {title}
          </h2>
        </div>
        <p>{t('account.auth.globalEmailAuth.discountShowcase.summary', { discount: maxDiscount(items) })}</p>
      </header>

      <div
        ref={listRef}
        className="auth-discount-list"
        role="region"
        aria-label={title}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <DiscountRows ref={trackRef} items={items} discountLabel={discountLabel} />
        {loopable && <DiscountRows items={items} clone discountLabel={discountLabel} />}
      </div>

      <footer className="auth-discount-footer">
        <span>{t('account.auth.globalEmailAuth.discountShowcase.footer')}</span>
        <Link to="/models">
          {t('account.auth.globalEmailAuth.discountShowcase.browse')}
          <LuArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </footer>
    </aside>
  )
}
