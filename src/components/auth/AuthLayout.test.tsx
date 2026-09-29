import type { ComponentType, PropsWithChildren, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { AuthLayout } from './AuthLayout'

vi.mock('@/config/brand-assets', () => ({
  useSiteLogo: () => '/brand/modelgo-cn-logo.png',
}))

vi.mock('@/store/use-brand-store', () => ({
  useLangStore: (selector: (state: { market: 'china' }) => unknown) => selector({ market: 'china' }),
}))

vi.mock('@/config/market', () => ({
  isTestOrDev: () => true,
  getMarketConfig: (market: 'china' | 'global') => ({
    consoleUrl: market === 'china' ? 'https://console.modelgo.com' : 'https://console.modelgo.ai',
  }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'account.auth.marketSwitcher.ariaLabel': '切换站点',
      'account.auth.marketSwitcher.china': '中国站',
      'account.auth.marketSwitcher.global': 'Global',
    })[key] ?? key,
  }),
}))

type TestLayoutProps = PropsWithChildren<{
  title: string
  subtitle?: string
  footer?: ReactNode
  showMarketSwitcher?: boolean
}>

const TestAuthLayout = AuthLayout as ComponentType<TestLayoutProps>

describe('AuthLayout market switcher', () => {
  it('shows the current site and preserves the auth route when switching markets', () => {
    window.history.replaceState({}, '', '/login?method=email&redirect=%2Fdashboard')

    render(
      <TestAuthLayout title="登录" showMarketSwitcher>
        <div>form</div>
      </TestAuthLayout>,
    )

    const china = screen.getByRole('link', { name: '中国站' })
    const global = screen.getByRole('link', { name: 'Global' })

    expect(china).toHaveAttribute('aria-current', 'page')
    expect(global).toHaveAttribute(
      'href',
      'http://localhost:3000/login?method=email&redirect=%2Fdashboard&market=global',
    )
  })
})
