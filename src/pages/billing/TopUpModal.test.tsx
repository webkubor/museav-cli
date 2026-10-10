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
const quote = (amount: string, bonus: string, extra: Record<string, unknown> = {}) => ({
  amount, currency: 'CNY', eligible: true, activity_active: true, rule_id: 'r1',
  bonus_amount: bonus, credited_total: String(Number(amount) + Number(bonus)),
  quote_id: `q-${amount}-${bonus}`, expires_at: '2026-10-10T12:00:00Z', ...extra,
})
const toastSuccess = vi.fn()
const toastError = vi.fn()
const useWechatPayeeMock = vi.hoisted(() => vi.fn<() => string>(() => '杭州词元共生科技有限公司'))

vi.mock('@/services/billing', () => ({
  createRecharge: (tenantId: string, body: unknown) => createRecharge(tenantId, body),
  quoteRecharges: (tenantId: string, body: { currency: string; amounts: string[] }) => quoteRecharges(tenantId, body),
}))

vi.mock('@/lib/track', () => ({ trackEvent: (...args: unknown[]) => trackEvent(...args) }))

vi.mock('@/hooks/use-platform-config', () => ({
  useCurrency: () => ({ currency: 'CNY', symbol: '¥' }),
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

  // PRD 原型 BillingRechargeModal：自定义输入框只在选中「自定义额度」卡后出现，预设不回填输入框
  it('shows the custom input only after picking the custom-amount card', async () => {
    renderModal()
    await waitFor(() => expect(quoteRecharges).toHaveBeenCalled())
    expect(screen.queryByPlaceholderText('输入自定义金额')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '¥1,000' }))
    expect(screen.getByRole('button', { name: '前往支付 ¥1,000' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /自定义额度/ }))
    const input = screen.getByPlaceholderText('输入自定义金额') as HTMLInputElement
    fireEvent.change(input, { target: { value: '888' } })
    expect(input.value).toBe('888')
    expect(screen.getByRole('button', { name: '前往支付 ¥888' })).toBeInTheDocument()
  })

  // ─── prd46#1240 首冲赠金 ───
  it('renders six presets and no bonus promise when the quote API is not live yet', async () => {
    renderModal()
    for (const label of ['¥10', '¥50', '¥100', '¥500', '¥1,000', '¥5,000']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
    await waitFor(() => expect(screen.getByRole('button', { name: '前往支付 ¥500' })).toBeEnabled())
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
    expect(await screen.findByText('首冲加赠，最高送 ¥500')).toBeInTheDocument()
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
