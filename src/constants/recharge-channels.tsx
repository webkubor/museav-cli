import type { ReactNode } from 'react'
import { AlipayIcon, StripeIcon, WechatIcon } from './brand-icons'

export const RECHARGE_PAYMENT_CHANNEL_KEYS = ['alipay', 'wechat', 'stripe', 'stripe_wechat', 'stripe_alipay'] as const
export type RechargePaymentChannel = (typeof RECHARGE_PAYMENT_CHANNEL_KEYS)[number]

export const RECHARGE_CHANNEL_KEYS = ['alipay', 'wechat', 'stripe', 'manual', 'stripe_wechat', 'stripe_alipay'] as const
export type RechargeChannelKey = (typeof RECHARGE_CHANNEL_KEYS)[number]

export const RECHARGE_SOURCE_KEYS = ['admin_credit', 'admin_adjust', 'reward_balance'] as const
export type RechargeSourceKey = (typeof RECHARGE_SOURCE_KEYS)[number]

export interface RechargePaymentChannelOption {
  value: RechargePaymentChannel
  labelKey: string
  cnLabel: string
  icon: ReactNode
}

export const RECHARGE_PAYMENT_CHANNELS: RechargePaymentChannelOption[] = [
  { value: 'alipay', labelKey: 'billing.paymentMethod.alipay', cnLabel: '支付宝', icon: <AlipayIcon /> },
  { value: 'wechat', labelKey: 'billing.paymentMethod.wechat', cnLabel: '微信支付', icon: <WechatIcon /> },
  { value: 'stripe', labelKey: 'billing.paymentMethod.stripe', cnLabel: 'Stripe', icon: <StripeIcon /> },
  // Intl WeChat/Alipay via Stripe (prd#899): shown by wallet name + icon; the
  // Stripe clearing is invisible to the user (WeChat -> our QR cashier, Alipay ->
  // direct redirect).
  { value: 'stripe_wechat', labelKey: 'billing.paymentMethod.stripe_wechat', cnLabel: '微信支付', icon: <WechatIcon /> },
  { value: 'stripe_alipay', labelKey: 'billing.paymentMethod.stripe_alipay', cnLabel: '支付宝', icon: <AlipayIcon /> },
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
