import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <svg data-testid="wechat-qr" data-value={value} />,
}))

vi.mock('@/services/billing', () => ({
  getRecharge: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const copy: Record<string, string> = {
        'billing.wechatCashier.title': '微信支付收银台',
        'billing.wechatCashier.defaultPayee': 'ModelGo',
        'billing.wechatCashier.back': '返回账单',
        'billing.wechatCashier.scanHint': '请使用微信扫一扫完成支付',
        'billing.wechatCashier.waiting': '等待支付中…',
        'billing.wechatCashier.orderNo': '订单号',
        'billing.wechatCashier.copy': '复制支付链接',
        'billing.wechatCashier.copied': '已复制',
        'billing.wechatCashier.paidTitle': '支付成功',
        'billing.wechatCashier.redirecting': '{{seconds}} 秒后自动返回账单',
        'billing.wechatCashier.backNow': '立即返回',
        'billing.wechatCashier.secure': '微信安全支付 · 信息全程加密',
        'billing.wechatCashier.qrAria': '微信支付二维码',
        'billing.wechatCashier.missingTitle': '支付二维码已失效',
        'billing.wechatCashier.missingDesc': '请返回账单页重新创建充值订单。',
      }
      const s = copy[key] ?? key
      return opts && 'seconds' in opts ? s.replace('{{seconds}}', String(opts.seconds)) : s
    },
  }),
}))

import WechatCashierPage from '@/pages/billing/WechatCashierPage'
import { getRecharge } from '@/services/billing'

const mockGetRecharge = vi.mocked(getRecharge)

function renderCashier(search: string) {
  return render(
    <MemoryRouter initialEntries={[`/billing/wechat-cashier${search}`]}>
      <Routes>
        <Route path="/billing/wechat-cashier" element={<WechatCashierPage />} />
        <Route path="/billing" element={<div>Billing page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  mockGetRecharge.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('WechatCashierPage', () => {
  it('renders payee, amount, order number, QR and the live waiting indicator', () => {
    const qrCodeUrl = 'weixin://wxpay/bizpayurl?pr=test'
    renderCashier(
      `?qr=${encodeURIComponent(qrCodeUrl)}&order=WX202606100001&amount=100&currency=CNY&payee=ModelGo&return_to=${encodeURIComponent('/billing?tab=recharge')}`
    )

    expect(screen.getByText('微信支付收银台')).toBeInTheDocument()
    expect(screen.getByText('ModelGo')).toBeInTheDocument()
    expect(screen.getByText('¥100.00')).toBeInTheDocument()
    expect(screen.getByText('WX202606100001')).toBeInTheDocument()
    expect(screen.getByText('等待支付中…')).toBeInTheDocument()
    expect(screen.getByLabelText('微信支付二维码')).toBeInTheDocument()
    expect(screen.getByTestId('wechat-qr')).toHaveAttribute('data-value', qrCodeUrl)
    // no tenant in the URL → polling never starts
    expect(mockGetRecharge).not.toHaveBeenCalled()
  })

  it('a back button returns to the billing page', () => {
    renderCashier(`?qr=${encodeURIComponent('weixin://x')}&order=WX1&amount=100&currency=CNY&return_to=${encodeURIComponent('/billing')}`)
    fireEvent.click(screen.getAllByRole('button', { name: '返回账单' })[0]!)
    expect(screen.getByText('Billing page')).toBeInTheDocument()
  })

  it('auto-confirms on payment success and redirects to billing after 3s', async () => {
    vi.useFakeTimers()
    mockGetRecharge.mockResolvedValue({ order_no: 'WX1', status: 'paid' } as never)
    renderCashier(
      `?qr=${encodeURIComponent('weixin://x')}&order=WX1&amount=100&currency=CNY&tenant=t1&return_to=${encodeURIComponent('/billing')}`
    )

    // first poll fires after the interval → getRecharge → status paid
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3100)
    })
    expect(mockGetRecharge).toHaveBeenCalledWith('t1', 'WX1')
    expect(screen.getByText('支付成功')).toBeInTheDocument()

    // 3s countdown → auto-redirect to billing
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(screen.getByText('Billing page')).toBeInTheDocument()
  })

  it('shows a recovery state when the QR code is missing', () => {
    renderCashier('?amount=100&currency=CNY')
    expect(screen.getByText('支付二维码已失效')).toBeInTheDocument()
    expect(screen.getByText('请返回账单页重新创建充值订单。')).toBeInTheDocument()
  })
})
