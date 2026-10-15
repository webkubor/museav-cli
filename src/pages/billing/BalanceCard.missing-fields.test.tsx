import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

/**
 * 回归：prd46#1342 —— 新客访问账单页高频出现「前端渲染报错」。
 *
 * 线上错误上报实证（behavior_events, client_error:render, /billing）：
 *   TypeError: Cannot read properties of undefined (reading 'amount')
 *     at billing-*.js
 * 原因是 GET /tenants/:id/balance 与 /balance/breakdown 对新租户会**整个字段不给**
 * （真源：生成类型 CreditsBalance / CreditsBalanceBreakdown 全是可选），
 * 而页面按必填读 balance.available.amount / breakdown.gift.amount ⇒ 解构即抛。
 *
 * 这里把「后端按可选契约返回」的两种形态都渲染一遍，要求不抛异常。
 */
const state = vi.hoisted(() => ({
  balance: undefined as unknown,
  breakdown: undefined as unknown,
}))

vi.mock('@/hooks/use-balance', () => ({
  useBalance: () => ({ data: state.balance, isLoading: false, isError: false, refetch: vi.fn() }),
  useBalanceBreakdown: () => ({ data: state.breakdown, isLoading: false, isError: false, refetch: vi.fn() }),
}))
vi.mock('@/hooks/use-permissions', () => ({ usePermissions: () => ({ hasPermission: () => false }) }))
vi.mock('@/lib/track', () => ({ trackEvent: vi.fn(), trackAction: vi.fn() }))
vi.mock('./TopUpModal', () => ({ TopUpModal: () => null }))
vi.mock('./PromoRedeemForm', () => ({ PromoRedeemForm: () => null }))

import i18n, { loadLocaleNamespaces } from '@/i18n'
import { BalanceCard } from './BalanceCard'

i18n.changeLanguage('zh')
await loadLocaleNamespaces(['billing'])

const renderCard = () =>
  render(<BalanceCard tenantId="tenant-1" currencySymbol="$" activeTab="all" onTabChange={() => {}} />)

describe('BalanceCard · 空余额兜底（prd46#1342）', () => {
  it('余额对象存在但四个字段全缺时（新租户）不抛渲染错误', () => {
    state.balance = {}
    state.breakdown = {}

    expect(() => renderCard()).not.toThrow()
  })

  it('三桶只回部分字段时不抛渲染错误', () => {
    state.balance = { available: { amount: '0.00', currency: 'USD' } }
    state.breakdown = { main: { amount: '0.00', currency: 'USD' } }

    expect(() => renderCard()).not.toThrow()
  })

  it('接口尚未返回（data 为 undefined）时不抛渲染错误', () => {
    state.balance = undefined
    state.breakdown = undefined

    expect(() => renderCard()).not.toThrow()
  })
})
