import { MARKET_OVERRIDE_SESSION_KEY, storageKeys } from '@/lib/storage'
import {
  marketFromHostname,
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
    } catch { /* 隐私模式写入失败，忽略——市场值仍以当次 query 为准 */ }
    return fromQuery
  }

  try {
    const fromSession = sessionStorage.getItem(MARKET_OVERRIDE_SESSION_KEY)
    return fromSession === 'china' || fromSession === 'global' ? fromSession : null
  } catch {
    return null
  }
}

/**
 * 当前市场：生产域名锁定 > (query/session) 显式覆盖 > 域名探测。
 * 非生产域名必须走 getMarketQueryOverride()（含 sessionStorage 兜底）——
 * 路由跳转丢 ?market= 后，主题/语言等判定才不会和 data-market 分叉（qa#603）。
 */
export function getMarket(): Market {
  if (typeof window === 'undefined') return 'china'
  const { hostname } = window.location
  return marketLockedByDomain(hostname) ?? getMarketQueryOverride() ?? marketFromHostname(hostname)
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
 * 1. 优先读取当前市场下的持久化偏好（storageKeys.lang() 已按 market 隔离，见 storage.ts）
 *    —— 用户在本市场显式切过就尊重他；另一市场的遗留偏好不会串过来（#370）
 * 2. 无偏好 → 按域名/市场定默认（国内 modelgo.com→zh，海外 modelgo.ai→en）
 *    —— 不看浏览器语言：否则海外站(.ai)遇中文浏览器会错误默认中文（违反「.ai 默认英文」）
 * 3. SSR/无 window → 兜底 'en'
 */
export function getInitialLang(): Lang {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(storageKeys.lang())
    if (saved === 'zh' || saved === 'en') return saved

    // 无显式偏好 → 域名/市场默认（.ai=en / .com=zh），域名意图优先于浏览器语言
    return getMarketDefaultLang(getMarket())
  }

  return 'en'
}
