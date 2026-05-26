import type { Market } from '@/lib/market'
import { useLangStore } from '@/store/use-brand-store'

export function useMarket(): Market {
  return useLangStore((state) => state.market)
}
