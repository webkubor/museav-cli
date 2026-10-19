import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RechargeQuote } from '@/services/billing'
import { useFirstChargeBonus } from './use-first-charge-bonus'

const quoteRecharges = vi.fn<(tenantId: string, body: { currency: string; amounts: string[] }) => Promise<{ items: RechargeQuote[] }>>()
const hasPermissionMock = vi.fn<(perm: string) => boolean>(() => true)

vi.mock('@/services/billing', () => ({
  quoteRecharges: (tenantId: string, body: { currency: string; amounts: string[] }) => quoteRecharges(tenantId, body),
}))

vi.mock('@/hooks/use-platform-config', () => ({
  useCurrency: () => ({ currency: 'USD', symbol: '$' }),
}))

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: (perm: string) => hasPermissionMock(perm) }),
}))

function quote(amount: string, over: Partial<RechargeQuote> = {}): RechargeQuote {
  return {
    amount,
    currency: 'USD',
    eligible: true,
    activity_active: true,
    rule_id: 'r1',
    bonus_amount: '0',
    credited_total: amount,
    quote_id: `q-${amount}`,
    expires_at: '2026-12-31T00:00:00Z',
    ...over,
  }
}

function renderBonus(tenantId: string | null = 'tnt_1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const hook = renderHook(() => useFirstChargeBonus(tenantId), { wrapper })
  return { ...hook, client }
}

/** 等报价查询落定（success/error）再断言，避免「还没返回」时的假阴性 */
async function settled(client: QueryClient) {
  await waitFor(() => {
    const state = client.getQueryCache().findAll({ queryKey: ['recharge-quotes'] })[0]?.state
    expect(state?.status === 'success' || state?.status === 'error').toBe(true)
  })
}

describe('useFirstChargeBonus（#1380 导航首充角标）', () => {
  beforeEach(() => {
    quoteRecharges.mockReset()
    hasPermissionMock.mockReset().mockReturnValue(true)
  })

  it('取报价里命中梯度的最大 bonus_amount，并按账户币种格式化', async () => {
    quoteRecharges.mockResolvedValue({
      items: [
        quote('0.5', { bonus_amount: '0.05' }),
        quote('5', { bonus_amount: '0.5' }),
        quote('10', { bonus_amount: '10' }),
        quote('100', { bonus_amount: '0' }),
        quote('500', { bonus_amount: '0' }),
      ],
    })
    const { result } = renderBonus()
    await waitFor(() => expect(result.current).toBe('$10'))
    expect(quoteRecharges).toHaveBeenCalledWith('tnt_1', { currency: 'USD', amounts: ['0.5', '5', '10', '100', '500'] })
  })

  it('首充已完成（eligible=false）时不显示', async () => {
    quoteRecharges.mockResolvedValue({ items: [quote('10', { eligible: false, bonus_amount: '10' })] })
    const { result, client } = renderBonus()
    await settled(client)
    expect(result.current).toBeUndefined()
  })

  it('活动未生效（activity_active=false）时不显示', async () => {
    quoteRecharges.mockResolvedValue({ items: [quote('10', { activity_active: false, bonus_amount: '10' })] })
    const { result, client } = renderBonus()
    await settled(client)
    expect(result.current).toBeUndefined()
  })

  it('报价接口报错（后端未上线 / 网络失败）时不显示，不展示任何赠金承诺', async () => {
    quoteRecharges.mockRejectedValue(new Error('404'))
    const { result, client } = renderBonus()
    await settled(client)
    expect(result.current).toBeUndefined()
  })

  it('无充值权限或无租户时不发起报价请求', async () => {
    hasPermissionMock.mockReturnValue(false)
    renderBonus()
    renderBonus(null)
    await new Promise((r) => setTimeout(r, 20))
    expect(quoteRecharges).not.toHaveBeenCalled()
  })
})
