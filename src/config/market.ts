import type { Market } from '@/lib/market'

export interface MarketConfig {
  /** 面向用户的主域名 */
  domain: string
  /** 控制台 BFF 域名（modelgo-web-api.*），前端自己调的那套接口 */
  apiDomain: string
  /**
   * 模型调用网关域名（api.*）——用户拿 API Key 去打的那个，和上面的 apiDomain 是两套服务。
   * 必须按市场分：国内站 api.modelgo.com / 国际站 api.modelgo.ai。
   * 曾经是构建期单一常量 VITE_API_GATEWAY_DOMAIN，两个生产站共用一份 .env.production，
   * 导致国际站把国内网关域名发给用户（需求方 shared/modelgo_prd#376）。
   */
  gatewayDomain: string
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
  // 市场键随 Market 词汇为 'china'；env 变量名 VITE_DOMESTIC_* 是部署配置键，不改名
  china: {
    domain: 'modelgo.com',
    apiDomain: isTestOrDev()
      ? 'test.modelgo.com'
      : (import.meta.env.VITE_DOMESTIC_API_DOMAIN || 'api.modelgo.com'),
    // test/dev 只有一套网关，两个市场都指它；生产必须显式配，缺了就启动失败
    gatewayDomain: isTestOrDev()
      ? 'api.test.modelgo.com'
      : requireEnv(import.meta.env.VITE_DOMESTIC_GATEWAY_DOMAIN, 'VITE_DOMESTIC_GATEWAY_DOMAIN'),
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
    gatewayDomain: isTestOrDev()
      ? 'api.test.modelgo.com'
      : requireEnv(import.meta.env.VITE_GLOBAL_GATEWAY_DOMAIN, 'VITE_GLOBAL_GATEWAY_DOMAIN'),
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

/**
 * 官网 URL 按界面语言补语言前缀（shared/modelgo_prd#374）。
 *
 * 官网（modelgo-global-web）用 Astro 的路径式 i18n：`/` 是默认语言（global 站为 en），
 * 非默认语言在 `src/pages/<lang>/` 下，即中文页面是 `/zh/`、`/zh/enterprise`。此前控制台
 * 顶栏「首页」直接指向 siteUrl 根路径，所以用户在控制台切成中文后跳过去仍是英文站。
 *
 * 规则：语言属于该市场 locales 且不是 defaultLocale 时加前缀；否则原样返回。
 * china 站 locales 只有 zh 且 zh 即默认，因此永不加前缀（官网无 /zh 目录）。
 */
export function siteUrlForLocale(market: Market, locale: string, path = ''): string {
  const cfg = configs[market]
  const lang = (locale || '').toLowerCase().startsWith('zh') ? 'zh' : 'en'
  const suffix = path.replace(/^\/+/, '')
  const needsPrefix = cfg.locales.includes(lang) && lang !== cfg.defaultLocale
  const base = cfg.siteUrl.replace(/\/+$/, '')
  const segments = [base, needsPrefix ? lang : '', suffix].filter(Boolean)
  return segments.join('/')
}
