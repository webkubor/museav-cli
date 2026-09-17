import { useQuery } from '@tanstack/react-query'
import { getPlatformConfig } from '@/services/platform'
import { currencySymbol } from '@/features/models/model-format'
import { wechatPayeeName } from '@/constants/recharge-channels'

export function usePlatformConfig() {
  return useQuery({
    queryKey: ['platform-config'],
    queryFn: getPlatformConfig,
    staleTime: Infinity,
    retry: 1,
  })
}

/** 结算货币与符号 */
export function useCurrency() {
  const { data } = usePlatformConfig()
  const currency = data?.settlement_currency ?? 'CNY'
  // 符号映射只留 model-format.currencySymbol 一份（#372：此前 useCurrency / ModelPickerDialog /
  // CatalogFeatured / ModelsCompareModal / logs 各写一份三元或映射表，加币种就得改五处）
  const symbol = currencySymbol(currency, currency === 'CNY')
  return { currency, symbol }
}

/** 已启用的 OAuth 登录方式（排除 password） */
export function useOAuthMethods() {
  const { data } = usePlatformConfig()
  return (data?.enabled_login_methods ?? []).filter((m) => m !== 'password')
}

/**
 * 是否启用邮箱（密码）登录/注册。写活开关：驱动「邮箱登录入口」「邮箱邀请」等
 * 邮箱相关 UI 的显隐——后端在 enabled_login_methods 关掉 password 即自动隐藏。
 * 后端用 'password' 表示邮箱+密码方式；兼容未来可能的 'email' 标识。
 */
export function useEmailAuthEnabled() {
  const { data } = usePlatformConfig()
  const methods = data?.enabled_login_methods ?? []
  return methods.includes('password') || methods.includes('email')
}

/** 已启用的支付渠道 */
export function useEnabledChannels() {
  const { data } = usePlatformConfig()
  return data?.enabled_channels ?? []
}

/** 站点标识 ('china' | 'global'，API 返回，与前端 Market 同词汇) */
export function useSite() {
  const { data } = usePlatformConfig()
  return data?.site ?? null
}

/**
 * 微信收银台收款主体（prd#1048）：优先后端下发的 wechat_payee（Nacos `wechat_payee_name`，
 * 按部署环境配法律实体名），未配置时按站点兜底（国际站 MODELGO PTE. LTD. / 国内站境内公司）。
 */
export function useWechatPayee() {
  const { data } = usePlatformConfig()
  return wechatPayeeName(data?.site, data?.wechat_payee)
}
