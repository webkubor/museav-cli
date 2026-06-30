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

const isTestOrDev = (): boolean => {
  if (import.meta.env.DEV) return true
  if (import.meta.env.MODE === 'test') return true
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname.toLowerCase()
    return (
      hostname.includes('test.modelgo.com') ||
      hostname.includes('localhost') ||
      hostname.includes('127.0.0.1')
    )
  }
  return false
}

/**
 * 读取「必需」的 URL 环境变量。缺失即抛错——不留硬编码兜底。
 * 跳转地址（官网/控制台/文档）每个环境都在对应 .env 文件按市场配齐，
 * 配置缺了就该启动失败，而不是悄悄跳到一个写死的、可能早已腐烂的域名。
 * （vite.config 另有构建前校验，缺 key 直接中断构建。）
 */
function requireEnv(value: string | undefined, key: string): string {
  if (!value) {
    throw new Error(`[market] 缺少必需环境变量 ${key}，请在对应 .env 文件配置（禁止留空或硬编码兜底）`)
  }
  return value
}

const configs: Record<Market, MarketConfig> = {
  domestic: {
    domain: 'modelgo.com',
    apiDomain: isTestOrDev()
      ? 'test.modelgo.com'
      : (import.meta.env.VITE_DOMESTIC_API_DOMAIN || 'api.modelgo.com'),
    companyName: 'ModelGo',
    icp: import.meta.env.VITE_ICP || null,
    locales: ['zh'],
    defaultLocale: 'zh',
    siteUrl: requireEnv(import.meta.env.VITE_DOMESTIC_SITE, 'VITE_DOMESTIC_SITE'),
    consoleUrl: requireEnv(import.meta.env.VITE_DOMESTIC_CONSOLE, 'VITE_DOMESTIC_CONSOLE'),
    docsUrl: requireEnv(import.meta.env.VITE_DOMESTIC_DOCS, 'VITE_DOMESTIC_DOCS'),
  },

  global: {
    domain: 'modelgo.ai',
    apiDomain: isTestOrDev()
      ? 'test.modelgo.com'
      : (import.meta.env.VITE_GLOBAL_API_DOMAIN || 'api.modelgo.ai'),
    companyName: 'ModelGo',
    icp: null,
    locales: ['zh', 'en'],
    defaultLocale: 'en',
    siteUrl: requireEnv(import.meta.env.VITE_GLOBAL_SITE, 'VITE_GLOBAL_SITE'),
    consoleUrl: requireEnv(import.meta.env.VITE_GLOBAL_CONSOLE, 'VITE_GLOBAL_CONSOLE'),
    docsUrl: requireEnv(import.meta.env.VITE_GLOBAL_DOCS, 'VITE_GLOBAL_DOCS'),
  },
}

export function getMarketConfig(market: Market): MarketConfig {
  return configs[market]
}
