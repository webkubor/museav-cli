import { storageKeys } from '@/lib/storage'
import { marketFromHostname, type Market } from '@/lib/market-domain'

export type { Market } from '@/lib/market-domain'

/**
 * 当前市场 = 域名的纯函数（唯一真源见 market-domain.ts）。
 * 不读构建期变量、无兜底链——生产靠 modelgo.com / modelgo.ai 域名自然区分；
 * dev/test 单域名下预览另一市场，走 store 运行时切换，不经过这里。
 */
export function getMarket(): Market {
  if (typeof window === 'undefined') return 'china'
  return marketFromHostname(window.location.hostname)
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
    // 优先读取持久化语言偏好（统一 key），兼容旧 i18next key
    const saved = localStorage.getItem(storageKeys.lang()) || localStorage.getItem('i18nextLng')
    if (saved === 'zh' || saved === 'en') return saved

    // 无显式偏好 → 域名/市场默认（.ai=en / .com=zh），域名意图优先于浏览器语言
    return getMarketDefaultLang(getMarket())
  }

  return 'en'
}
