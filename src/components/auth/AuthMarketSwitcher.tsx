import { LuGlobe } from 'react-icons/lu'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/Button'
import { getMarketConfig, isTestOrDev } from '@/config/market'
import type { Market } from '@/lib/market'
import { cn } from '@/lib/utils'

function marketHref(target: Market): string {
  if (typeof window === 'undefined') return getMarketConfig(target).consoleUrl

  const current = new URL(window.location.href)

  // 共享测试域和本地开发只有一个 origin，通过 query 显式切换市场。
  if (isTestOrDev()) {
    current.searchParams.set('market', target)
    return current.toString()
  }

  // 生产环境的市场由域名锁定，切换时保留当前鉴权路径与上下文参数。
  const destination = new URL(getMarketConfig(target).consoleUrl)
  destination.pathname = current.pathname
  destination.search = current.search
  destination.searchParams.delete('market')
  destination.hash = current.hash
  return destination.toString()
}

export function AuthMarketSwitcher({ market }: { market: Market }) {
  const { t } = useTranslation('account')
  const options: Array<{ market: Market; label: string }> = [
    { market: 'china', label: t('account.auth.marketSwitcher.china') },
    { market: 'global', label: t('account.auth.marketSwitcher.global') },
  ]

  return (
    <nav className="auth-market-switcher" aria-label={t('account.auth.marketSwitcher.ariaLabel')}>
      <LuGlobe className="auth-market-switch-icon" aria-hidden="true" />
      {options.map((option) => {
        const active = option.market === market
        return (
          <Button
            key={option.market}
            asChild
            variant="ghost"
            size="sm"
            className={cn('auth-market-switch-option', active && 'is-active')}
          >
            <a href={marketHref(option.market)} aria-current={active ? 'page' : undefined}>
              {option.label}
            </a>
          </Button>
        )
      })}
    </nav>
  )
}
