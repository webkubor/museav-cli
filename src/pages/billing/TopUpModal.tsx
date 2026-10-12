import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { createRecharge, quoteRecharges, type RechargeQuote } from '@/services/billing'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useCurrency, useEnabledChannels, useWechatPayee } from '@/hooks/use-platform-config'
import { usePermissions } from '@/hooks/use-permissions'
import { PERMS } from '@/config/permissions'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { appToast } from '@/lib/app-toast'
import { cn, formatMoney } from '@/lib/utils'
import { trackEvent } from '@/lib/track'
import {
  RECHARGE_PAYMENT_CHANNELS,
  type RechargePaymentChannel,
} from '@/constants/recharge-channels'
import { BRAND_COLORS } from '@/constants/brand-colors'
import { amountBand } from './billing-tracking'
import {
  findQuote,
  hasBonus,
  isQuoteConflictError,
  isQuoteUnavailableError,
  quoteChanged,
  quoteFromConflictError,
  quoteStatusOf,
  replaceQuote,
  sameAmount,
  type QuoteStatus,
} from './recharge-quote'

import { LuGift } from 'react-icons/lu'
// 弹框自己的样式（.billing-recharge-* / .billing-recharge-result）在 billing.css 里；
// 本组件是全局挂载的（DashboardLayout 常驻 + 账单页各入口），而 billing.css 原先只被
// 账单页 `pages/billing/index.tsx` import —— 从仪表盘/低余额提醒打开的弹框拿不到这些规则
// （手机宽度档位卡不折成两列、选中态描边丢失），这里显式 import 让组件自带样式，Vite 去重。
import './billing.css'

/**
 * 推荐档位（只是快捷入口，赠金以服务端报价为准）。
 *
 * 两站面值完全一致，只有单位符号不同（¥ / $）——2026-10-12 与需求方确认：
 * PRD 原型 BillingRechargeModal（modelgo_prd）只给了一套面值且以 $ 渲染，
 * 产品拍板国内站沿用同一组数值，「单位不一样」。因此这里收敛成一份常量，
 * 币种符号由 formatMoney 的 currencySymbol 负责。
 *
 * #1260：两站最多 5 档，第 6 格固定为「自定义额度」。`.slice(0, 5)` 写在渲染与报价
 * 请求之前，两条路径共用同一个裁剪结果。
 */
const PRESETS = ['0.1', '5', '10', '100', '500']
/** 默认选中档位（沿用改动前 CNY/USD 的默认行为，不因面值统一而改变） */
const DEFAULT_AMOUNT = '500'
/** 最低充值额：0.1（法币最小精度两位小数；原型 min=0.1 + prd46#1232） */
const MIN_AMOUNT = 0.1
const AMOUNT_PATTERN = /^\d+(?:\.\d{1,2})?$/

function buildWechatCashierURL(params: {
  qrCodeUrl: string
  orderNo: string
  amount: string
  currency: string
  payee: string
  returnTo: string
  tenant: string
}) {
  const url = new URL('/billing/wechat-cashier', window.location.origin)
  url.searchParams.set('qr', params.qrCodeUrl)
  url.searchParams.set('order', params.orderNo)
  url.searchParams.set('amount', params.amount)
  url.searchParams.set('currency', params.currency)
  url.searchParams.set('payee', params.payee)
  url.searchParams.set('return_to', params.returnTo)
  // tenant lets the cashier poll the recharge order status to auto-confirm + redirect.
  url.searchParams.set('tenant', params.tenant)
  return url.toString()
}

/** 一次提交的不可变参数：复校验与下单必须是同一组金额/币种/渠道，避免等待期间被改动 */
interface SubmitParams {
  amount: string
  currency: string
  channel: RechargePaymentChannel
  quoteId?: string
}

interface TopUpModalProps {
  visible: boolean
  onClose: () => void
  tenantId: string
}

export function TopUpModal({ visible, onClose, tenantId }: TopUpModalProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const { currency, symbol: currencySymbol } = useCurrency()
  const minAmount = MIN_AMOUNT
  // 选中项：某个预设金额，或「自定义额度」卡（原型交互：选中自定义卡才出现输入框）
  const [selected, setSelected] = useState<string>(DEFAULT_AMOUNT)
  const [customInput, setCustomInput] = useState('')
  const customMode = selected === 'custom'
  const amount = customMode ? customInput : selected
  const numAmount = Number(amount)
  const isAmountValid = AMOUNT_PATTERN.test(amount) && Number.isFinite(numAmount) && numAmount >= minAmount

  const enabledChannels = useEnabledChannels()
  const wechatPayee = useWechatPayee()
  // 提交处兜底权限（弹窗是全局单挂载点，多入口共用它）：无 billing.recharge:create 不得下单，
  // 补齐副入口（如 FirstChargeLockGate「去充值」）漏 gate 的口子
  const { hasPermission } = usePermissions()
  const canRecharge = hasPermission(PERMS.BILLING_RECHARGE_CREATE)

  const CHANNELS = enabledChannels.length
    ? RECHARGE_PAYMENT_CHANNELS.filter((c) => enabledChannels.includes(c.value))
    : RECHARGE_PAYMENT_CHANNELS

  const [channel, setChannel] = useState<RechargePaymentChannel>('alipay')
  const effectiveChannel: RechargePaymentChannel = (
    CHANNELS.some((c) => c.value === channel) ? channel : (CHANNELS[0]?.value ?? 'alipay')
  ) as RechargePaymentChannel

  // ─── 首冲赠金报价（prd46#1240）：打开弹框即取预设档报价；自定义金额防抖后单独报价 ───
  const quoteEnabled = visible && canRecharge && !!tenantId
  const presetQuotesKey = ['recharge-quotes', tenantId, currency, PRESETS.join(',')]
  const customQuoteKey = (value: string) => ['recharge-quote', tenantId, currency, value]
  const presetQuotes = useQuery({
    queryKey: presetQuotesKey,
    queryFn: () => quoteRecharges(tenantId, { currency, amounts: PRESETS }),
    enabled: quoteEnabled,
    retry: false,
    staleTime: 0,
  })
  const presetStatus: QuoteStatus = quoteStatusOf(presetQuotes)
  // 接口不存在 = 后端未上线：整个赠金能力关闭，弹框只做普通充值，不做任何赠金承诺
  const quoteUnavailable = presetStatus === 'unavailable'

  const debouncedCustom = useDebouncedValue(customInput, 400)
  const customValid = customMode && isAmountValid && debouncedCustom === customInput
  const customQuote = useQuery({
    queryKey: customQuoteKey(debouncedCustom),
    queryFn: () => quoteRecharges(tenantId, { currency, amounts: [debouncedCustom] }),
    enabled: quoteEnabled && !quoteUnavailable && customValid,
    retry: false,
    staleTime: 0,
  })

  // 加载中一律不展示旧值（react-query 重取期间仍保留上次 data）
  const presetItems = presetQuotes.isFetching ? undefined : presetQuotes.data?.items
  const currentStatus: QuoteStatus = quoteUnavailable
    ? 'unavailable'
    : !customMode
      ? presetStatus
      : customValid ? quoteStatusOf(customQuote) : 'loading'
  const currentQuote: RechargeQuote | undefined = quoteUnavailable
    ? undefined
    : !customMode
      ? findQuote(presetItems, amount)
      : customQuote.isFetching ? undefined : findQuote(customQuote.data?.items, amount)
  // 首冲资格：服务端说有资格且活动生效（原型 firstRechargeEligible）
  const eligible = !quoteUnavailable && !!presetItems?.some((q) => q.eligible && q.activity_active)
  const maxPresetBonus = (presetItems ?? []).filter((q) => hasBonus(q)).reduce((m, q) => Math.max(m, Number(q.bonus_amount)), 0)

  // 复校验发现报价变化时置位：本次不下单，展示新报价，用户再点一次才提交
  const [quoteChangedNotice, setQuoteChangedNotice] = useState(false)
  const [requoting, setRequoting] = useState(false)

  const handleClose = () => {
    setQuoteChangedNotice(false)
    onClose()
  }

  // #1241 recharge_dialog_view：每次打开、首屏报价落定后记一次
  const viewTracked = useRef(false)
  useEffect(() => {
    if (!visible) {
      viewTracked.current = false
      return
    }
    if (viewTracked.current || presetStatus === 'loading') return
    viewTracked.current = true
    trackEvent('recharge_dialog_view', {
      activity_active: eligible,
      default_amount: amount,
      quote_status: presetStatus,
    })
  }, [visible, presetStatus, eligible, amount])

  // #1241 recharge_custom_amount_valid：自定义金额输入停稳且通过校验后记一次（同值不重复）
  const lastValidCustom = useRef('')
  useEffect(() => {
    if (!customValid || lastValidCustom.current === debouncedCustom) return
    lastValidCustom.current = debouncedCustom
    trackEvent('recharge_custom_amount_valid', { amount: debouncedCustom })
  }, [customValid, debouncedCustom])

  const recharge = useMutation({
    mutationFn: (p: SubmitParams) =>
      createRecharge(tenantId, {
        amount: p.amount,
        currency: p.currency,
        channel: p.channel,
        return_url: window.location.href,
        ...(p.quoteId ? { quote_id: p.quoteId } : {}),
      }),
    onError: (err: Error) => {
      // 报价冲突不算失败：由提交处换上最新报价并提示用户重新确认
      if (isQuoteConflictError(err)) return
      appToast.requestError(err, t('billing.rechargeModal.error'))
    },
  })

  /**
   * 下单返回 40912：用 data.quote 换掉展示中的同金额报价；拿不到或金额对不上就重新报价。
   * 先取消进行中的报价请求，免得旧请求晚到把新报价覆盖回去；资格 / 活动状态变了，
   * 其余预设档的赠金也已失效（自定义金额时摘要同样读预设档），一并重新报价。
   */
  const applyConflictQuote = async (err: unknown, submitAmount: string, custom: boolean, shown?: RechargeQuote) => {
    const latest = quoteFromConflictError(err)
    if (!latest || !sameAmount(latest.amount, submitAmount)) {
      presetQuotes.refetch()
      if (custom) customQuote.refetch()
      return
    }
    const patch = (old?: { items: RechargeQuote[] }) => (old ? { items: replaceQuote(old.items, latest) } : old)
    const targetKey = custom ? customQuoteKey(submitAmount) : presetQuotesKey
    await queryClient.cancelQueries({ queryKey: targetKey, exact: true })
    queryClient.setQueryData(targetKey, patch)
    if (!shown || shown.eligible !== latest.eligible || shown.activity_active !== latest.activity_active) {
      presetQuotes.refetch()
    }
  }

  const handleSubmit = async () => {
    if (!canRecharge || !isAmountValid || requoting) return
    // 点击这一刻锁定提交参数；复校验期间金额/渠道控件也会禁用
    const submit: SubmitParams = { amount, currency, channel: effectiveChannel }
    const shownQuote = currentQuote
    const submitCustom = customMode
    // 先同步开窗（在点击手势内），避免下面的 await 让浏览器拦截弹窗
    const paymentWindow = window.open('about:blank', '_blank')
    if (paymentWindow) paymentWindow.opener = null

    // 下单前复校验：重新报价，资格或赠金变化时要求用户重新确认，不凭前端旧值下单
    if (!quoteUnavailable) {
      setRequoting(true)
      try {
        const fresh = findQuote((await quoteRecharges(tenantId, { currency: submit.currency, amounts: [submit.amount] })).items, submit.amount)
        // 每次都比较展示值与最新报价：二次确认期间报价再变，也要再次确认，不能凭 notice 状态放行
        if (quoteChanged(shownQuote, fresh)) {
          paymentWindow?.close()
          setQuoteChangedNotice(true)
          presetQuotes.refetch()
          if (customMode) customQuote.refetch()
          return
        }
        submit.quoteId = fresh?.quote_id
      } catch (err) {
        if (!isQuoteUnavailableError(err)) {
          paymentWindow?.close()
          appToast.error(t('billing.rechargeModal.quoteFailed'))
          return
        }
      } finally {
        setRequoting(false)
      }
    }
    setQuoteChangedNotice(false)

    // §11.2 billing_recharge_submit：提交充值金额那一刻上报，amount_type 区分预设面额/自定义金额
    trackEvent('billing_recharge_submit', {
      amount_band: amountBand(submit.amount),
      amount_type: customMode ? 'custom' : 'preset',
      pay_channel: submit.channel,
    })
    // #1241 recharge_payment_submit：实付 / 赠金 / 渠道 / 报价状态
    trackEvent('recharge_payment_submit', {
      amount: submit.amount,
      bonus_amount: hasBonus(shownQuote) ? shownQuote.bonus_amount : '0',
      pay_channel: submit.channel,
      quote_status: currentStatus,
    })

    recharge.mutate(submit, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ['balance', tenantId] })
        queryClient.invalidateQueries({ queryKey: ['billing', 'recharges', tenantId] })

        const redirectURL = (submit.channel === 'wechat' || submit.channel === 'stripe_wechat') && data.payment.qr_code_url
          ? buildWechatCashierURL({
              qrCodeUrl: data.payment.qr_code_url,
              orderNo: data.order_no,
              amount: submit.amount,
              currency: submit.currency,
              payee: wechatPayee,
              returnTo: window.location.href,
              tenant: tenantId,
            })
          : data.payment.redirect_url || data.payment.qr_code_url
        if (!redirectURL) {
          paymentWindow?.close()
          // 下单成功但拿不到支付跳转地址：视为提交侧失败，结果尚未同步到支付渠道
          trackEvent('billing_recharge_result', { result: 'fail', failure_reason: 'missing_redirect_url', pay_channel: submit.channel })
          appToast.error(t('billing.rechargeModal.error'))
          return
        }
        handleClose()
        appToast.success(t('billing.rechargeModal.success'))
        if (paymentWindow && !paymentWindow.closed) {
          paymentWindow.location.href = redirectURL
          return
        }
        window.location.assign(redirectURL)
      },
      onError: (err: Error) => {
        paymentWindow?.close()
        if (isQuoteConflictError(err)) {
          setQuoteChangedNotice(true)
          void applyConflictQuote(err, submit.amount, submitCustom, shownQuote)
          trackEvent('billing_recharge_result', { result: 'fail', failure_reason: 'quote_changed', pay_channel: submit.channel })
          return
        }
        // §11.2 billing_recharge_result：下单请求本身失败（跳支付渠道前），alipay/stripe 的渠道侧
        // 支付结果目前无回跳页可读取（现状缺口，非本单埋点范围），只有此处 + 微信收银台轮询能拿到结果
        trackEvent('billing_recharge_result', { result: 'fail', failure_reason: err.message || 'create_recharge_failed', pay_channel: submit.channel })
      },
    })
  }

  // 复校验 / 下单进行中锁住金额与渠道，保证提交参数不变
  const controlsLocked = requoting || recharge.isPending
  const quoteBlocking = !quoteUnavailable && isAmountValid && (currentStatus === 'loading' || currentStatus === 'error')
  const fmt = (v: string | number) => formatMoney(v, currencySymbol)
  // 档位副行：有小数时补足两位（$2.1 → $2.10），读起来像金额而不是数值
  const fmtCents = (v: string | number) => {
    const n = Number(v)
    return Number.isFinite(n) && !Number.isInteger(n)
      ? `${currencySymbol}${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : fmt(v)
  }
  const bonusShown = hasBonus(currentQuote) ? currentQuote.bonus_amount : '0'
  const creditedShown = currentQuote ? currentQuote.credited_total : amount
  const quotePending = eligible && isAmountValid && currentStatus === 'loading'
  const retryQuote = () => (customMode ? customQuote.refetch() : presetQuotes.refetch())

  const selectPreset = (p: string) => {
    setSelected(p)
    setQuoteChangedNotice(false)
    // #1241 recharge_amount_select
    trackEvent('recharge_amount_select', { amount: p, bonus_hit: hasBonus(findQuote(presetItems, p)), quote_status: presetStatus })
  }

  // 档位卡尺寸对齐 PRD 原型（redesign.css `.billing-recharge-presets button`：min-height 53px、
  // 纵向居中、金额 + 赠金副行两行结构）。高度走控件档 token：原型 53px 落在本控制台的
  // xl 控件档（56px），有副行/无副行的卡片等高，不会因为没赠金就矮一截（需求方 2026-10-10 反馈）。
  // 触觉（悬停抬升 / 按压回弹 / 焦点环 / 减弱动效）走 billing.css 的 .billing-choice 六态，
  // 这里只留布局与状态配色 —— 两处都写 transition 会互相整条覆盖。
  const cardClass = (active: boolean) => cn(
    'billing-choice flex min-h-[var(--mg-control-height-xl)] flex-col items-center justify-center rounded-md border py-2 px-2 cursor-pointer text-center disabled:cursor-not-allowed disabled:opacity-60',
    active
      ? 'border-brand-base bg-brand-glow text-brand-base'
      : 'border-mg-border text-mg-text-2 hover:text-mg-text-1'
  )

  // 弹框宽度走 billing-recharge-dialog（billing.css）：DialogContent 按内容定宽，本弹框内容
  // 固定，宽屏上会永远缩成一条 ~498px 的窄柱 —— 给它一条随视口走的宽度曲线（需求方 2026-10-10）。
  return (
    <Modal
      open={visible}
      onClose={handleClose}
      title={t('billing.rechargeModal.title')}
      className="modal-glow-flow billing-recharge-dialog"
    >
      <div className="billing-recharge-body space-y-5">
        {/* 充值金额：标题 + 首冲加赠摘要（原型 billing-recharge-heading） */}
        <section aria-labelledby="billing-recharge-amount-label">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div id="billing-recharge-amount-label" className="text-xs text-mg-text-2 font-bold tracking-wider">{t('billing.rechargeModal.amount')}</div>
            {eligible && maxPresetBonus > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-brand-base/25 bg-brand-selected-bg text-xs font-semibold text-brand-base">
                <LuGift size={12} aria-hidden="true" />
                {t('billing.rechargeModal.bonusSummary', { max: fmt(maxPresetBonus) })}
              </span>
            )}
          </div>
          <div className="billing-recharge-presets grid grid-cols-3 gap-2">
            {PRESETS.map((p) => {
              const active = !customMode && sameAmount(selected, p)
              const quote = findQuote(presetItems, p)
              const line = hasBonus(quote)
                ? t('billing.rechargeModal.bonusPreset', { bonus: fmtCents(quote.bonus_amount), total: fmtCents(quote.credited_total) })
                : ''
              return (
                <button key={p} type="button" aria-pressed={active} disabled={controlsLocked} onClick={() => selectPreset(p)} className={cardClass(active)}>
                  {/* 需求方#433：面额加千分位（$1,000），符合海外金额阅读习惯 */}
                  <strong className={cn('block text-base font-bold font-mono tabular-nums', active && 'text-brand-base')}>{fmt(p)}</strong>
                  {/* 副行（赠金/到账）在选中态跟着品牌色：整张卡一起亮，选中焦点才明确 */}
                  {line && (
                    <span className={cn('block mt-0.5 text-xs leading-snug truncate', active ? 'text-brand-base' : 'text-mg-text-2')} title={line}>{line}</span>
                  )}
                </button>
              )
            })}
            {/* 原型：第 6 张「自定义额度」卡，选中后才出现输入框 */}
            <button type="button" aria-pressed={customMode} disabled={controlsLocked} onClick={() => { setSelected('custom'); setQuoteChangedNotice(false) }} className={cardClass(customMode)}>
              <strong className={cn('block text-sm font-bold', customMode && 'text-brand-base')}>{t('billing.rechargeModal.customCard')}</strong>
              <span className="block mt-0.5 text-xs text-mg-text-2">{t('billing.rechargeModal.customCardHint')}</span>
            </button>
          </div>
          {customMode && (
            // group 给前缀符号用：聚焦输入框时货币符号一起转品牌色（group-focus-within），
            // 视线从一个点进到「输入态」，而不是只有一个光标在闪
            <div className="group relative mt-2.5">
              <span
                className="absolute left-3 top-1/2 -translate-y-1/2 text-mg-text-2 text-sm font-medium transition-colors duration-200 group-focus-within:text-brand-base"
                aria-hidden="true"
              >
                {currencySymbol}
              </span>
              <input
                aria-label={t('billing.rechargeModal.customAmount')}
                aria-invalid={!isAmountValid}
                autoComplete="off"
                autoFocus
                disabled={controlsLocked}
                // type=text + inputMode=decimal 而不是 type=number：后者的原生上下箭头
                // （Chrome 悬停才显形）和「滚轮划过就改金额」都是金额输入的事故源，
                // 精度与字符本来就由下面的 qa#282 兜（只允许数字与两位小数），
                // 移动端照样出数字键盘。
                inputMode="decimal"
                type="text"
                value={customInput}
                onChange={(e) => {
                  // qa#282：金额最多两位小数（法币最小单位是分），禁止 0.001 这类超精度输入
                  const sanitized = e.target.value.match(/^\d*\.?\d{0,2}/)?.[0] ?? e.target.value
                  setCustomInput(sanitized)
                  setQuoteChangedNotice(false)
                }}
                className="w-full h-10 pl-7 pr-3 rounded-md border border-mg-border bg-transparent text-sm font-semibold font-mono tabular-nums text-mg-text-1 placeholder:font-normal placeholder:text-mg-text-4 hover:border-mg-text-3/40 focus:outline-none focus:ring-1 focus:ring-brand-base/40 focus:border-brand-base transition-[border-color,box-shadow] duration-200"
                placeholder={t('billing.rechargeModal.customAmount')}
              />
            </div>
          )}
          {presetStatus === 'error' && (
            <div className="mt-2 flex items-center gap-2 text-xs text-mg-text-2">
              <span>{t('billing.rechargeModal.quoteFailed')}</span>
              <Button variant="link" size="sm" onClick={() => presetQuotes.refetch()}>{t('billing.rechargeModal.quoteRetry')}</Button>
            </div>
          )}
        </section>

        {/* 明细（原型 billing-recharge-breakdown）：支付 / 获得 两张卡纵排。
            原型 CSS 是单列 grid（无 grid-template-columns），此前实现成 sm 以上两列，
            与原型不符（需求方 2026-10-10：「支付和到账总额纵向展示」）。

            层次（需求方 2026-10-10「视觉上有点层次」，只动字重/色阶，不动文案与排列）：
            行标签 12px 常规、行值 14px 半粗、总额 16px 加粗 —— 12 / 14 / 16 三档各差 2px，
            扫读时先看见金额再看标签。「获得」卡是这次充值的结果，整卡描边走
            .billing-recharge-result（见 billing.css），总额认品牌色。
            ⚠️ 标签色一律 text-2 不下探到 text-3：浅色主体上 text-3 实测只有 3.43:1，
            12px 属小字，WCAG AA 要 4.5:1（text-2 = 5.13:1）。层次靠字号+字重拉开，
            不靠把字调灰。 */}
        <div className="grid grid-cols-1 gap-2.5" aria-live="polite">
          <section className="mg-tile p-3 space-y-1.5" aria-labelledby="billing-recharge-pay-title">
            <h3 id="billing-recharge-pay-title" className="text-xs font-bold text-mg-text-2 tracking-wider">{t('billing.rechargeModal.payTitle')}</h3>
            <div className="flex items-baseline justify-between gap-2 text-xs text-mg-text-2">
              <span>{t('billing.rechargeModal.amount')}</span>
              <span className="font-mono tabular-nums text-sm font-semibold text-mg-text-2">{isAmountValid ? fmt(amount) : '—'}</span>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <strong className="text-xs font-bold text-mg-text-2">{t('billing.rechargeModal.payTotal')}</strong>
              <strong className="font-mono tabular-nums text-base font-bold text-mg-text-1">{isAmountValid ? fmt(amount) : '—'}</strong>
            </div>
          </section>
          <section className="mg-tile billing-recharge-result p-3 space-y-1.5" aria-labelledby="billing-recharge-get-title">
            <h3 id="billing-recharge-get-title" className="text-xs font-bold text-mg-text-2 tracking-wider">{t('billing.rechargeModal.getTitle')}</h3>
            <div className="flex items-baseline justify-between gap-2 text-xs text-mg-text-2">
              <span>{t('billing.rechargeModal.getMain')}</span>
              <span className="font-mono tabular-nums text-sm font-semibold text-mg-text-1">{isAmountValid ? fmt(amount) : '—'}</span>
            </div>
            {/* 赠金行：只在服务端确认有资格且活动生效时出现；加载中不展示旧值，失败可重试 */}
            {eligible && (
              <div className="flex items-baseline justify-between gap-2 text-xs text-mg-text-2">
                <span>{t('billing.rechargeModal.getBonus')}</span>
                {currentStatus === 'error' && isAmountValid ? (
                  <Button variant="link" size="sm" onClick={retryQuote}>{t('billing.rechargeModal.quoteRetry')}</Button>
                ) : !isAmountValid ? (
                  <span className="font-mono tabular-nums text-sm font-semibold text-mg-text-2">—</span>
                ) : quotePending ? (
                  <span>{t('billing.rechargeModal.quoteLoading')}</span>
                ) : (
                  <span className={cn('font-mono tabular-nums text-sm font-semibold', Number(bonusShown) > 0 ? 'text-brand-base' : 'text-mg-text-2')}>
                    +{fmt(bonusShown)}
                  </span>
                )}
              </div>
            )}
            <div className="flex items-baseline justify-between gap-2">
              <strong className="text-xs font-bold text-mg-text-2">{t('billing.rechargeModal.getTotal')}</strong>
              <strong className="font-mono tabular-nums text-base font-bold text-brand-base">
                {!isAmountValid ? '—' : quotePending ? t('billing.rechargeModal.quoteLoading') : fmt(creditedShown)}
              </strong>
            </div>
          </section>
        </div>
        {!isAmountValid && (
          <p className="text-xs text-mg-text-2" id="billing-recharge-input-hint">
            {t('billing.rechargeModal.amountHint', { min: fmt(minAmount) })}
          </p>
        )}
        {quoteChangedNotice && (
          <div role="alert" className="text-xs font-medium text-mg-warning">
            {t('billing.rechargeModal.quoteChanged')}
          </div>
        )}

        {/* 支付方式 */}
        <div>
          <div className="text-xs text-mg-text-2 font-bold mb-2.5 tracking-wider">{t('billing.rechargeModal.method')}</div>
          <div className="billing-recharge-channels grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {CHANNELS.map((c) => {
              const active = effectiveChannel === c.value
              // 品牌色/图标只认 option 自带的 brand/Icon（constants/recharge-channels 是真源），
              // 这里不再按 value 自建映射表——新增渠道时忘了同步就是需求方#903 的黑框黑字
              const color = BRAND_COLORS[c.brand]
              const ChannelIcon = c.Icon
              return (
                <button
                  key={c.value}
                  type="button"
                  aria-pressed={active}
                  disabled={controlsLocked}
                  onClick={() => setChannel(c.value)}
                  className={cn(
                    // 悬停/按压/焦点同样走 .billing-channel（原先 hover 改边框却没有过渡，是跳变的）
                    "billing-channel rounded-md border py-2.5 px-3 cursor-pointer disabled:cursor-not-allowed disabled:opacity-60",
                    active
                      // token 兜底：万一品牌色缺失，选中态也仍是品牌绿边框 + 正文色，
                      // 不会因为 border/文字落到 currentColor 而在暗色主题下变黑
                      ? "shadow-sm border-brand-base text-mg-text-1"
                      : "border-mg-border text-mg-text-2 hover:text-mg-text-1"
                  )}
                  style={active && color ? {
                    borderColor: color,
                    backgroundColor: `${color}0D`,
                  } : undefined}
                >
                  <span className="flex items-center justify-center gap-2">
                    <ChannelIcon size={22} />
                    <span className={cn("text-[13px] font-bold", active ? "" : "text-mg-text-2")} style={active && color ? { color } : undefined}>{t(c.labelKey)}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* 提交：按钮只显示实付金额，赠金不算进「前往支付」，避免误解为支付额 */}
        <Button
          variant="brand"
          disabled={!isAmountValid || recharge.isPending || requoting || quoteBlocking || !canRecharge}
          onClick={handleSubmit}
          className="w-full h-11 text-sm font-bold rounded-md"
        >
          {recharge.isPending || requoting
            ? t('billing.rechargeModal.submitting')
            : t('billing.rechargeModal.submit', { amount: isAmountValid ? fmt(amount) : '' })
          }
        </Button>
      </div>
    </Modal>
  )
}
