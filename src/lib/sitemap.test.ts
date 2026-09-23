import { describe, expect, it } from 'vitest'
import { renderSitemap } from '../../scripts/build-sitemap.mjs'

describe('renderSitemap', () => {
  it.each([
    ['china', 'VITE_DOMESTIC_CONSOLE', 'https://console.modelgo.com'],
    ['global', 'VITE_GLOBAL_CONSOLE', 'https://console.modelgo.ai'],
  ] as const)('renders only the %s host', (market, envName, origin) => {
    const sitemap = renderSitemap(market, { [envName]: origin })
    const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((entry) => entry[1])

    expect(locations).toHaveLength(5)
    expect(locations.every((location) => new URL(location).host === new URL(origin).host)).toBe(true)
    expect(sitemap).toContain(`${origin}/models`)
    expect(sitemap).not.toContain(market === 'china' ? 'modelgo.ai' : 'modelgo.com')
  })

  it('rejects a missing market origin instead of emitting an unusable sitemap', () => {
    expect(() => renderSitemap('china', {})).toThrow('Missing VITE_DOMESTIC_CONSOLE')
  })

  it('rejects non-origin URLs to keep sitemap locations canonical', () => {
    expect(() => renderSitemap('global', { VITE_GLOBAL_CONSOLE: 'https://console.modelgo.ai/path' }))
      .toThrow('expected a bare origin')
  })
})
