/**
 * 模型调用网关的接入地址（用户拿 API Key 去打的那个 api.*，不是控制台 BFF modelgo-web-api.*）。
 *
 * 必须按**运行时**市场派生，不能用构建期常量：两个生产站（console.modelgo.com /
 * console.modelgo.ai）共用同一份 .env.production，单个构建期常量表达不了两个网关域名，
 * 结果国际站把国内的 api.modelgo.com 发给用户（需求方 shared/modelgo_prd#376）。
 * 市场由域名判定（test 环境可用 ?market=global 预览），与 data-market 同一个真源。
 */
import { getMarket, type Market } from '@/lib/market'
import { getMarketConfig } from '@/config/market'

export interface GatewayEndpoint {
  label: string
  baseUrl: string
}

/**
 * 网关裸域名。
 *
 * `market` 传参优先：已经从 useLangStore 拿到 market 的组件应该传进来——dev 工具栏的
 * 「国内/海外」开关切的是 store，不刷新页面，只读 hostname 的话预览时域名不会跟着变。
 * 不传则按域名运行时判定（?market=global 也算，见 lib/market）。
 */
export function getGatewayDomain(market: Market = getMarket()): string {
  return getMarketConfig(market).gatewayDomain
}

/** 网关 base：OpenAI 兼容协议带 /v1，Anthropic 兼容协议不带 /v1 */
export function getGatewayEndpoints(market?: Market): GatewayEndpoint[] {
  const domain = getGatewayDomain(market)
  return [
    { label: 'OpenAI 兼容', baseUrl: `https://${domain}/v1` },
    { label: 'Anthropic 兼容', baseUrl: `https://${domain}` },
  ]
}
