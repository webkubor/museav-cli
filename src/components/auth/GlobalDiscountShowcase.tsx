import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { LuArrowUpRight, LuBadgePercent } from 'react-icons/lu'

import { ModelIcon } from '@/features/models/components/ModelIcon'

interface DiscountModel {
  name: string
  vendor: string
  price: string
  discount: number
}

const DISCOUNT_MODELS: DiscountModel[] = [
  { name: 'deepseek-v3.2', vendor: 'DeepSeek', price: '$0.28/M', discount: 75 },
  { name: 'glm-4.7', vendor: 'Z.ai', price: '$0.40/M', discount: 60 },
  { name: 'qwen3.5-plus', vendor: 'Alibaba', price: '$0.35/M', discount: 55 },
  { name: 'kimi-k2.5', vendor: 'Moonshot', price: '$0.45/M', discount: 50 },
  { name: 'gpt-5-mini', vendor: 'OpenAI', price: '$0.25/M', discount: 40 },
  { name: 'claude-haiku-4.5', vendor: 'Anthropic', price: '$0.80/M', discount: 30 },
  { name: 'gemini-2.5-flash', vendor: 'Google', price: '$0.21/M', discount: 30 },
  { name: 'grok-4-fast', vendor: 'xAI', price: '$0.20/M', discount: 30 },
  { name: 'minimax-m2.5', vendor: 'MiniMax', price: '$0.30/M', discount: 28 },
  { name: 'llama-4-maverick', vendor: 'Meta', price: '$0.22/M', discount: 25 },
  { name: 'mistral-large-3', vendor: 'Mistral', price: '$0.55/M', discount: 22 },
  { name: 'command-r-plus', vendor: 'Cohere', price: '$0.65/M', discount: 20 },
]

const AUTO_SCROLL_PIXELS_PER_SECOND = 22

interface DiscountRowsProps {
  clone?: boolean
  discountLabel: (discount: number) => string
}

function DiscountRows({ clone = false, discountLabel }: DiscountRowsProps) {
  return (
    <ul className="auth-discount-track" aria-hidden={clone || undefined}>
      {DISCOUNT_MODELS.map((model) => (
        <li key={model.name} className="auth-discount-row">
          <ModelIcon
            model={{ display_name: model.name, vendor: model.vendor }}
            variant="compact"
            rounded="rounded-sm"
            className="auth-discount-model-icon"
          />
          <div className="auth-discount-model-copy">
            <strong title={model.name}>{model.name}</strong>
            <span title={`${model.vendor} · ${model.price}`}>
              {model.vendor} · {model.price}
            </span>
          </div>
          <span className="auth-discount-value">{discountLabel(model.discount)}</span>
        </li>
      ))}
    </ul>
  )
}

/** Global 登录页的本地 Mock 折扣橱窗，不请求真实目录或价格接口。 */
export function GlobalDiscountShowcase() {
  const { t } = useTranslation('account')
  const listRef = useRef<HTMLDivElement>(null)
  const pausedRef = useRef(false)
  const title = t('account.auth.globalEmailAuth.discountShowcase.title')

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
        const loopHeight = list.scrollHeight / 2
        scrollPosition = (
          scrollPosition + (elapsed * AUTO_SCROLL_PIXELS_PER_SECOND) / 1000
        ) % loopHeight
        list.scrollTop = scrollPosition
      }

      animationFrame = window.requestAnimationFrame(advance)
    }

    animationFrame = window.requestAnimationFrame(advance)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [])

  const setPaused = (paused: boolean) => {
    pausedRef.current = paused
  }

  const discountLabel = (discount: number) => t(
    'account.auth.globalEmailAuth.discountShowcase.discount',
    { discount },
  )

  return (
    <aside className="auth-discount-showcase auth-flow-surface" aria-labelledby="auth-discount-title">
      <header className="auth-discount-header">
        <div className="auth-discount-heading">
          <LuBadgePercent size={18} aria-hidden="true" />
          <h2 id="auth-discount-title">
            {title}
          </h2>
        </div>
        <p>{t('account.auth.globalEmailAuth.discountShowcase.summary')}</p>
      </header>

      <div
        ref={listRef}
        className="auth-discount-list"
        role="region"
        aria-label={title}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <DiscountRows discountLabel={discountLabel} />
        <DiscountRows clone discountLabel={discountLabel} />
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
