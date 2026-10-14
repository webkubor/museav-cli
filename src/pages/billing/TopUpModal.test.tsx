import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { RechargeCreated } from '@/types'

const createRecharge = vi.fn<(tenantId: string, body: unknown) => Promise<RechargeCreated>>()
const quoteRecharges = vi.fn<(tenantId: string, body: { currency: string; amounts: string[] }) => Promise<{ items: unknown[] }>>()
const trackEvent = vi.fn()
/** 后端未上线报价接口时的形状：HTTP 404 */
const notFound = () => Object.assign(new Error('not found'), { response: { status: 404 } })
/** 与 ModelGoApiError 同形（code + data）；不直接 import request.ts，避免拉起真 i18n */
const apiError = (code: number, data: unknown) => Object.assign(new Error(`api ${code}`), { name: 'ModelGoApiError', code, data })
const quote = (amount: string, bonus: string, extra: Record<string, unknown> = {}) => ({
  amount, currency: 'CNY', eligible: true, activity_active: true, rule_id: 'r1',
  bonus_amount: bonus, credited_total: String(Number(amount) + Number(bonus)),
  quote_id: `q-${amount}-${bonus}`, expires_at: '2026-10-10T12:00:00Z', ...extra,
})
const toastSuccess = vi.fn()
const toastError = vi.fn()
const useWechatPayeeMock = vi.hoisted(() => vi.fn<() => string>(() => '杭州词元共生科技有限公司'))
const useCurrencyMock = vi.hoisted(() => vi.fn<() => { currency: string; symbol: string }>(() => ({ currency: 'CNY', symbol: '¥' })))

vi.mock('@/services/billing', () => ({
  createRecharge: (tenantId: string, body: unknown) => createRecharge(tenantId, body),
  quoteRecharges: (tenantId: string, body: { currency: string; amounts: string[] }) => quoteRecharges(tenantId, body),
}))

vi.mock('@/lib/track', () => ({ trackEvent: (...args: unknown[]) => trackEvent(...args) }))

vi.mock('@/hooks/use-platform-config', () => ({
  useCurrency: () => useCurrencyMock(),
  useEnabledChannels: () => ['wechat'],
  useWechatPayee: () => useWechatPayeeMock(),
}))

vi.mock('@/hooks/use-permissions', () => ({
  usePermissions: () => ({
    hasPermission: () => true,
  }),
}))

vi.mock('@/lib/app-toast', () => ({
  appToast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      const copy: Record<string, string> = {
        'billing.rechargeModal.title': '账户充值',
        'billing.rechargeModal.amount': '充值金额',
        'billing.rechargeModal.customAmount': '输入自定义金额',
        'billing.rechargeModal.method': '支付方式',
        'billing.rechargeModal.submit': `前往支付 ${values?.amount ?? ''}`,
        'billing.rechargeModal.success': '充值订单已创建，请完成支付',
        'billing.rechargeModal.error': '创建充值订单失败',
        'billing.rechargeModal.submitting': '提交中...',
        'billing.rechargeModal.bonusSummary': `首冲加赠，最高送 ${values?.max ?? ''}`,
        'billing.rechargeModal.bonusPreset': `送 ${values?.bonus ?? ''} · 到账 ${values?.total ?? ''}`,
        'billing.rechargeModal.customCard': '自定义额度',
        'billing.rechargeModal.customCardHint': '输入其他金额',
        'billing.rechargeModal.getBonus': '首冲赠金 · 赠送余额',
        'billing.rechargeModal.getTotal': '到账总额',
        'billing.rechargeModal.quoteLoading': '正在计算赠金…',
        'billing.rechargeModal.quoteFailed': '赠金报价获取失败',
        'billing.rechargeModal.quoteRetry': '重试',
        'billing.rechargeModal.quoteChanged': '赠金报价已更新，请确认后再前往支付',
      }
      return copy[key] ?? key
    },
  }),
}))

import { TopUpModal } from '@/pages/billing/TopUpModal'

function renderModal() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return render(<TopUpModal visible onClose={vi.fn()} tenantId="tnt_1" />, { wrapper: Wrapper })
}

/** 报价请求落定前提交按钮是禁用的：等它可点再点 */
async function clickPay(name: string) {
  const btn = await screen.findByRole('button', { name })
  await waitFor(() => expect(btn).toBeEnabled())
  fireEvent.click(btn)
}

describe('TopUpModal', () => {
  beforeEach(() => {
    useCurrencyMock.mockReturnValue({ currency: 'CNY', symbol: '¥' })
    createRecharge.mockReset().mockResolvedValue({
      order_no: 'WX202606100001',
      status: 'pending',
      payment: {
        channel: 'wechat',
        qr_code_url: 'weixin://wxpay/bizpayurl?pr=test',
      },
      expires_at: '2026-06-10T18:00:00Z',
    })
    // 默认：后端还没有报价接口 → 弹框按改动前的普通充值行为
    quoteRecharges.mockReset().mockRejectedValue(notFound())
    trackEvent.mockClear()
    toastSuccess.mockClear()
    toastError.mockClear()
    useWechatPayeeMock.mockReturnValue('杭州词元共生科技有限公司')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows the international legal entity (MODELGO PTE. LTD.) as WeChat payee on the global site', async () => {
    useWechatPayeeMock.mockReturnValue('MODELGO PTE. LTD.')
    const paymentWindow = { close: vi.fn(), closed: false, location: { href: '' } } as unknown as Window
    vi.spyOn(window, 'open').mockReturnValue(paymentWindow)

    renderModal()
    await clickPay('前往支付 ¥500')

    await waitFor(() => {
      expect(paymentWindow.location.href).toContain('/billing/wechat-cashier')
    })
    expect(new URL(paymentWindow.location.href).searchParams.get('payee')).toBe('MODELGO PTE. LTD.')
  })

  it('opens the first-party WeChat cashier for QR code responses', async () => {
    const close = vi.fn()
    const paymentWindow = {
      close,
      closed: false,
      location: { href: '' },
    } as unknown as Window
    vi.spyOn(window, 'open').mockReturnValue(paymentWindow)

    renderModal()
    await clickPay('前往支付 ¥500')

    await waitFor(() => {
      expect(paymentWindow.location.href).toContain('/billing/wechat-cashier')
    })
    const cashierURL = new URL(paymentWindow.location.href)
    expect(cashierURL.pathname).toBe('/billing/wechat-cashier')
    expect(cashierURL.searchParams.get('qr')).toBe('weixin://wxpay/bizpayurl?pr=test')
    expect(cashierURL.searchParams.get('order')).toBe('WX202606100001')
    expect(cashierURL.searchParams.get('amount')).toBe('500')
    expect(cashierURL.searchParams.get('currency')).toBe('CNY')
    expect(cashierURL.searchParams.get('payee')).toBe('杭州词元共生科技有限公司')
    expect(screen.queryByText('WX202606100001')).not.toBeInTheDocument()
    expect(close).not.toHaveBeenCalled()
    expect(createRecharge).toHaveBeenCalledWith(
      'tnt_1',
      expect.objectContaining({ channel: 'wechat', currency: 'CNY', amount: '500' })
    )
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('充值订单已创建，请完成支付'))
  })

  it('falls back to a provider redirect when no WeChat QR code is returned', async () => {
    createRecharge.mockResolvedValueOnce({
      order_no: 'WX202606100002',
      status: 'pending',
      payment: {
        channel: 'wechat',
        redirect_url: 'https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb?prepay_id=test',
      },
      expires_at: '2026-06-10T18:00:00Z',
    })
    const paymentWindow = {
      close: vi.fn(),
      closed: false,
      location: { href: '' },
    } as unknown as Window
    vi.spyOn(window, 'open').mockReturnValue(paymentWindow)

    renderModal()
    await clickPay('前往支付 ¥500')

    await waitFor(() => {
      expect(paymentWindow.location.href).toBe('https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb?prepay_id=test')
    })
    expect(screen.queryByText('WX202606100002')).not.toBeInTheDocument()
  })

  // prd46#1260：最低充值额由 0.1 提到 0.5，低于 0.5 的自定义金额判为无效
  it('rejects custom amounts below the 0.5 minimum', async () => {
    renderModal()
    await waitFor(() => expect(quoteRecharges).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('button', { name: /自定义额度/ }))
    const input = screen.getByPlaceholderText('输入自定义金额')
    fireEvent.change(input, { target: { value: '0.3' } })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    fireEvent.change(input, { target: { value: '0.5' } })
    expect(input).toHaveAttribute('aria-invalid', 'false')
  })

  // PRD 原型 BillingRechargeModal：自定义输入框只在选中「自定义额度」卡后出现，预设不回填输入框
  it('shows the custom input only after picking the custom-amount card', async () => {
    renderModal()
    await waitFor(() => expect(quoteRecharges).toHaveBeenCalled())
    expect(screen.queryByPlaceholderText('输入自定义金额')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '¥500' }))
    expect(screen.getByRole('button', { name: '前往支付 ¥500' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /自定义额度/ }))
    const input = screen.getByPlaceholderText('输入自定义金额') as HTMLInputElement
    fireEvent.change(input, { target: { value: '888' } })
    expect(input.value).toBe('888')
    expect(screen.getByRole('button', { name: '前往支付 ¥888' })).toBeInTheDocument()
  })

  it('caps server-returned CNY presets at five and keeps custom sixth (#1260)', async () => {
    const configured = ['0.5', '5', '10', '100', '500', '1000', '10000']
    quoteRecharges.mockReset().mockResolvedValue({
      items: configured.map((amount) => quote(amount, '0')),
    })
    renderModal()
    await waitFor(() => expect(quoteRecharges).toHaveBeenCalled())
    expect(quoteRecharges).toHaveBeenCalledWith('tnt_1', { currency: 'CNY', amounts: ['0.5', '5', '10', '100', '500'] })
    for (const label of ['¥0.5', '¥5', '¥10', '¥100', '¥500']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: '¥1,000' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '¥10,000' })).not.toBeInTheDocument()
    const cards = document.querySelectorAll('.billing-recharge-presets > button')
    expect(cards).toHaveLength(6)
    expect(cards[5]).toHaveTextContent('自定义额度')
  })

  it('keeps USD at five presets with custom amount sixth (#1260)', async () => {
    useCurrencyMock.mockReturnValue({ currency: 'USD', symbol: '$' })
    renderModal()
    for (const label of ['$0.5', '$5', '$10', '$100', '$500']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    await waitFor(() => expect(quoteRecharges).toHaveBeenCalledWith('tnt_1', {
      currency: 'USD', amounts: ['0.5', '5', '10', '100', '500'],
    }))
    const cards = document.querySelectorAll('.billing-recharge-presets > button')
    expect(cards).toHaveLength(6)
    expect(cards[5]).toHaveTextContent('自定义额度')
  })

  // ─── prd46#1240 首冲赠金 ───
  it('limits CNY to five presets and places custom amount sixth (#1260)', async () => {
    renderModal()
    // 两站面值统一（2026-10-12 与需求方确认）：0.5/5/10/100/500，只有单位符号不同
    for (const label of ['¥0.5', '¥5', '¥10', '¥100', '¥500']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    expect(screen.queryByRole('button', { name: '¥50' })).not.toBeInTheDocument()
    const cards = document.querySelectorAll('.billing-recharge-presets > button')
    expect(cards).toHaveLength(6)
    expect(cards[5]).toHaveTextContent('自定义额度')
    await waitFor(() => expect(screen.getByRole('button', { name: '前往支付 ¥500' })).toBeEnabled())
    expect(quoteRecharges).toHaveBeenCalledWith('tnt_1', { currency: 'CNY', amounts: ['0.5', '5', '10', '100', '500'] })
    expect(screen.queryByText(/首冲加赠/)).not.toBeInTheDocument()
    expect(screen.queryByText(/送 ¥/)).not.toBeInTheDocument()
    expect(screen.queryByText('首冲赠金 · 赠送余额')).not.toBeInTheDocument()
  })

  it('shows server-quoted bonus on presets and submits the fresh quote id', async () => {
    quoteRecharges.mockReset().mockImplementation(async (_t, body) => ({
      items: body.amounts.map((a) => (Number(a) >= 50 ? quote(a, String(Number(a) / 10)) : quote(a, '0'))),
    }))
    const paymentWindow = { close: vi.fn(), closed: false, location: { href: '' } } as unknown as Window
    vi.spyOn(window, 'open').mockReturnValue(paymentWindow)

    renderModal()
    // 面值统一后档位为 0.5/5/10/100/500，mock 按 amount>=50 给 10%：
    // 最高赠金来自 ¥500 档 → 送 ¥50；¥10 及以下未命中梯度
    expect(await screen.findByText('首冲加赠，最高送 ¥50')).toBeInTheDocument()
    expect(screen.getByText('送 ¥50 · 到账 ¥550')).toBeInTheDocument()
    // ¥10 未命中梯度：不展示赠金
    expect(screen.queryByText(/送 ¥0/)).not.toBeInTheDocument()
    // 支付按钮只显示实付
    await clickPay('前往支付 ¥500')

    await waitFor(() => expect(createRecharge).toHaveBeenCalled())
    expect(createRecharge.mock.calls[0][1]).toMatchObject({ amount: '500', quote_id: 'q-500-50' })
    expect(trackEvent).toHaveBeenCalledWith('recharge_payment_submit', expect.objectContaining({ amount: '500', bonus_amount: '50', quote_status: 'ok' }))
    expect(trackEvent).toHaveBeenCalledWith('recharge_dialog_view', expect.objectContaining({ activity_active: true, default_amount: '500' }))
  })

  it('stops and asks to reconfirm when the quote changed right before ordering', async () => {
    let calls = 0
    quoteRecharges.mockReset().mockImplementation(async (_t, body) => {
      calls += 1
      // 第一次（弹框打开）赠 50；之后（下单前复校验）活动结束，赠金变 0
      return { items: body.amounts.map((a) => quote(a, calls === 1 ? String(Number(a) / 10) : '0')) }
    })
    const paymentWindow = { close: vi.fn(), closed: false, location: { href: '' } } as unknown as Window
    vi.spyOn(window, 'open').mockReturnValue(paymentWindow)

    renderModal()
    await screen.findByText('送 ¥50 · 到账 ¥550')
    await clickPay('前往支付 ¥500')

    expect(await screen.findByRole('alert')).toHaveTextContent('赠金报价已更新，请确认后再前往支付')
    expect(createRecharge).not.toHaveBeenCalled()
    expect(paymentWindow.close).toHaveBeenCalled()
  })

  it('re-checks on every submit: a quote that changes again during reconfirm still blocks ordering', async () => {
    // 打开 50 → 复校验 30（变化，提示）→ 刷新展示 30 → 再点时又变 10（仍需再次确认，不得下单）
    const bonuses = ['50', '30', '30', '10']
    let i = 0
    quoteRecharges.mockReset().mockImplementation(async (_t, body) => {
      const b = bonuses[Math.min(i, bonuses.length - 1)]
      i += 1
      return { items: body.amounts.map((a) => quote(a, Number(a) === 500 ? b : '0')) }
    })
    const paymentWindow = { close: vi.fn(), closed: false, location: { href: '' } } as unknown as Window
    vi.spyOn(window, 'open').mockReturnValue(paymentWindow)

    renderModal()
    await screen.findByText('送 ¥50 · 到账 ¥550')
    await clickPay('前往支付 ¥500')
    await screen.findByRole('alert')
    await screen.findByText('送 ¥30 · 到账 ¥530')
    await clickPay('前往支付 ¥500')
    // 第二次复校验发现又变化 → 再次刷新展示（共 5 次报价），且绝不下单
    await screen.findByText('送 ¥10 · 到账 ¥510')
    expect(quoteRecharges.mock.calls.length).toBeGreaterThanOrEqual(4)
    expect(createRecharge).not.toHaveBeenCalled()
  })

  it('locks amount/channel controls while re-quoting so the order uses the clicked amount', async () => {
    let release: () => void = () => {}
    let n = 0
    quoteRecharges.mockReset().mockImplementation(async (_t, body) => {
      n += 1
      // 第二次（下单前复校验）挂起，模拟慢请求
      if (n === 2) await new Promise<void>((r) => { release = r })
      return { items: body.amounts.map((a) => quote(a, String(Number(a) / 10))) }
    })
    const paymentWindow = { close: vi.fn(), closed: false, location: { href: '' } } as unknown as Window
    vi.spyOn(window, 'open').mockReturnValue(paymentWindow)

    renderModal()
    await screen.findByText('送 ¥50 · 到账 ¥550')
    await clickPay('前往支付 ¥500')
    // 复校验进行中：金额卡被禁用，点了也不生效
    const other = screen.getByRole('button', { name: /¥100/ })
    expect(other).toBeDisabled()
    fireEvent.click(other)
    release()
    await waitFor(() => expect(createRecharge).toHaveBeenCalled())
    expect(createRecharge.mock.calls[0][1]).toMatchObject({ amount: '500', quote_id: 'q-500-50' })
  })

  // prd46#1238：报价在复校验与下单之间过期/变化，后端下单返回 40912 + data.quote
  it('on 40912 shows the latest quote from data.quote and waits for the user to confirm again', async () => {
    // 下单冲突之后，服务端报价也已是最新的 ¥20（与 data.quote 一致）
    let conflicted = false
    quoteRecharges.mockReset().mockImplementation(async (_t, body) => ({
      items: body.amounts.map((a) => (conflicted && Number(a) === 500 ? quote(a, '20', { quote_id: 'q-new' }) : quote(a, String(Number(a) / 10)))),
    }))
    createRecharge.mockImplementationOnce(async () => {
      conflicted = true
      throw apiError(40912, { quote: quote('500', '20', { quote_id: 'q-new' }) })
    })
    const paymentWindow = { close: vi.fn(), closed: false, location: { href: '' } } as unknown as Window
    vi.spyOn(window, 'open').mockReturnValue(paymentWindow)

    renderModal()
    await screen.findByText('送 ¥50 · 到账 ¥550')
    await clickPay('前往支付 ¥500')

    expect(await screen.findByRole('alert')).toHaveTextContent('赠金报价已更新，请确认后再前往支付')
    expect(await screen.findByText('送 ¥20 · 到账 ¥520')).toBeInTheDocument()
    expect(paymentWindow.close).toHaveBeenCalled()
    // 报价冲突不弹「创建失败」
    expect(toastError).not.toHaveBeenCalled()
    expect(trackEvent).toHaveBeenCalledWith(
      'billing_recharge_result',
      expect.objectContaining({ failure_reason: 'quote_changed', pay_channel: 'wechat' }),
      { result: 'fail' },
    )

    // 用户确认后再点：复校验与展示一致，放行并带新 quote_id 下单
    await clickPay('前往支付 ¥500')
    await waitFor(() => expect(createRecharge).toHaveBeenCalledTimes(2))
    expect(createRecharge.mock.calls[1][1]).toMatchObject({ amount: '500', quote_id: 'q-new' })
  })

  it('on 40912 without a usable data.quote falls back to re-quoting', async () => {
    let n = 0
    quoteRecharges.mockReset().mockImplementation(async (_t, body) => {
      n += 1
      // 打开 + 复校验都是 50；下单 40912 后重新报价拿到 0
      return { items: body.amounts.map((a) => quote(a, n <= 2 ? String(Number(a) / 10) : '0')) }
    })
    createRecharge.mockReset().mockRejectedValueOnce(apiError(40912, null))
    vi.spyOn(window, 'open').mockReturnValue({ close: vi.fn(), closed: false, location: { href: '' } } as unknown as Window)

    renderModal()
    await screen.findByText('送 ¥50 · 到账 ¥550')
    await clickPay('前往支付 ¥500')

    await screen.findByRole('alert')
    await waitFor(() => expect(screen.queryByText('送 ¥50 · 到账 ¥550')).not.toBeInTheDocument())
    expect(n).toBeGreaterThanOrEqual(3)
    expect(toastError).not.toHaveBeenCalled()
  })

  it('blocks ordering on a failed quote and lets the user retry', async () => {
    quoteRecharges.mockReset().mockRejectedValue(new Error('boom'))
    renderModal()
    expect(await screen.findByText('赠金报价获取失败')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '前往支付 ¥500' })).toBeDisabled()

    quoteRecharges.mockReset().mockImplementation(async (_t, body) => ({ items: body.amounts.map((a) => quote(a, '0')) }))
    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '前往支付 ¥500' })).toBeEnabled())
  })

  it('quotes a custom amount and shows paid + bonus / credited', async () => {
    quoteRecharges.mockReset().mockImplementation(async (_t, body) => ({
      items: body.amounts.map((a) => quote(a, Number(a) === 80 ? '8' : '0')),
    }))
    renderModal()
    await waitFor(() => expect(screen.getByRole('button', { name: '前往支付 ¥500' })).toBeEnabled())
    fireEvent.click(screen.getByRole('button', { name: /自定义额度/ }))
    fireEvent.change(screen.getByPlaceholderText('输入自定义金额'), { target: { value: '80' } })
    expect(await screen.findByText('+¥8')).toBeInTheDocument()
    expect(screen.getByText('¥88')).toBeInTheDocument()
    await waitFor(() => expect(trackEvent).toHaveBeenCalledWith('recharge_custom_amount_valid', { amount: '80' }))
  })
})

// prd#1048 第二阶段：后端可配收款主体的解析逻辑（configured 优先，未配按站点兜底）
import { wechatPayeeName } from '@/constants/recharge-channels'

describe('wechatPayeeName', () => {
  it('prefers the backend-configured payee over site fallback', () => {
    expect(wechatPayeeName('china', 'MODELGO PTE. LTD.')).toBe('MODELGO PTE. LTD.')
    expect(wechatPayeeName('global', '  ')).toBe('MODELGO PTE. LTD.')
    expect(wechatPayeeName('global')).toBe('MODELGO PTE. LTD.')
    expect(wechatPayeeName('china')).toBe('杭州词元共生科技有限公司')
    expect(wechatPayeeName(null)).toBe('杭州词元共生科技有限公司')
  })
})
