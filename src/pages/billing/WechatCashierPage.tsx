import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { LuArrowLeft, LuCheck, LuCopy, LuScanQrCode, LuShieldCheck } from 'react-icons/lu'
import { WechatIcon } from '@/constants/brand-icons'
import { useCopy } from '@/hooks/use-copy'
import { appToast } from '@/lib/app-toast'
import { trackEvent } from '@/lib/track'
import { getRecharge } from '@/services/billing'

/**
 * 独立收银台配色/形态系统（"Digital Payment Core"，用户提供的设计规范）。
 * 有意不复用控制台的 --mg-* / --brand-* token 与共享 Button：
 * 1) 共享 Button 的 variant="brand" 在 CSS 里锁了 `background ... !important`，
 *    任何调用方 style 覆盖都会被样式表规则打败，无法在此实现独立配色；
 * 2) 这是脱离 DashboardLayout 的独立全页（第三方支付收银台），本就不受控制台
 *    共享设计系统约束，视觉效果优先于组件复用率。
 * 仅浅色（规范未给深色变体，不臆造）；仍复用 useCopy 等纯逻辑 hook（非 UI 组件）。
 */
const PAY = {
  primary: '#5D3FD3', // Deep Royal Purple —— CTA、进度、强调
  onPrimary: '#FFFFFF',
  secondary: '#E6E6FA', // Soft Lavender —— 次级按钮底、辅助高光
  background: '#F8F7FF', // 页面画布（纯色，非渐变）
  surface: '#FFFFFF', // 卡片
  neutral: '#1A1A1A', // 主文字
  border: '#E5E5E5',
  shadowCard: '0px 4px 20px rgba(93, 63, 211, 0.06)',
} as const

const WECHAT_GREEN = '#07c160' // 成功/等待中的语义色场景仍保留品牌绿（规范：Success 用 Green）
const POLL_INTERVAL_MS = 3000
const REDIRECT_DELAY_S = 3

/** 拆分货币符号与数值，分别渲染不同字重——数字是视觉焦点，符号退居次要。 */
function amountParts(amount: string, currency: string) {
  const normalized = Number(amount)
  const value = Number.isFinite(normalized) ? normalized.toFixed(2) : amount
  const upper = currency.toUpperCase()
  if (upper === 'CNY') return { symbol: '¥', value }
  if (upper === 'USD') return { symbol: '$', value }
  return { symbol: `${currency} `, value }
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

/** 本页专属按钮——48px 高 / 12px 圆角 / primary 深紫实底 或 secondary 淡紫底+紫字。 */
function PayButton({
  variant = 'primary',
  onClick,
  disabled,
  className = '',
  children,
}: {
  variant?: 'primary' | 'secondary'
  onClick: () => void
  disabled?: boolean
  className?: string
  children: React.ReactNode
}) {
  const style = variant === 'primary'
    ? { backgroundColor: PAY.primary, color: PAY.onPrimary }
    : { backgroundColor: PAY.secondary, color: PAY.primary }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={style}
      className={`inline-flex h-12 items-center justify-center gap-1.5 rounded-md text-sm font-semibold tracking-[0.01em] transition-[filter] hover:brightness-95 active:brightness-90 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  )
}

type PayState = 'pending' | 'paid' | 'closed'

export default function WechatCashierPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { copy, copied } = useCopy()

  const qrCodeUrl = searchParams.get('qr')?.trim() ?? ''
  const orderNo = searchParams.get('order')?.trim() ?? ''
  const tenant = searchParams.get('tenant')?.trim() ?? ''
  const amount = searchParams.get('amount')?.trim() ?? ''
  const currency = searchParams.get('currency')?.trim() || 'CNY'
  const payee = searchParams.get('payee')?.trim() || t('billing.wechatCashier.defaultPayee')
  const returnTo = useMemo(() => safeReturnTo(searchParams.get('return_to')), [searchParams])
  const { symbol: amountSymbol, value: amountValue } = useMemo(() => amountParts(amount, currency), [amount, currency])

  const [state, setState] = useState<PayState>('pending')
  const [countdown, setCountdown] = useState(REDIRECT_DELAY_S)

  const goBack = () => navigate(returnTo, { replace: true })

  // 三态关键节点埋点：缺参兜底(fail) vs 有二维码进入等待轮询(pending)。仅进页触发一次。
  useEffect(() => {
    if (!qrCodeUrl) {
      trackEvent('billing.wechat_cashier:missing_params', undefined, { result: 'fail', error_code: 'missing_params' })
    } else {
      trackEvent('billing.wechat_cashier:pending')
    }
    // 进页判定一次即可，参数来自 URL、本页生命周期内不变
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCopyLink = async () => {
    const ok = await copy(qrCodeUrl)
    if (ok) appToast.success(t('billing.wechatCashier.copied'))
    else appToast.error(t('billing.wechatCashier.copyFailed'))
  }

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
          trackEvent('billing.wechat_cashier:paid', undefined, { result: 'success' })
          // §11.2 billing_recharge_result：支付结果同步到前端（微信收银台轮询拿到终态）
          trackEvent('billing_recharge_result', { result: 'success', pay_channel: 'wechat' })
          return
        }
        if (order.status === 'failed' || order.status === 'cancelled') {
          setState('closed')
          trackEvent('billing.wechat_cashier:closed', undefined, { result: 'fail', error_code: order.status })
          trackEvent('billing_recharge_result', { result: 'fail', failure_reason: order.status, pay_channel: 'wechat' })
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
    <main className="min-h-screen" style={{ backgroundColor: PAY.background, color: PAY.neutral }}>
      <header>
        <div className="mx-auto flex h-16 w-full max-w-[980px] items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2 text-[15px] font-semibold">
            <WechatIcon size={20} />
            <span>{t('billing.wechatCashier.title')}</span>
          </div>
          <button
            type="button"
            onClick={goBack}
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium opacity-70 transition-opacity hover:opacity-100"
          >
            <LuArrowLeft size={15} />
            {t('billing.wechatCashier.back')}
          </button>
        </div>
      </header>

      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-[980px] flex-col items-center justify-center px-4 py-8 sm:px-6">
        <div
          className="relative w-full max-w-[480px] overflow-hidden rounded-lg"
          style={{ backgroundColor: PAY.surface, boxShadow: PAY.shadowCard }}
        >
          {/* 顶部进度条——轮询等待中(pending)时滑动，表示"正在处理"；支付结束后定格。
              shimmer-slide 关键帧复用 effects.css 里已全局注册的动效，不新增 CSS。 */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-1"
            style={{
              background: `linear-gradient(90deg, ${PAY.primary} 0%, ${PAY.primary}55 30%, ${PAY.secondary} 70%, ${PAY.primary}55 100%)`,
              backgroundSize: state === 'pending' ? '200% 100%' : '100% 100%',
              animation: state === 'pending' ? 'shimmer-slide 2s ease-in-out infinite' : 'none',
            }}
          />

          {/* Amount —— 与 payee 标签同级的次级信息，非巨大 hero 数字 */}
          <div className="flex flex-col items-center gap-1 px-6 pb-6 pt-8">
            <div className="text-xs font-medium" style={{ color: PAY.neutral, opacity: 0.6 }}>{payee}</div>
            <div className="text-lg font-semibold" style={{ color: PAY.primary, opacity: 0.85 }}>
              {amountSymbol}{amountValue}
            </div>
          </div>

          {state === 'paid' ? (
            <div className="px-6 py-12 text-center" style={{ borderTop: `1px solid ${PAY.border}` }}>
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: WECHAT_GREEN }}>
                <LuCheck size={30} strokeWidth={3} className="text-white" />
              </div>
              <div className="mt-5 text-[24px] font-semibold leading-[32px]">{t('billing.wechatCashier.paidTitle')}</div>
              <div className="mt-2 text-xs font-medium" style={{ opacity: 0.6 }}>
                {t('billing.wechatCashier.redirecting', { seconds: countdown })}
              </div>
              <PayButton onClick={goBack} className="mt-7 px-8">
                {t('billing.wechatCashier.backNow')}
              </PayButton>
            </div>
          ) : state === 'closed' ? (
            <div className="px-6 py-12 text-center" style={{ borderTop: `1px solid ${PAY.border}` }}>
              <div className="text-[24px] font-semibold leading-[32px]">{t('billing.wechatCashier.closedTitle')}</div>
              <div className="mt-2 text-sm leading-6" style={{ opacity: 0.6 }}>{t('billing.wechatCashier.closedDesc')}</div>
              <PayButton onClick={goBack} className="mt-6 px-6">
                {t('billing.wechatCashier.back')}
              </PayButton>
            </div>
          ) : qrCodeUrl ? (
            <div className="px-6 pb-7 pt-6" style={{ borderTop: `1px solid ${PAY.border}` }}>
              {/* 扫码取景框——四角括号（相机取景器语言），非整圈边框 */}
              <div
                role="img"
                aria-label={t('billing.wechatCashier.qrAria')}
                className="relative mx-auto flex h-[228px] w-[228px] items-center justify-center p-3.5"
              >
                <span className="absolute left-0 top-0 h-6 w-6 rounded-tl-[10px] border-l-2 border-t-2" style={{ borderColor: PAY.primary }} />
                <span className="absolute right-0 top-0 h-6 w-6 rounded-tr-[10px] border-r-2 border-t-2" style={{ borderColor: PAY.primary }} />
                <span className="absolute bottom-0 left-0 h-6 w-6 rounded-bl-[10px] border-b-2 border-l-2" style={{ borderColor: PAY.primary }} />
                <span className="absolute bottom-0 right-0 h-6 w-6 rounded-br-[10px] border-b-2 border-r-2" style={{ borderColor: PAY.primary }} />
                <QRCodeSVG value={qrCodeUrl} size={200} level="M" includeMargin={false} />
              </div>

              <div className="mt-5 flex items-center justify-center gap-2 text-sm font-medium">
                <LuScanQrCode size={17} style={{ color: PAY.primary }} />
                <span>{t('billing.wechatCashier.scanHint')}</span>
              </div>

              {/* 等待状态——纯圆点 + 文字，不加胶囊底色 */}
              <div className="mt-4 flex items-center justify-center gap-2 text-xs font-medium" style={{ color: PAY.primary }}>
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ backgroundColor: PAY.primary }} />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ backgroundColor: PAY.primary }} />
                </span>
                {t('billing.wechatCashier.waiting')}
              </div>

              {orderNo && (
                <div className="mt-4 text-center text-xs font-medium" style={{ opacity: 0.6 }}>
                  {t('billing.wechatCashier.orderNo')}
                  <span className="ml-1 font-mono">{orderNo}</span>
                </div>
              )}

              <div className="mt-6 grid grid-cols-2 gap-3">
                <PayButton variant="secondary" onClick={handleCopyLink} disabled={!qrCodeUrl}>
                  {copied ? <LuCheck size={14} /> : <LuCopy size={14} />}
                  {copied ? t('billing.wechatCashier.copied') : t('billing.wechatCashier.copy')}
                </PayButton>
                <PayButton variant="secondary" onClick={goBack}>
                  {t('billing.wechatCashier.back')}
                </PayButton>
              </div>
            </div>
          ) : (
            <div className="px-6 py-12 text-center" style={{ borderTop: `1px solid ${PAY.border}` }}>
              <div className="text-[24px] font-semibold leading-[32px]">{t('billing.wechatCashier.missingTitle')}</div>
              <div className="mt-2 text-sm leading-6" style={{ opacity: 0.6 }}>{t('billing.wechatCashier.missingDesc')}</div>
              <PayButton onClick={goBack} className="mt-6 px-6">
                {t('billing.wechatCashier.back')}
              </PayButton>
            </div>
          )}
        </div>

        {/* Trust footer — sits on the page canvas, below the card */}
        <div className="mt-6 flex items-center justify-center gap-1.5 text-xs font-medium" style={{ opacity: 0.5 }}>
          <LuShieldCheck size={13} />
          {t('billing.wechatCashier.secure')}
        </div>
      </section>
    </main>
  )
}
