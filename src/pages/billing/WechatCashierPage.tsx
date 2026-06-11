import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { LuArrowLeft, LuCheck, LuCopy } from 'react-icons/lu'
import { WechatIcon } from '@/constants/brand-icons'
import { Button } from '@/components/ui/Button'
import { useCopy } from '@/hooks/use-copy'
import { cn } from '@/lib/utils'

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

export default function WechatCashierPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { copy, copied } = useCopy()

  const qrCodeUrl = searchParams.get('qr')?.trim() ?? ''
  const orderNo = searchParams.get('order')?.trim() ?? ''
  const amount = searchParams.get('amount')?.trim() ?? ''
  const currency = searchParams.get('currency')?.trim() || 'CNY'
  const payee = searchParams.get('payee')?.trim() || t('billing.wechatCashier.defaultPayee')
  const returnTo = useMemo(() => safeReturnTo(searchParams.get('return_to')), [searchParams])
  const displayAmount = useMemo(() => amountText(amount, currency), [amount, currency])

  const goBack = () => navigate(returnTo, { replace: true })
  const handleCopy = async () => {
    if (qrCodeUrl) await copy(qrCodeUrl)
  }

  return (
    <main className="min-h-screen bg-[#f5f5f5] text-[#1f2329]">
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

      <section className="mx-auto flex w-full max-w-[980px] flex-col items-center px-4 py-8 sm:px-6 sm:py-10">
        <div className="w-full max-w-[520px] overflow-hidden rounded-lg border border-[#e5e6eb] bg-white shadow-[0_10px_30px_rgba(31,35,41,0.08)]">
          <div className="border-b border-[#e5e6eb] px-6 py-6 text-center">
            <div className="text-xs text-[#86909c]">{t('billing.wechatCashier.payee')}</div>
            <div className="mt-1 break-words text-[17px] font-semibold text-[#1f2329]">{payee}</div>
            <div className="mt-5 text-xs text-[#86909c]">{t('billing.wechatCashier.amount')}</div>
            <div className="mt-1 font-mono text-[36px] font-semibold leading-none text-[#07c160] sm:text-[42px]">
              {displayAmount}
            </div>
          </div>

          {qrCodeUrl ? (
            <div className="px-6 py-7">
              <div
                role="img"
                aria-label={t('billing.wechatCashier.qrAria')}
                className="mx-auto flex h-[240px] w-[240px] items-center justify-center rounded-md border border-[#e5e6eb] bg-white p-4 sm:h-[260px] sm:w-[260px]"
              >
                <QRCodeSVG value={qrCodeUrl} size={220} level="M" includeMargin={false} />
              </div>

              <div className="mt-5 flex items-center justify-center gap-2 rounded-md bg-[#07c160] px-4 py-3 text-sm font-medium text-white">
                <span className="inline-flex rounded-full bg-white p-0.5">
                  <WechatIcon size={15} />
                </span>
                <span>{t('billing.wechatCashier.scanHint')}</span>
              </div>

              <div className="mt-5 space-y-2 text-center text-xs text-[#86909c]">
                {orderNo && (
                  <div>
                    {t('billing.wechatCashier.orderNo')}
                    <span className="ml-1 font-mono text-[#4e5969]">{orderNo}</span>
                  </div>
                )}
                <div>{t('billing.wechatCashier.statusHint')}</div>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Button
                  variant="outline"
                  onClick={handleCopy}
                  className={cn('h-10 rounded-md text-xs', copied && 'border-[#07c160] text-[#07c160]')}
                  icon={copied ? <LuCheck size={15} /> : <LuCopy size={15} />}
                >
                  {copied ? t('billing.wechatCashier.copied') : t('billing.wechatCashier.copy')}
                </Button>
                <Button variant="brand" onClick={goBack} className="h-10 rounded-md text-xs">
                  {t('billing.wechatCashier.done')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="px-6 py-10 text-center">
              <div className="text-sm font-semibold text-[#1f2329]">{t('billing.wechatCashier.missingTitle')}</div>
              <div className="mt-2 text-xs leading-6 text-[#86909c]">{t('billing.wechatCashier.missingDesc')}</div>
              <Button variant="brand" onClick={goBack} className="mt-6 h-10 rounded-md px-6 text-xs">
                {t('billing.wechatCashier.back')}
              </Button>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
