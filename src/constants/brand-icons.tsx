/**
 * 第三方品牌图标 SSOT
 * 支付渠道、OAuth 登录等品牌 logo 统一从此处导入，禁止在业务组件内直接引用 react-icons/si 品牌图标。
 */
import { SiAlipay, SiWechat, SiStripe } from 'react-icons/si'

export const BRAND_COLORS = {
  alipay: '#1677FF',
  wechat: '#07C160',
  stripe: '#635BFF',
} as const

export function AlipayIcon({ size = 18 }: { size?: number }) {
  return <SiAlipay size={size} style={{ color: BRAND_COLORS.alipay, flexShrink: 0 }} />
}

export function WechatIcon({ size = 18 }: { size?: number }) {
  return <SiWechat size={size} style={{ color: BRAND_COLORS.wechat, flexShrink: 0 }} />
}

export function StripeIcon({ size = 18 }: { size?: number }) {
  return <SiStripe size={size} style={{ color: BRAND_COLORS.stripe, flexShrink: 0 }} />
}
