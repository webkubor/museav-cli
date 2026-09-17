/**
 * 平台配置（§十六）
 * API：GET /platform-config
 */
import { get } from '@/lib/request'

export interface PlatformConfig {
  /** 平台可用支付渠道，如 ['alipay', 'wechat'] */
  available_channels: string[]
  /** 平台可用登录方式，如 ['password', 'wechat', 'github'] */
  available_login_methods: string[]
  /** 当前已启用的支付渠道 */
  enabled_channels: string[]
  /** 当前已启用的登录方式 */
  enabled_login_methods: string[]
  /** 结算货币，如 'CNY' | 'USD' */
  settlement_currency: string
  /** 站点标识，如 'china' | 'global' */
  site: string
  /** 微信收银台收款主体（法律实体名，Nacos wechat_payee_name，prd#1048）；未配置时缺省，前端按站点兜底 */
  wechat_payee?: string
}

/** 读取全局平台配置（登录页/充值页据此展示可用渠道与登录方式） */
export function getPlatformConfig() {
  return get<PlatformConfig>('platform-config')
}
