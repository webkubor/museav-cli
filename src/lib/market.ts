import { storageKeys } from '@/lib/storage'

export type Market = 'domestic' | 'global'

const DEFAULT_MARKET: Market = 'global'

function isMarket(value: unknown): value is Market {
  return value === 'domestic' || value === 'global'
}

function readDomainDefaultMarket(): Market | null {
  if (typeof window === 'undefined') return null

  // 模糊匹配，适应 console.modelgo.com 或是 test.modelgo.com 以及 cn 域名
  const hostname = window.location.hostname.toLowerCase()
  if (hostname.includes('modelgo.com') || hostname.endsWith('.cn')) {
    return 'domestic'
  }
  if (hostname.includes('modelgo.ai')) {
    return 'global'
  }
  return null
}

function readBuildMarket(): Market | null {
  const market = import.meta.env.VITE_MARKET
  return isMarket(market) ? market : null
}

export function getMarket(): Market {
  // 环境变量优先 ──► 域名探测兜底 ──► 默认降级 global
  return readBuildMarket() ?? readDomainDefaultMarket() ?? DEFAULT_MARKET
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
    const browserLang = navigator.language || (navigator as any).userLanguage || ''
    if (browserLang.toLowerCase().includes('zh')) {
      return 'zh'
    }
  }

  return 'en'
}
