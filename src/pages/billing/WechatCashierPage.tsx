import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { LuArrowLeft, LuCheck, LuShieldCheck } from 'react-icons/lu'
import { WechatIcon } from '@/constants/brand-icons'
import { Button } from '@/components/ui/Button'
import { CopyButton } from '@/components/ui/CopyButton'
import { getRecharge } from '@/services/billing'

const WECHAT_GREEN = '#07c160'
const POLL_INTERVAL_MS = 3000
const REDIRECT_DELAY_S = 3

function amountText(amount: string, currency: string) {
  const normalized = Number(amount)
  const value = Number.isFinite(normalized) ? normalized.toFixed(2) : amount
  if (currency.toUpperCase() === 'CNY') return `¥${value}`
  if (currency.toUpperCase() === 'USD') return `$${value}`
  return `${currency} ${value}`
}

function safeReturnTo(raw: string | null) {
  if (!raw) return '/billing'
  try {
    const url = new URL(raw, window.location.origin)
    if (url.origin !== window.location.origin) return '/billing'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/billing'
  }
}

type PayState = 'pending' | 'paid' | 'closed'

export default function WechatCashierPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const qrCodeUrl = searchParams.get('qr')?.trim() ?? ''
  const orderNo = searchParams.get('order')?.trim() ?? ''
  const tenant = searchParams.get('tenant')?.trim() ?? ''
  const amount = searchParams.get('amount')?.trim() ?? ''
  const currency = searchParams.get('currency')?.trim() || 'CNY'
  const payee = searchParams.get('payee')?.trim() || t('billing.wechatCashier.defaultPayee')
  const returnTo = useMemo(() => safeReturnTo(searchParams.get('return_to')), [searchParams])
  const displayAmount = useMemo(() => amountText(amount, currency), [amount, currency])

  const [state, setState] = useState<PayState>('pending')
  const [countdown, setCountdown] = useState(REDIRECT_DELAY_S)

  const goBack = () => navigate(returnTo, { replace: true })

  // Poll the recharge order status until it settles. Same-origin request carries
  // the session cookie; tenant comes from the launch URL. Transient errors keep
  // polling — only a terminal status stops it.
  useEffect(() => {
    if (!tenant || !orderNo || !qrCodeUrl) return
    let active = true
    let timer: ReturnType<typeof setTimeout> | undefined
    // poll() reschedules only while the order is still pending; a terminal
    // status returns without re-arming the timer, so the loop ends on its own.
    const poll = async () => {
      try {
        const order = await getRecharge(tenant, orderNo)
        if (!active) return
        if (order.status === 'paid') {
          setState('paid')
          return
        }
        if (order.status === 'failed' || order.status === 'cancelled') {
          setState('closed')
          return
        }
      } catch {
        /* transient — keep polling */
      }
      if (active) timer = setTimeout(poll, POLL_INTERVAL_MS)
    }
    timer = setTimeout(poll, POLL_INTERVAL_MS)
    return () => {
      active = false
      if (timer) clearTimeout(timer)
    }
  }, [tenant, orderNo, qrCodeUrl])

  // On success: count down and redirect back to the billing page. countdown
  // starts at REDIRECT_DELAY_S and state only ever goes pending→paid once, so
  // no reset is needed here.
  useEffect(() => {
    if (state !== 'paid') return
    const tick = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000)
    const redirect = setTimeout(() => navigate(returnTo, { replace: true }), REDIRECT_DELAY_S * 1000)
    return () => {
      clearInterval(tick)
      clearTimeout(redirect)
    }
  }, [state, navigate, returnTo])

  return (
    <main className="min-h-screen bg-[#f5f6f7] text-[#1f2329]">
      <header className="border-b border-[#e5e6eb] bg-white">
        <div className="mx-auto flex h-16 w-full max-w-[980px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5 text-[15px] font-semibold">
            <WechatIcon size={21} />
            <span>{t('billing.wechatCashier.title')}</span>
          </div>
          <button
            type="button"
            onClick={goBack}
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-[#4e5969] transition-colors hover:bg-[#f2f3f5] hover:text-[#1f2329]"
          >
            <LuArrowLeft size={15} />
            {t('billing.wechatCashier.back')}
          </button>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-[980px] flex-col items-center px-4 py-10 sm:px-6 sm:py-14">
        <div className="w-full max-w-[440px] overflow-hidden rounded-lg border border-[#e8e9eb] bg-white shadow-[0_8px_28px_rgba(31,35,41,0.06)]">
          {/* Amount header — the focal point */}
          <div className="flex flex-col items-center gap-1 px-6 pb-6 pt-8">
            <div className="text-xs text-[#86909c]">{payee}</div>
            <div
              className="font-mono text-[40px] font-semibold leading-none tracking-tight"
              style={{ color: WECHAT_GREEN }}
            >
              {displayAmount}
            </div>
          </div>

          {state === 'paid' ? (
            <div className="border-t border-[#f0f1f2] px-6 py-12 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: WECHAT_GREEN }}>
                <LuCheck size={30} strokeWidth={3} className="text-white" />
              </div>
              <div className="mt-5 text-[17px] font-semibold text-[#1f2329]">{t('billing.wechatCashier.paidTitle')}</div>
              <div className="mt-2 text-xs text-[#86909c]">
                {t('billing.wechatCashier.redirecting', { seconds: countdown })}
              </div>
              <Button variant="brand" onClick={goBack} className="mt-7 h-10 rounded-md px-8 text-xs">
                {t('billing.wechatCashier.backNow')}
              </Button>
            </div>
          ) : qrCodeUrl ? (
            <div className="border-t border-[#f0f1f2] px-6 pb-7 pt-6">
              <div
                role="img"
                aria-label={t('billing.wechatCashier.qrAria')}
                className="mx-auto flex h-[228px] w-[228px] items-center justify-center rounded-lg border border-[#e8e9eb] bg-white p-3.5"
              >
                <QRCodeSVG value={qrCodeUrl} size={200} level="M" includeMargin={false} />
              </div>

              <div className="mt-5 flex items-center justify-center gap-2 text-sm font-medium text-[#1f2329]">
                <WechatIcon size={17} />
                <span>{t('billing.wechatCashier.scanHint')}</span>
              </div>

              {/* Live status — signals the page is actively confirming the payment */}
              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-[#86909c]">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ backgroundColor: WECHAT_GREEN }} />
                  <span className="relative inline-flex h-2 w-2 rounded-full" style={{ backgroundColor: WECHAT_GREEN }} />
                </span>
                {t('billing.wechatCashier.waiting')}
              </div>

              {orderNo && (
                <div className="mt-4 text-center text-xs text-[#a9aeb8]">
                  {t('billing.wechatCashier.orderNo')}
                  <span className="ml-1 font-mono">{orderNo}</span>
                </div>
              )}

              <div className="mt-6 grid grid-cols-2 gap-3">
                <CopyButton
                  value={qrCodeUrl}
                  variant="labeled"
                  label={t('billing.wechatCashier.copy')}
                  copiedLabel={t('billing.wechatCashier.copied')}
                  toast={false}
                  className="h-10 w-full rounded-md text-xs"
                />
                <Button variant="outline" onClick={goBack} className="h-10 rounded-md text-xs">
                  {t('billing.wechatCashier.back')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="border-t border-[#f0f1f2] px-6 py-12 text-center">
              <div className="text-sm font-semibold text-[#1f2329]">{t('billing.wechatCashier.missingTitle')}</div>
              <div className="mt-2 text-xs leading-6 text-[#86909c]">{t('billing.wechatCashier.missingDesc')}</div>
              <Button variant="brand" onClick={goBack} className="mt-6 h-10 rounded-md px-6 text-xs">
                {t('billing.wechatCashier.back')}
              </Button>
            </div>
          )}
        </div>

        {/* Trust footer */}
        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-[#a9aeb8]">
          <LuShieldCheck size={13} />
          {t('billing.wechatCashier.secure')}
        </div>
      </section>
    </main>
  )
}
