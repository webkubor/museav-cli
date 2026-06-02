import { useQuery } from '@tanstack/react-query'
import { getPlatformConfig } from '@/services/platform'

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
  const symbol = currency === 'USD' ? '$' : '¥'
  return { currency, symbol }
}

/** 已启用的 OAuth 登录方式（排除 password） */
export function useOAuthMethods() {
  const { data } = usePlatformConfig()
  return (data?.enabled_login_methods ?? []).filter((m) => m !== 'password')
}

/** 已启用的支付渠道 */
export function useEnabledChannels() {
  const { data } = usePlatformConfig()
  return data?.enabled_channels ?? []
}

/** 站点标识 ('china' | 'international'，API 返回) */
export function useSite() {
  const { data } = usePlatformConfig()
  return data?.site ?? null
}
