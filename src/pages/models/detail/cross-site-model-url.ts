/**
 * 详情取不到（40401）时的跨站兜底链接。
 *
 * 单独成文件而不是留在 index.tsx：组件文件只能导出组件，混着导出纯函数会让
 * react-refresh 失效（eslint react-refresh/only-export-components 直接报错）。
 */
import type { Market } from '@/lib/market'

/**
 * 为什么不预判、只在 404 后兜底：模型发现页的榜单里 `is_integrated=true`
 * **不蕴含**「当前站 catalog 里有」—— 实测 21 个已接入模型有 9 个在本站
 * catalog 取不到详情（qa#718）。而现有字段没有一个能可靠推断：
 * `integrated_site=MODELGO_AI` 的 12 个模型里有 5 个（gemini 系）在国内 catalog
 * 里就有，拿它路由会把这 5 个错甩到外链。所以前端不猜，进来 404 了再给出路。
 *
 * @param isTestOrDev 测试/本地只有一套控制台，跨站没有意义，且没配
 *   `VITE_GLOBAL_CONSOLE`（`requireEnv` 对它是必需项，先取会直接抛错）——
 *   与 `modelDetailUrl` 同一顺序：**先判环境，再判市场**。
 * @param consoleUrlOf 取目标市场的控制台域名（注入以便测试，避免碰 env 校验）
 */
export function crossSiteModelUrl(
  modelId: string,
  market: Market,
  isTestOrDev: boolean,
  consoleUrlOf: (market: Market) => string,
): string | null {
  if (isTestOrDev || !modelId) return null
  const target: Market = market === 'china' ? 'global' : 'china'
  return `${consoleUrlOf(target)}/models/${encodeURIComponent(modelId)}`
}
