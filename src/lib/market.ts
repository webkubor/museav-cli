import { storageKeys } from '@/lib/storage'
import { marketFromHostname, type Market } from '@/lib/market-domain'

export type { Market } from '@/lib/market-domain'

/**
 * 当前市场 = 域名的纯函数（唯一真源见 market-domain.ts）。
 * 不读构建期变量、无兜底链——生产靠 modelgo.com / modelgo.ai 域名自然区分；
 * dev/test 单域名下预览另一市场，走 store 运行时切换，不经过这里。
 */
export function getMarket(): Market {
  if (typeof window === 'undefined') return 'domestic'
  return marketFromHostname(window.location.hostname)
}

export function isDomestic(): boolean {
  return getMarket() === 'domestic'
}

export type Lang = 'zh' | 'en'

export function getMarketDefaultLang(market: Market): Lang {
  return market === 'domestic' ? 'zh' : 'en'
}

/**
 * 智能探测初始语言，实现完全解耦：
 * 1. 优先读取 localStorage 持久化偏好
 * 2. 智能匹配浏览器 navigator.language 前缀
 * 3. 降级为默认英文 'en'
 */
export function getInitialLang(): Lang {
  if (typeof window !== 'undefined') {
    // 优先读取持久化语言偏好（统一 key），兼容旧 i18next key
    const saved = localStorage.getItem(storageKeys.lang()) || localStorage.getItem('i18nextLng')
    if (saved === 'zh' || saved === 'en') return saved

    // 智能匹配浏览器默认语言
    const browserLang = navigator.language || (navigator as Navigator & { userLanguage?: string }).userLanguage || ''
    if (browserLang.toLowerCase().includes('zh')) {
      return 'zh'
    }
  }

  return 'en'
}
