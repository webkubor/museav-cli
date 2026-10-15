import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'

const openRecharge = vi.fn()

/** 可变的后端返回，供「字段缺失」用例改写（prd46#1342：新租户接口会不给 spend / available） */
const state = vi.hoisted(() => ({
  summary: { total: { requests: 10, tokens: 1000, spend: { amount: '1.00' } } } as Record<string, unknown>,
  balance: { available: { amount: '100.00' }, low_balance_threshold: { amount: '10.00' } } as Record<string, unknown>,
}))

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: state.summary, isLoading: false }),
}))

vi.mock('@/store/auth', () => ({
  useAuthStore: (selector: (state: { activeTenantId: string }) => unknown) => selector({ activeTenantId: 'tenant-1' }),
}))

vi.mock('@/hooks/use-tenant-role', () => ({
  useTenantRole: () => ({ tenant: { id: 'tenant-1' }, isEnterprise: false, canManage: true }),
}))

vi.mock('@/hooks/use-balance', () => ({
  useBalance: () => ({ data: state.balance, isLoading: false }),
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

  // prd46#1342：线上 client_error:render /dashboard = Cannot read properties of undefined (reading 'amount')
  it('余额对象缺 available 时不抛渲染错误', () => {
    state.balance = { low_balance_threshold: { amount: '10.00' } }

    expect(() => render(<MetricsSection view="enterprise" granularity="day" />)).not.toThrow()
  })

  it('用量汇总缺 total.spend 时不抛渲染错误', () => {
    state.summary = { total: { requests: 10, tokens: 1000 } }

    expect(() => render(<MetricsSection view="enterprise" granularity="day" />)).not.toThrow()
  })
})
