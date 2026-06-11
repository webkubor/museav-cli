import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

vi.mock('qrcode.react', () => ({
  QRCodeSVG: ({ value }: { value: string }) => <svg data-testid="wechat-qr" data-value={value} />,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const copy: Record<string, string> = {
        'billing.wechatCashier.title': '微信支付收银台',
        'billing.wechatCashier.defaultPayee': 'ModelGo',
        'billing.wechatCashier.payee': '收款方',
        'billing.wechatCashier.amount': '收款金额',
        'billing.wechatCashier.back': '返回账单',
        'billing.wechatCashier.scanHint': '请使用微信扫一扫完成支付',
        'billing.wechatCashier.statusHint': '支付成功后，订单状态会由系统自动确认并入账。',
        'billing.wechatCashier.orderNo': '订单号',
        'billing.wechatCashier.copy': '复制支付链接',
        'billing.wechatCashier.copied': '已复制',
        'billing.wechatCashier.done': '完成后返回账单',
        'billing.wechatCashier.qrAria': '微信支付二维码',
        'billing.wechatCashier.missingTitle': '支付二维码已失效',
        'billing.wechatCashier.missingDesc': '请返回账单页重新创建充值订单。',
      }
      return copy[key] ?? key
    },
  }),
}))

import WechatCashierPage from '@/pages/billing/WechatCashierPage'

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

describe('WechatCashierPage', () => {
  it('renders payee, amount, order number, and QR code', () => {
    const qrCodeUrl = 'weixin://wxpay/bizpayurl?pr=test'
    renderCashier(
      `?qr=${encodeURIComponent(qrCodeUrl)}&order=WX202606100001&amount=100&currency=CNY&payee=ModelGo&return_to=${encodeURIComponent('/billing?tab=recharge')}`
    )

    expect(screen.getByText('微信支付收银台')).toBeInTheDocument()
    expect(screen.getByText('ModelGo')).toBeInTheDocument()
    expect(screen.getByText('¥100.00')).toBeInTheDocument()
    expect(screen.getByText('WX202606100001')).toBeInTheDocument()
    expect(screen.getByLabelText('微信支付二维码')).toBeInTheDocument()
    expect(screen.getByTestId('wechat-qr')).toHaveAttribute('data-value', qrCodeUrl)

    fireEvent.click(screen.getByRole('button', { name: '完成后返回账单' }))
    expect(screen.getByText('Billing page')).toBeInTheDocument()
  })

  it('shows a recovery state when the QR code is missing', () => {
    renderCashier('?amount=100&currency=CNY')

    expect(screen.getByText('支付二维码已失效')).toBeInTheDocument()
    expect(screen.getByText('请返回账单页重新创建充值订单。')).toBeInTheDocument()
  })
})
