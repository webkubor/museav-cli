const MARKET_CONSOLE_ENV = {
  china: 'VITE_DOMESTIC_CONSOLE',
  global: 'VITE_GLOBAL_CONSOLE',
}

const PUBLIC_PAGES = [
  '/models',
  '/models/discovery',
  '/legal/terms',
  '/legal/privacy',
  '/legal/cookies',
]

function escapeXml(value) {
  return value.replace(/[<>&"']/g, (char) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  })[char])
}

/** Render one market's sitemap. A sitemap must never mix host names. */
export function renderSitemap(market, env) {
  const envName = MARKET_CONSOLE_ENV[market]
  if (!envName) throw new Error(`market must be china|global; received: ${market}`)

  const configuredOrigin = env[envName]
  if (!configuredOrigin) throw new Error(`Missing ${envName} for ${market} sitemap`)

  let origin
  try {
    const url = new URL(configuredOrigin)
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('unsupported protocol')
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
      throw new Error('expected a bare origin')
    }
    origin = url.origin
  } catch (error) {
    throw new Error(`${envName} must be a valid bare URL origin: ${error.message}`)
  }

  const entries = PUBLIC_PAGES.map((path) =>
    `  <url><loc>${escapeXml(`${origin}${path}`)}</loc></url>`,
  ).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`
}

export const sitemapMarkets = Object.freeze(Object.keys(MARKET_CONSOLE_ENV))
