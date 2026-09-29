export type SitemapMarket = 'china' | 'global'

export function renderSitemap(market: SitemapMarket, env: Record<string, string>): string
export const sitemapMarkets: readonly SitemapMarket[]
