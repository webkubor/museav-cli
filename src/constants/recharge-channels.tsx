import type { ReactNode } from 'react'
import { AlipayIcon, StripeIcon, WechatIcon } from './brand-icons'
import type { BrandKey } from './brand-colors'

export const RECHARGE_PAYMENT_CHANNEL_KEYS = ['alipay', 'wechat', 'stripe', 'stripe_wechat', 'stripe_alipay'] as const
export type RechargePaymentChannel = (typeof RECHARGE_PAYMENT_CHANNEL_KEYS)[number]

/**
 * WeChat 收银台展示的收款主体，是随站点变化的**法律实体名**，不是品牌名、也不是可翻译文案：
 * 国内站是境内公司，国际站是新加坡实体。useSite() 返回 'china' | 'global'（platform_config）。
 *
 * 2026-09-17 修（prd#1048）：国际站原先写的是品牌名 `Modelgo AI`，不是法律实体 ——
 * 用户在收银台看到的收款方与实际收款主体对不上，是合规展示问题，不是文案问题。
 * 其余渠道（Stripe 卡 / 支付宝）跳官方页、主体名本来就对，只有自渲染的微信收银台错。
 *
 * 这两个常量是**兜底值**：完整链路是后端 Nacos 出 `wechat_payee_name`、
 * `platform_config.wechat_payee` 带给前端（configured 参数），未配置时才按站点兜底。
 * 页面侧统一走 useWechatPayee()（use-platform-config），不要直接调这个函数。
 */
export const WECHAT_PAYEE_CN = '杭州词元共生科技有限公司'
export const WECHAT_PAYEE_INTL = 'MODELGO PTE. LTD.'
export function wechatPayeeName(site: string | null | undefined, configured?: string | null): string {
  return configured?.trim() || (site === 'global' ? WECHAT_PAYEE_INTL : WECHAT_PAYEE_CN)
}

export const RECHARGE_CHANNEL_KEYS = ['alipay', 'wechat', 'stripe', 'manual', 'stripe_wechat', 'stripe_alipay'] as const
export type RechargeChannelKey = (typeof RECHARGE_CHANNEL_KEYS)[number]

export const RECHARGE_SOURCE_KEYS = ['admin_credit', 'admin_adjust', 'reward_balance'] as const
export type RechargeSourceKey = (typeof RECHARGE_SOURCE_KEYS)[number]

export interface RechargePaymentChannelOption {
  value: RechargePaymentChannel
  labelKey: string
  cnLabel: string
  /** 渠道图标组件，尺寸由使用处决定（弹窗 22、行内 18） */
  Icon: (props: { size?: number }) => ReactNode
  /**
   * 该渠道用哪个钱包品牌的视觉资产（主色）。选中态的边框/文字/浅底一律由它推出，
   * 消费方不得再按 value 自建颜色表——需求方#903 就是漏了这一步：国际站新增的
   * stripe_wechat/stripe_alipay 在 TopUpModal 本地色表里查不到 key，选中态既没边框色也没
   * 文字色，暗色主题下双双落到 currentColor 变成黑框黑字。
   */
  brand: BrandKey
}

export const RECHARGE_PAYMENT_CHANNELS: RechargePaymentChannelOption[] = [
  { value: 'alipay', labelKey: 'billing.paymentMethod.alipay', cnLabel: '支付宝', Icon: AlipayIcon, brand: 'alipay' },
  { value: 'wechat', labelKey: 'billing.paymentMethod.wechat', cnLabel: '微信支付', Icon: WechatIcon, brand: 'wechat' },
  { value: 'stripe', labelKey: 'billing.paymentMethod.stripe', cnLabel: 'Stripe', Icon: StripeIcon, brand: 'stripe' },
  // Intl WeChat/Alipay via Stripe (prd#899): shown by wallet name + icon; the
  // Stripe clearing is invisible to the user (WeChat -> our QR cashier, Alipay ->
  // direct redirect). 视觉上就是微信/支付宝，Icon/brand 都跟着钱包走、不跟清算通道走。
  { value: 'stripe_wechat', labelKey: 'billing.paymentMethod.stripe_wechat', cnLabel: '微信支付', Icon: WechatIcon, brand: 'wechat' },
  { value: 'stripe_alipay', labelKey: 'billing.paymentMethod.stripe_alipay', cnLabel: '支付宝', Icon: AlipayIcon, brand: 'alipay' },
]

export const RECHARGE_CHANNEL_CN_LABELS: Record<RechargeChannelKey, string> = {
  alipay: '支付宝',
  wechat: '微信',
  stripe: 'Stripe',
  manual: '管理员充值',
  stripe_wechat: '微信支付',
  stripe_alipay: '支付宝',
}

export const RECHARGE_SOURCE_CN_LABELS: Record<RechargeSourceKey, string> = {
  admin_credit: '管理员充值',
  admin_adjust: '管理员扣减',
  reward_balance: '奖励余额',
}

interface RechargeChannelLabelInput {
  channel?: string | null
  source?: string | null
  channelLabel?: string | null
}

export function getRechargeChannelDisplayName({
  channel,
  source,
  channelLabel,
}: RechargeChannelLabelInput) {
  const explicitLabel = channelLabel?.trim()
  if (explicitLabel) return explicitLabel

  const channelKey = normalizeRechargeKey(channel)
  const sourceKey = normalizeRechargeKey(source)
  if (channelKey === 'manual' && isRechargeSourceKey(sourceKey)) {
    return RECHARGE_SOURCE_CN_LABELS[sourceKey]
  }
  if (isRechargeChannelKey(channelKey)) {
    return RECHARGE_CHANNEL_CN_LABELS[channelKey]
  }
  return channel?.trim() ?? ''
}

export function getRechargeOrderChannelDisplayName(order: {
  channel?: string | null
  source?: string | null
  channel_label?: string | null
}) {
  return getRechargeChannelDisplayName({
    channel: order.channel,
    source: order.source,
    channelLabel: order.channel_label,
  })
}

function normalizeRechargeKey(value?: string | null) {
  return value?.trim().toLowerCase() ?? ''
}

function isRechargeChannelKey(value: string): value is RechargeChannelKey {
  return Object.prototype.hasOwnProperty.call(RECHARGE_CHANNEL_CN_LABELS, value)
}

function isRechargeSourceKey(value: string): value is RechargeSourceKey {
  return Object.prototype.hasOwnProperty.call(RECHARGE_SOURCE_CN_LABELS, value)
}
