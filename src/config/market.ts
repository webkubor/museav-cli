import type { Market } from '@/lib/market'

export interface MarketConfig {
  /** 面向用户的主域名 */
  domain: string
  /** API 网关域名 */
  apiDomain: string
  /** 品牌名（用于展示） */
  companyName: string
  /** ICP 备案号，无则 null */
  icp: string | null
  /** 支持的 locale 列表 */
  locales: string[]
  /** 默认 locale */
  defaultLocale: string
  /** 官网入口 URL */
  siteUrl: string
  /** 控制台入口 URL */
  consoleUrl: string
  /** 开发者文档站 URL */
  docsUrl: string
}

const configs: Record<Market, MarketConfig> = {
  domestic: {
    domain: 'modelgo.com',
    apiDomain: import.meta.env.VITE_DOMESTIC_API_DOMAIN ?? 'api.modelgo.com',
    companyName: '词元共生',
    icp: import.meta.env.VITE_ICP ?? null,
    locales: ['zh'],
    defaultLocale: 'zh',
    siteUrl: import.meta.env.VITE_SITE_URL ?? 'https://modelgo.com',
    consoleUrl: import.meta.env.VITE_DOMESTIC_CONSOLE ?? 'https://console.modelgo.com',
    docsUrl: import.meta.env.VITE_DOMESTIC_DOCS ?? 'https://doc.modelgo.com',
  },

  global: {
    domain: 'modelgo.ai',
    apiDomain: import.meta.env.VITE_GLOBAL_API_DOMAIN ?? 'api.modelgo.ai',
    companyName: 'ModelGo',
    icp: null,
    locales: ['zh', 'en'],
    defaultLocale: 'en',
    siteUrl: import.meta.env.VITE_SITE_URL ?? 'https://modelgo.ai',
    consoleUrl: import.meta.env.VITE_GLOBAL_CONSOLE ?? 'https://console.modelgo.ai',
    docsUrl: import.meta.env.VITE_GLOBAL_DOCS ?? 'https://doc.modelgo.ai',
  },
}

export function getMarketConfig(market: Market): MarketConfig {
  return configs[market]
}
