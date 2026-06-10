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
        'billing.rechargeModal.wechatQrReady': '微信支付二维码已生成',
        'billing.rechargeModal.wechatQrTitle': '微信扫码支付',
        'billing.rechargeModal.wechatQrHint': '请使用微信扫描二维码完成支付',
        'billing.rechargeModal.wechatQrCopy': '复制支付链接',
        'billing.rechargeModal.wechatQrCopied': '支付链接已复制',
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

  it('renders the WeChat Native payment QR code returned by web-api', async () => {
    const close = vi.fn()
    vi.spyOn(window, 'open').mockReturnValue({ close, closed: false } as unknown as Window)

    const { container } = renderModal()
    fireEvent.click(screen.getByRole('button', { name: '前往支付 ¥100' }))

    await screen.findByText('微信扫码支付')
    expect(screen.getByText('WX202606100001')).toBeInTheDocument()
    expect(container.querySelector('svg')).toBeTruthy()
    expect(close).toHaveBeenCalled()
    expect(createRecharge).toHaveBeenCalledWith(
      'tnt_1',
      expect.objectContaining({ channel: 'wechat', currency: 'CNY', amount: '100' })
    )
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('微信支付二维码已生成'))
  })
})
