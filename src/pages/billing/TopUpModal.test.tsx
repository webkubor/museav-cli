import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { RechargeCreated } from '@/types'

const createRecharge = vi.fn<(tenantId: string, body: unknown) => Promise<RechargeCreated>>()
const toastSuccess = vi.fn()
const toastError = vi.fn()

vi.mock('@/services/billing', () => ({
  createRecharge: (tenantId: string, body: unknown) => createRecharge(tenantId, body),
}))

vi.mock('@/hooks/use-platform-config', () => ({
  useCurrency: () => ({ currency: 'CNY', symbol: '¥' }),
  useEnabledChannels: () => ['wechat'],
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
        'billing.rechargeModal.customAmount': '自定义金额',
        'billing.rechargeModal.method': '支付方式',
        'billing.rechargeModal.submit': `前往支付 ¥${values?.amount ?? ''}`,
        'billing.rechargeModal.success': '充值订单已创建，请完成支付',
        'billing.rechargeModal.error': '创建充值订单失败',
        'billing.rechargeModal.submitting': '提交中...',
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
    toastSuccess.mockClear()
    toastError.mockClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
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
    fireEvent.click(screen.getByRole('button', { name: '前往支付 ¥100' }))

    await waitFor(() => {
      expect(paymentWindow.location.href).toContain('/billing/wechat-cashier')
    })
    const cashierURL = new URL(paymentWindow.location.href)
    expect(cashierURL.pathname).toBe('/billing/wechat-cashier')
    expect(cashierURL.searchParams.get('qr')).toBe('weixin://wxpay/bizpayurl?pr=test')
    expect(cashierURL.searchParams.get('order')).toBe('WX202606100001')
    expect(cashierURL.searchParams.get('amount')).toBe('100')
    expect(cashierURL.searchParams.get('currency')).toBe('CNY')
    expect(cashierURL.searchParams.get('payee')).toBe('杭州词元共生科技有限公司')
    expect(screen.queryByText('WX202606100001')).not.toBeInTheDocument()
    expect(close).not.toHaveBeenCalled()
    expect(createRecharge).toHaveBeenCalledWith(
      'tnt_1',
      expect.objectContaining({ channel: 'wechat', currency: 'CNY', amount: '100' })
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
    fireEvent.click(screen.getByRole('button', { name: '前往支付 ¥100' }))

    await waitFor(() => {
      expect(paymentWindow.location.href).toBe('https://wx.tenpay.com/cgi-bin/mmpayweb-bin/checkmweb?prepay_id=test')
    })
    expect(screen.queryByText('WX202606100002')).not.toBeInTheDocument()
  })
})
