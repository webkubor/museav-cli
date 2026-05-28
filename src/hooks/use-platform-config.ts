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

export function useCurrency() {
  const { data } = usePlatformConfig()
  const currency = data?.settlement_currency ?? 'CNY'
  const symbol = currency === 'USD' ? '$' : '¥'
  return { currency, symbol }
}
