import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { createRecharge } from '@/services/billing'
import { useCurrency, useEnabledChannels } from '@/hooks/use-platform-config'
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

const WECHAT_PAYEE_NAME = '杭州词元共生科技有限公司'

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

interface TopUpModalProps {
  visible: boolean
  onClose: () => void
  tenantId: string
}

export function TopUpModal({ visible, onClose, tenantId }: TopUpModalProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('100')
  const [customMode, setCustomMode] = useState(false)

  const { currency, symbol: currencySymbol } = useCurrency()
  const enabledChannels = useEnabledChannels()
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

  const PRESETS = ['100', '500', '1000', '5000']

  const recharge = useMutation({
    mutationFn: () =>
      createRecharge(tenantId, {
        amount,
        currency,
        channel: effectiveChannel,
        return_url: window.location.href,
      }),
    onError: (err: Error) => appToast.requestError(err, t('billing.rechargeModal.error')),
  })

  const handleSubmit = () => {
    if (!canRecharge) return
    const paymentWindow = window.open('about:blank', '_blank')
    if (paymentWindow) paymentWindow.opener = null

    // §11.2 billing_recharge_submit：提交充值金额那一刻上报，amount_type 区分预设面额/自定义金额
    trackEvent('billing_recharge_submit', {
      amount_band: amountBand(numAmount),
      amount_type: customMode ? 'custom' : 'preset',
      pay_channel: effectiveChannel,
    })

    recharge.mutate(undefined, {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ['balance', tenantId] })
        queryClient.invalidateQueries({ queryKey: ['billing', 'recharges', tenantId] })

        const redirectURL = (effectiveChannel === 'wechat' || effectiveChannel === 'stripe_wechat') && data.payment.qr_code_url
          ? buildWechatCashierURL({
              qrCodeUrl: data.payment.qr_code_url,
              orderNo: data.order_no,
              amount,
              currency,
              payee: WECHAT_PAYEE_NAME,
              returnTo: window.location.href,
              tenant: tenantId,
            })
          : data.payment.redirect_url || data.payment.qr_code_url
        if (!redirectURL) {
          paymentWindow?.close()
          // 下单成功但拿不到支付跳转地址：视为提交侧失败，结果尚未同步到支付渠道
          trackEvent('billing_recharge_result', { result: 'fail', failure_reason: 'missing_redirect_url', pay_channel: effectiveChannel })
          appToast.error(t('billing.rechargeModal.error'))
          return
        }
        onClose()
        appToast.success(t('billing.rechargeModal.success'))
        if (paymentWindow && !paymentWindow.closed) {
          paymentWindow.location.href = redirectURL
          return
        }
        window.location.assign(redirectURL)
      },
      onError: (err: Error) => {
        paymentWindow?.close()
        // §11.2 billing_recharge_result：下单请求本身失败（跳支付渠道前），alipay/stripe 的渠道侧
        // 支付结果目前无回跳页可读取（现状缺口，非本单埋点范围），只有此处 + 微信收银台轮询能拿到结果
        trackEvent('billing_recharge_result', { result: 'fail', failure_reason: err.message || 'create_recharge_failed', pay_channel: effectiveChannel })
      },
    })
  }

  const numAmount = parseFloat(amount) || 0

  return (
    <Modal
      open={visible}
      onClose={onClose}
      title={t('billing.rechargeModal.title')}
      className="modal-glow-flow"
    >
      <div className="billing-recharge-body space-y-5">
        {/* 金额选择标签 */}
        <div>
          <div className="text-xs text-mg-text-3 font-bold mb-2.5 tracking-wider">{t('billing.rechargeModal.amount')}</div>
          <div className="billing-recharge-presets grid grid-cols-3 gap-2">
            {PRESETS.map((p) => {
              const active = amount === p && !customMode
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => { setAmount(p); setCustomMode(false) }}
                  className={cn(
                    "rounded-md border py-2.5 cursor-pointer text-center",
                    active
                      ? "border-brand-base bg-brand-glow text-brand-base"
                      : "border-mg-border text-mg-text-2 hover:text-mg-text-1 hover:border-brand-base/40"
                  )}
                >
                  {/* 需求方#433：面额加千分位（$1,000），符合海外金额阅读习惯 */}
                  <span className={cn("text-[15px] font-bold font-mono", active && "text-brand-base")}>{formatMoney(p, currencySymbol)}</span>
                </button>
              )
            })}
          </div>
          {/* 自定义金额 */}
          <div className="relative mt-2.5">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-mg-text-3 text-sm font-medium">{currencySymbol}</span>
            <input
              type="number"
              min="1"
              step="0.01"
              // 需求方#903 复验⑤：输入框始终回填当前金额，点预设面额后能看见选了多少
              // （PRD 原型 modelgo_prd/src/App.tsx 的充值弹窗就是 value={amount} 直绑）。
              // customMode 退化成**纯埋点口径**——只标记「这个数是用户自己敲的」，不再控制显隐；
              // 此前 value={customMode ? amount : ''} 让点了 ¥500 之后输入框空白，用户以为没选上。
              value={amount}
              // 不在 onFocus 里置 customMode：光点一下输入框不算改金额，否则预设选中态会平白丢掉、
              // 埋点也会把 preset 误报成 custom。真正敲了字才在 onChange 里翻牌。
              onChange={(e) => {
                // qa#282：金额最多两位小数（法币最小单位是分），禁止 0.001 这类超精度输入
                const sanitized = e.target.value.match(/^\d*\.?\d{0,2}/)?.[0] ?? e.target.value
                setAmount(sanitized)
                setCustomMode(true)
              }}
              className="w-full h-10 pl-7 pr-3 rounded-md border border-mg-border bg-transparent text-sm focus:outline-none focus:ring-1 focus:ring-brand-base/40 focus:border-brand-base transition-all font-semibold font-mono text-mg-text-1"
              placeholder={t('billing.rechargeModal.customAmount')}
            />
          </div>
        </div>

        {/* 支付方式 */}
        <div>
          <div className="text-xs text-mg-text-3 font-bold mb-2.5 tracking-wider">{t('billing.rechargeModal.method')}</div>
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
                  onClick={() => setChannel(c.value)}
                  className={cn(
                    "rounded-md border py-2.5 px-3 cursor-pointer",
                    active
                      // token 兜底：万一品牌色缺失，选中态也仍是品牌绿边框 + 正文色，
                      // 不会因为 border/文字落到 currentColor 而在暗色主题下变黑
                      ? "shadow-sm border-brand-base text-mg-text-1"
                      : "border-mg-border text-mg-text-3 hover:border-mg-text-3/30"
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

        {/* 提交 */}
        <Button
          variant="brand"
          disabled={numAmount <= 0 || recharge.isPending || !canRecharge}
          onClick={handleSubmit}
          className="w-full h-11 text-sm font-bold rounded-md"
        >
          {/* 需求方#432：币种符号跟随结算币种（此前文案里写死 ¥，国际站 USD 也显示人民币符号） */}
          {recharge.isPending
            ? t('billing.rechargeModal.submitting')
            : t('billing.rechargeModal.submit', { amount: formatMoney(numAmount, currencySymbol) })
          }
        </Button>
      </div>
    </Modal>
  )
}
