import { normalizeCountry, resolveConsentRegion, type ConsentRegion } from '@/config/consent-region'
import { TIMEZONE_COUNTRY } from '@/config/timezone-countries'

/**
 * 读取访客浏览器的 IANA 时区（如 Europe/Berlin）。取不到返回 null。
 * 纯前端、同步，不发请求、不弹权限，不读 IP，也不做指纹。
 */
export function getBrowserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

/**
 * 当前访客是否需要看到同意横幅。名单外国家返回 false；名单内与查不到国家的都返回 true。
 * 返回 false 时横幅不出现，GA / GTM 也不会加载（只挂在「接受」之后）。
 */
export function isConsentBannerRequired(): boolean {
  return resolveConsentRegion(getBrowserTimeZone(), TIMEZONE_COUNTRY) !== 'not-required'
}

/** 当前访客所处地区（required=名单内需要同意，not-required=名单外，unknown=查不到）。 */
export function getBrowserConsentRegion(): ConsentRegion {
  return resolveConsentRegion(getBrowserTimeZone(), TIMEZONE_COUNTRY)
}

/** 由浏览器时区推断的 ISO 国家码；查不到返回 null。 */
export function getBrowserCountry(): string | null {
  const timeZone = getBrowserTimeZone()
  if (!timeZone || !Object.hasOwn(TIMEZONE_COUNTRY, timeZone)) return null
  return normalizeCountry(TIMEZONE_COUNTRY[timeZone])
}
