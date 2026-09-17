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

import { useState, type ReactNode } from 'react'
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
import { BILLING_HIGHLIGHT_TTL_MS, useOnboardingStore } from '@/store/use-onboarding-store'

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

function panelEl(bucketFilter: 'all' | 'gift' = 'all') {
  return (
    <BillingLedgerPanel
      tenantId="t-1"
      currencySymbol="¥"
      bucketFilter={bucketFilter}
      onBucketFilterChange={() => {}}
    />
  )
}

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const view = render(panelEl(), { wrapper })
  return Object.assign(client, {
    unmount: view.unmount,
    /** 换余额桶筛选（父级 BalanceCard 点桶的效果） */
    setBucket: (bucket: 'all' | 'gift') => view.rerender(panelEl(bucket)),
    /** 模拟离开账单页再回来：卸载后重新挂一份新的面板（断言走 screen/document，不用返回值） */
    reenter: (): void => {
      if (view.container.isConnected) view.unmount()
      render(panelEl(), { wrapper })
    },
  })
}

/**
 * 真实页面的形态：余额桶筛选由父级（BalanceCard 点桶）持有，面板通过 onBucketFilterChange 回写。
 * 用它复现「用户本来停在账单页、带着筛选去领奖」的时序。
 */
function Host({ initialBucket }: { initialBucket: 'all' | 'gift' }) {
  const [bucket, setBucket] = useState<'all' | 'gift'>(initialBucket)
  return (
    <BillingLedgerPanel tenantId="t-1" currencySymbol="¥" bucketFilter={bucket} onBucketFilterChange={(b) => setBucket(b as 'all' | 'gift')} />
  )
}

function renderHost(initialBucket: 'all' | 'gift') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<Host initialBucket={initialBucket} />, { wrapper })
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

  /**
   * 2026-09-16 口径变更（owner）：高亮不再 2.2s 后消失，淡到选中态后常驻；
   * store 里那个一次性信号在找到行的瞬间就被用掉，不再靠定时器收尾。
   */
  it('找到行后常驻高亮，并立刻用掉 store 信号', async () => {
    listIncomeRecords.mockResolvedValue({ items: [row('gift-old'), row('gift-new')], has_more: false })
    renderPanel()
    await screen.findByText('gift-new')

    useOnboardingStore.setState({ billingHighlight: receipt })
    await waitFor(() => {
      expect(screen.getByText('gift-new').closest('tr')).toHaveClass('billing-transaction-highlight')
    })
    expect(useOnboardingStore.getState().billingHighlight).toBeNull()

    // 老实现 2.2s 后就摘类；现在过了这个点（连 8s 兜底一起）仍在。
    // 高亮已断言通过、没有在途查询，这时开 fake timers 不会和 react-query 的调度打架。
    vi.useFakeTimers()
    try {
      vi.advanceTimersByTime(10_000)
    } finally {
      vi.useRealTimers()
    }
    expect(screen.getByText('gift-new').closest('tr')).toHaveClass('billing-transaction-highlight')
    expect(screen.getByText('gift-new').closest('tr')).toHaveAttribute('aria-current', 'true')
  })

  it('离开账单页再进来，高亮必须没有', async () => {
    listIncomeRecords.mockResolvedValue({ items: [row('gift-old'), row('gift-new')], has_more: false })
    const client = renderPanel()
    await screen.findByText('gift-new')

    useOnboardingStore.setState({ billingHighlight: receipt })
    await waitFor(() => {
      expect(document.querySelectorAll('.billing-transaction-highlight')).toHaveLength(1)
    })

    client.reenter()
    await screen.findByText('gift-new')
    // 给可能的异步 effect 一个 tick，确认不是「还没来得及挂上」
    await new Promise((r) => setTimeout(r, 50))
    expect(document.querySelectorAll('.billing-transaction-highlight')).toHaveLength(0)
    expect(useOnboardingStore.getState().billingHighlight).toBeNull()
  })

  it('切筛选后钉住的行清掉', async () => {
    listIncomeRecords.mockResolvedValue({ items: [row('gift-old'), row('gift-new')], has_more: false })
    const client = renderPanel()
    await screen.findByText('gift-new')

    useOnboardingStore.setState({ billingHighlight: receipt })
    await waitFor(() => {
      expect(document.querySelectorAll('.billing-transaction-highlight')).toHaveLength(1)
    })

    client.setBucket('gift')
    await waitFor(() => {
      expect(document.querySelectorAll('.billing-transaction-highlight')).toHaveLength(0)
    })
    // 换筛选后的那次请求回来了也不会再亮（信号已用掉）；keepPreviousData 会让旧行先留在屏上，
    // 所以要等到第二次请求真的落地再断言
    await waitFor(() => expect(listIncomeRecords).toHaveBeenCalledTimes(2))
    await screen.findByText('gift-new')
    expect(document.querySelectorAll('.billing-transaction-highlight')).toHaveLength(0)
  })

  /**
   * 回归（首版 review 抓出）：用户本来停在账单页、带着「赠送余额」筛选去领奖。信号到达那一帧，
   * 复位筛选与找行两个 effect 同批跑，若「钉住时的 key」记的是复位前的值，下一帧 key 一变就把
   * 刚钉的行清掉，而信号已用掉 ⇒ 一条都不亮。
   */
  it('带着筛选去领奖，复位筛选后那行仍常驻高亮', async () => {
    listIncomeRecords.mockResolvedValue({ items: [row('gift-old'), row('gift-new')], has_more: false })
    renderHost('gift')
    await screen.findByText('gift-new')

    useOnboardingStore.setState({ billingHighlight: receipt })
    await waitFor(() => {
      expect(screen.getByText('gift-new').closest('tr')).toHaveClass('billing-transaction-highlight')
    })
    // 复位后 bucket=all 的那次请求也回来了，高亮还在
    await waitFor(() => expect(listIncomeRecords).toHaveBeenCalledTimes(2))
    await new Promise((r) => setTimeout(r, 50))
    expect(document.querySelectorAll('.billing-transaction-highlight')).toHaveLength(1)
    expect(useOnboardingStore.getState().billingHighlight).toBeNull()
  })

  /**
   * 漏网路径：列表还没落地用户就离开了账单页，信号没被消费。面板 effect 的定时器随卸载被清，
   * 所以自毁必须在 store 侧——过了 TTL 再进账单页，不能再复位筛选、也不能再高亮。
   */
  it('列表落地前离开账单页，过了 TTL 再进来没有高亮', async () => {
    let resolveFirst: (v: unknown) => void = () => {}
    listIncomeRecords.mockImplementationOnce(() => new Promise((r) => { resolveFirst = r }))
    const client = renderPanel()
    await waitFor(() => expect(listIncomeRecords).toHaveBeenCalledTimes(1))

    // 走真实签发路径（带自毁定时器），不是直接 setState
    useOnboardingStore.setState({ rewardReceipt: receipt })
    vi.useFakeTimers()
    try {
      expect(useOnboardingStore.getState().takeReceiptForBilling()).toEqual(receipt)
      client.unmount()
      vi.advanceTimersByTime(BILLING_HIGHLIGHT_TTL_MS + 1)
    } finally {
      vi.useRealTimers()
    }
    expect(useOnboardingStore.getState().billingHighlight).toBeNull()
    resolveFirst({ items: [row('gift-old'), row('gift-new')], has_more: false })

    listIncomeRecords.mockResolvedValue({ items: [row('gift-old'), row('gift-new')], has_more: false })
    client.reenter()
    await screen.findByText('gift-new')
    await new Promise((r) => setTimeout(r, 50))
    expect(document.querySelectorAll('.billing-transaction-highlight')).toHaveLength(0)
  })
})
