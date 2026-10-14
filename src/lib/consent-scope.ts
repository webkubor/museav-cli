/**
 * Cookie 同意的地区范围（与官网 modelgo-global-web/src/lib/consent-scope.ts 保持一致）。
 *
 * 名单内国家：弹横幅，未同意前不加载 GTM/GA4。名单外：不弹，直接 granted 加载。
 * 国家码来自边缘层注入（nginx 在返回 index.html 时写入 <html data-country>），
 * 读不到时按「需要同意」处理（保守）。
 *
 * ⚠️ 名单在 index.html 的内联脚本里也有一份（内联脚本不能 import），两处必须同步改。
 * 名单后续变更会迁到管理后台配置，届时两站都改为从接口读取。
 */

/** 需要 Cookie 同意的国家（ISO 3166-1 alpha-2）：欧洲经济区 + 英国 + 瑞士，以及 TR / MK / RS / TH。 */
export const COOKIE_CONSENT_COUNTRIES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK',
  'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
  'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL',
  'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
  'IS', 'LI', 'NO', 'GB', 'CH',
  'TR', 'MK', 'RS', 'TH',
] as const

/** UK 不是 ISO 3166-1 代码，英国标准代码是 GB；统一归一为 GB。 */
const COUNTRY_ALIASES: Readonly<Record<string, string>> = { UK: 'GB' }

/** 边缘层占位码：XX 无法判定，T1 为 Tor 出口，都按未知处理。 */
const UNKNOWN_COUNTRY_CODES: ReadonlySet<string> = new Set(['XX', 'T1'])

export function normalizeCountryCode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const code = raw.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code) || UNKNOWN_COUNTRY_CODES.has(code)) return null
  return COUNTRY_ALIASES[code] ?? code
}

/** 未知国家返回 true（保守：宁可多弹，不漏合规横幅）。 */
export function isCookieConsentRequired(country: string | null): boolean {
  if (country === null) return true
  return (COOKIE_CONSENT_COUNTRIES as readonly string[]).includes(country)
}

/** 当前页面访客是否需要同意：读 index.html 写入的 <html data-country>。 */
export function currentVisitorNeedsConsent(): boolean {
  if (typeof document === 'undefined') return true
  return isCookieConsentRequired(normalizeCountryCode(document.documentElement.dataset.country))
}
