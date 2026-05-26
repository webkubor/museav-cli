export type Market = 'domestic' | 'global'

const DEFAULT_MARKET: Market = 'global'
const TEST_DOMESTIC_DOMAIN = import.meta.env.VITE_TEST_DOMESTIC_DOMAIN ?? 'test.modelgo.com'
const DOMESTIC_DOMAIN = import.meta.env.VITE_DOMESTIC_DOMAIN ?? 'modelgo.com'
const GLOBAL_DOMAIN = import.meta.env.VITE_GLOBAL_DOMAIN ?? 'modelgo.ai'

function isMarket(value: unknown): value is Market {
  return value === 'domestic' || value === 'global'
}

function readDomainDefaultMarket(): Market | null {
  if (typeof window === 'undefined') return null

  const hostname = window.location.hostname.replace(/^www\./, '')
  if (hostname === TEST_DOMESTIC_DOMAIN) return 'domestic'
  if (hostname === DOMESTIC_DOMAIN) return 'domestic'
  if (hostname === GLOBAL_DOMAIN) return 'global'
  return null
}

function readBuildMarket(): Market | null {
  const market = import.meta.env.VITE_MARKET
  return isMarket(market) ? market : null
}

export function getMarket(): Market {
  return readBuildMarket() ?? readDomainDefaultMarket() ?? DEFAULT_MARKET
}

export function isDomestic(): boolean {
  return getMarket() === 'domestic'
}

export type Lang = 'zh' | 'en'

export function getMarketDefaultLang(market: Market): Lang {
  return market === 'domestic' ? 'zh' : 'en'
}

export function getInitialLang(): Lang {
  return getMarketDefaultLang(getMarket())
}
