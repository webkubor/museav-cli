/**
 * 「查看赠金」高亮的**时序**：领取成功后跳到账单页，第一帧拿到的往往是缓存里那份
 * **领取之前**的列表——新手奖励那行还不在里面。
 *
 * 这是测试环境上 #943 的真实现象：跳过去了，但什么都没发生。原因不是匹配规则写错，
 * 而是拿领取前的列表判了「找不到」，`setTimeout(clearHighlight, 0)` 当场把这个一次性
 * 信号烧掉；等新列表到了，信号已经没了。页面不报错、控制台无线索，纯靠肉眼才看得出来。
 *
 * 所以这里测的是「什么时候才允许判定找不到」，不是「怎么比对 id」（那部分在
 * income-onboarding-row.test.ts）。
 */

import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { IncomeRecord } from '@/services/billing'

const listIncomeRecords = vi.fn()

vi.mock('@/services/billing', () => ({
  listIncomeRecords: (...args: unknown[]) => listIncomeRecords(...args),
}))
vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({ hasPermission: () => true }),
}))
vi.mock('@/lib/market', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/market')>()),
  isDomestic: () => false,
}))
vi.mock('@/lib/track', () => ({ trackEvent: () => {} }))
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: { defaultValue?: string }) => opts?.defaultValue ?? key,
    i18n: { language: 'zh' },
  }),
  // 依赖图里会经 auth-controller → src/i18n.ts 调 .use(initReactI18next)，
  // 整模块替换后缺这个导出会让文件加载就挂（同 referral/guardrails 的坑）。
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

import { BillingLedgerPanel } from './BillingLedgerPanel'
import { useOnboardingStore } from '@/store/use-onboarding-store'

function row(id: string, recordRef = id): IncomeRecord {
  return {
    id,
    type: 'gift',
    channel: 'onboarding_reward',
    record_ref: recordRef,
    balance_bucket: 'gift',
    amount: { amount: '10.00', currency: 'CNY' },
    status: 'completed',
    created_at: '2026-09-14T04:13:26Z',
  }
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  render(
    <BillingLedgerPanel
      tenantId="t-1"
      currencySymbol="¥"
      bucketFilter="all"
      onBucketFilterChange={() => {}}
    />,
    { wrapper },
  )
  return client
}

const receipt = { recordRef: 'gift-new', transactionId: 'gift-new', rewardLabel: '新手任务奖励' }

beforeEach(() => {
  listIncomeRecords.mockReset()
  useOnboardingStore.setState({ billingHighlight: null })
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(() => {
  useOnboardingStore.setState({ billingHighlight: null })
})

describe('「查看赠金」高亮的时序', () => {
  it('领取后那一行到位时高亮它，并且只高亮一行', async () => {
    listIncomeRecords.mockResolvedValue({ items: [row('gift-old'), row('gift-new')], has_more: false })
    renderPanel()
    await waitFor(() => expect(listIncomeRecords).toHaveBeenCalled())
    await screen.findByText('gift-new')

    useOnboardingStore.setState({ billingHighlight: receipt })

    await waitFor(() => {
      expect(document.querySelectorAll('.billing-transaction-highlight')).toHaveLength(1)
    })
    expect(screen.getByText('gift-new').closest('tr')).toHaveClass('billing-transaction-highlight')
  })

  /**
   * 回归本体：第一份返回是领取前的旧列表（没有新手奖励那行），高亮信号**不能**被烧掉；
   * 等领取后的列表到了，那行还要能高亮上。
   */
  it('先拿到领取前的旧列表时不清信号，等新列表到了仍能高亮', async () => {
    listIncomeRecords.mockResolvedValueOnce({ items: [row('gift-old')], has_more: false })
    const client = renderPanel()
    await screen.findByText('gift-old')

    useOnboardingStore.setState({ billingHighlight: receipt })
    // 旧列表还在屏幕上：没有任何一行被高亮，但信号必须留着
    await waitFor(() => expect(screen.queryByText('gift-new')).toBeNull())
    expect(document.querySelectorAll('.billing-transaction-highlight')).toHaveLength(0)
    expect(useOnboardingStore.getState().billingHighlight).not.toBeNull()

    // 领取后的列表到达（claim 成功会 invalidate 掉这份缓存，见 use-onboarding-guide）
    listIncomeRecords.mockResolvedValue({ items: [row('gift-old'), row('gift-new')], has_more: false })
    await client.invalidateQueries({ queryKey: ['billing', 'income-records', 't-1'] })

    await waitFor(() => {
      expect(document.querySelectorAll('.billing-transaction-highlight')).toHaveLength(1)
    })
    expect(screen.getByText('gift-new').closest('tr')).toHaveClass('billing-transaction-highlight')
  })

  /**
   * 回执带的两个标识分别落在**不同两行**上（换数据源期间可能出现：一份是合成回落形态、
   * 一份是接口直出的展示编号）。此时 highlightRowRef 会被后一行覆盖、滚到错的地方，
   * 而两行都挂上高亮类 —— 用户看到两条「新到账」，不知道哪条是自己刚领的。
   */
  it('两个标识分别命中不同行时只高亮一行，按列表顺序取第一条', async () => {
    listIncomeRecords.mockResolvedValue({
      items: [row('gift-new'), row('gift-other', 'redm_20260914_e4b51bfe')],
      has_more: false,
    })
    renderPanel()
    await screen.findByText('gift-new')

    useOnboardingStore.setState({
      billingHighlight: {
        recordRef: 'redm_20260914_e4b51bfe',
        transactionId: 'gift-new',
        rewardLabel: '新手任务奖励',
      },
    })

    await waitFor(() => {
      expect(document.querySelectorAll('.billing-transaction-highlight')).toHaveLength(1)
    })
    expect(screen.getByText('gift-new').closest('tr')).toHaveClass('billing-transaction-highlight')
  })
})
