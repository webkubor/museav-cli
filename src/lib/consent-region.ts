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
 * 线上样式验证开关：URL 带 `?showcookie=1` 时强制按「需要同意」处理。
 * 给 owner / QA 的入口（如 https://console.modelgo.com/?showcookie=1）：不在名单内也能看到横幅，
 * 且不受本机已存选择影响（早先点过「接受」也仍会展示，否则没法复看样式）。
 * Google 标签同时按名单内规则门控，所以三态（未决定 / 接受 / 拒绝）都能完整验证。
 * 只读 URL，不写任何存储；去掉参数即恢复按时区推断的国家判断。
 * 注意：仅影响本函数与横幅显示；控制台的浏览器时区/国家上报（getBrowserCountry）不受影响。
 */
export function isConsentPreviewRequested(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return new URLSearchParams(window.location.search).get('showcookie') === '1'
  } catch {
    return false
  }
}

/**
 * 当前访客是否需要看到同意横幅。名单外国家返回 false；名单内与查不到国家的都返回 true。
 * 返回 false 时横幅不出现、Google 标签直接加载。
 */
export function isConsentBannerRequired(): boolean {
  if (isConsentPreviewRequested()) return true
  return resolveConsentRegion(getBrowserTimeZone(), TIMEZONE_COUNTRY) !== 'not-required'
}

/** 当前访客所处地区（required=名单内需要同意，not-required=名单外，unknown=查不到）。 */
export function getBrowserConsentRegion(): ConsentRegion {
  if (isConsentPreviewRequested()) return 'required'
  return resolveConsentRegion(getBrowserTimeZone(), TIMEZONE_COUNTRY)
}

/** 由浏览器时区推断的 ISO 国家码；查不到返回 null。 */
export function getBrowserCountry(): string | null {
  const timeZone = getBrowserTimeZone()
  if (!timeZone || !Object.hasOwn(TIMEZONE_COUNTRY, timeZone)) return null
  return normalizeCountry(TIMEZONE_COUNTRY[timeZone])
}
