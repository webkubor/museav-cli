import { MARKET_OVERRIDE_SESSION_KEY, storageKeys } from '@/lib/storage'
import {
  marketFromLocation,
  marketLockedByDomain,
  marketOverrideFromSearch,
  type Market,
} from '@/lib/market-domain'

export type { Market } from '@/lib/market-domain'

/**
 * 生产市场由域名锁定；共享测试域名允许外部链接用 ?market= 显式指定市场。
 * URL 覆盖只对非生产锁定域名有效，确保测试国际站从首屏就使用正确的语言和主题默认值。
 */
export function getMarketQueryOverride(): Market | null {
  if (typeof window === 'undefined') return null
  if (marketLockedByDomain(window.location.hostname)) return null

  const fromQuery = marketOverrideFromSearch(window.location.search)
  if (fromQuery) {
    // 登录/注册后路由通常会移除 query；在同一标签页内保留市场上下文，
    // 才不会回到 dashboard 后又被 test 平台配置翻回国内。
    try {
      sessionStorage.setItem(MARKET_OVERRIDE_SESSION_KEY, fromQuery)
    } catch {}
    return fromQuery
  }

  try {
    const fromSession = sessionStorage.getItem(MARKET_OVERRIDE_SESSION_KEY)
    return fromSession === 'china' || fromSession === 'global' ? fromSession : null
  } catch {
    return null
  }
}

export function getMarket(): Market {
  if (typeof window === 'undefined') return 'china'
  return marketFromLocation(window.location.hostname, window.location.search)
}

export function isDomestic(): boolean {
  return getMarket() === 'china'
}

export type Lang = 'zh' | 'en'

export function getMarketDefaultLang(market: Market): Lang {
  return market === 'china' ? 'zh' : 'en'
}

/**
 * 初始语言：
 * 1. 优先读取 localStorage 持久化偏好（用户显式切过的，跨域名/会话保留）
 * 2. 无偏好 → 按域名/市场定默认（国内 modelgo.com→zh，海外 modelgo.ai→en）
 *    —— 不看浏览器语言：否则海外站(.ai)遇中文浏览器会错误默认中文（违反「.ai 默认英文」）
 * 3. SSR/无 window → 兜底 'en'
 */
export function getInitialLang(): Lang {
  if (typeof window !== 'undefined') {
    // 测试国际站入口显式指定 market 时，不能被同域国内站遗留语言偏好覆盖。
    const marketOverride = getMarketQueryOverride()
    if (marketOverride) return getMarketDefaultLang(marketOverride)

    // 优先读取持久化语言偏好（统一 key），兼容旧 i18next key
    const saved = localStorage.getItem(storageKeys.lang()) || localStorage.getItem('i18nextLng')
    if (saved === 'zh' || saved === 'en') return saved

    // 无显式偏好 → 域名/市场默认（.ai=en / .com=zh），域名意图优先于浏览器语言
    return getMarketDefaultLang(getMarket())
  }

  return 'en'
}
