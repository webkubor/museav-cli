import { getMarket } from '@/lib/market'

const LOGOS = {
  domestic: '/brand/modelgo-cn-logo.svg',
  global: '/brand/modelgo-global-logo.svg',
} as const

const ICONS = {
  domestic: '/brand/modelgo-app-icon-dark.svg',
  global: '/brand/modelgo-global-logo.svg',
} as const

const market = getMarket()

export const siteLogo = LOGOS[market]
export const siteIcon = ICONS[market]

/** @deprecated 用 siteLogo 代替 */
export const modelGoLogos = { ...LOGOS, cn: LOGOS.domestic } as Record<string, string>
/** @deprecated 用 siteIcon 代替 */
export const modelGoIcons = { ...ICONS, cn: ICONS.domestic } as Record<string, string>
