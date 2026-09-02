import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

const openRecharge = vi.fn()

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({
    data: { total: { requests: 10, tokens: 1000, spend: { amount: '1.00' } } },
    isLoading: false,
  }),
}))

vi.mock('@/store/auth', () => ({
  useAuthStore: (selector: (state: { activeTenantId: string }) => unknown) => selector({ activeTenantId: 'tenant-1' }),
}))

vi.mock('@/hooks/use-tenant-role', () => ({
  useTenantRole: () => ({ tenant: { id: 'tenant-1' }, isEnterprise: false, canManage: true }),
}))

vi.mock('@/hooks/use-balance', () => ({
  useBalance: () => ({
    data: {
      available: { amount: '100.00' },
      low_balance_threshold: { amount: '10.00' },
    },
    isLoading: false,
  }),
}))

vi.mock('@/hooks/use-track-context', () => ({ useTrackContext: () => ({}) }))
vi.mock('@/lib/track', () => ({ trackEvent: vi.fn() }))
vi.mock('@/hooks/use-platform-config', () => ({ useCurrency: () => ({ symbol: '$' }) }))
vi.mock('@/store/use-recharge-store', () => ({
  useRechargeStore: (selector: (state: { open: typeof openRecharge }) => unknown) => selector({ open: openRecharge }),
}))
vi.mock('@/components/ui/TiltCard', () => ({ TiltCard: ({ children }: { children: ReactNode }) => <div>{children}</div> }))

import i18n, { loadLocaleNamespaces } from '@/i18n'
import { MetricsSection } from './MetricsSection'

i18n.changeLanguage('zh')
await loadLocaleNamespaces(['dashboard'])

describe('MetricsSection', () => {
  beforeEach(() => {
    openRecharge.mockClear()
  })

  it('keeps recharge available when the balance is healthy', () => {
    render(<MetricsSection view="enterprise" granularity="day" />)

    fireEvent.click(screen.getByRole('button', { name: '充值' }))

    expect(openRecharge).toHaveBeenCalledOnce()
  })
})
