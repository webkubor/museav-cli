/**
 * 模型广场 / 模型排行 / 模型详情的官网地址
 * 路由：控制台旧路径 /models、/models/discovery、/models/:modelId 的重定向（OfficialModelsRedirect）
 * API：无
 *
 * 三页已从控制台拆到两站官网（shared/modelgo_prd#1269；国内线 #1272 → modelgo.com，
 * 国际线 #1270 → modelgo.ai），控制台只留登录态能力（体验 / 对比 / API Key）。
 * 官网路径与控制台不完全同名：排行在官网是 /models/rankings（两线 10-13 对齐定案），
 * 控制台旧路径 /models/discovery 映射过去；国际站中文界面要带 /zh 前缀，交给 siteUrlForLocale。
 */
import { siteUrlForLocale } from '@/config/market'
import type { Market } from '@/lib/market'

export type OfficialModelsPage =
  | { kind: 'catalog' }
  | { kind: 'rankings' }
  | { kind: 'detail'; modelId: string }

/**
 * 只在控制台有意义的 query，不带去官网：market 是共享测试域名 console.test 用来切市场的，
 * 官网测试站按域名分市场（web.test / global-web.test），带过去只会污染地址。
 */
const CONSOLE_ONLY_PARAMS = ['market']

function officialPath(page: OfficialModelsPage): string {
  if (page.kind === 'rankings') return 'models/rankings'
  // model_id 形如 vendor/model，编码成 %2F 落在同一段路径上（与官网详情页、控制台 prd#983 同一口径）
  if (page.kind === 'detail') return `models/${encodeURIComponent(page.modelId)}`
  return 'models'
}

/**
 * 拼官网对应页地址。search / hash 原样透传（广告的 gclid / utm_*、推荐码 aff / ref、广场筛选 q/f/sort
 * 都在 query 里，丢了投放归因就断 —— 父单硬约束 2），只剔除控制台专用参数。
 */
export function officialModelsUrl(
  market: Market,
  locale: string,
  page: OfficialModelsPage,
  options: { search?: string; hash?: string } = {},
): string {
  const url = new URL(siteUrlForLocale(market, locale, officialPath(page)))
  const params = new URLSearchParams(options.search ?? '')
  for (const key of CONSOLE_ONLY_PARAMS) params.delete(key)
  params.forEach((value, key) => url.searchParams.append(key, value))
  if (options.hash) url.hash = options.hash
  return url.toString()
}
