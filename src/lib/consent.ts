/**
 * 控制台 Cookie 同意与 Google Consent Mode v2（PRD #1264 · 欧洲合规）。
 *
 * - 同意状态写首方 cookie `mg_consent`（`<policy_version>:<accept|reject>`），只在控制台域名生效。
 * - index.html 的内联脚本在加载 GTM / GA4 之前读这份状态并设置 Consent Mode 默认值；
 *   本文件负责用户点击后的更新与加载。两处的 policy 版本与 cookie 格式必须一致。
 * - 控制台暂无国家信号（见飞书「前端开发 · 关键埋点规范」D1），所有访客按「需要同意」处理。
 *   国家信号接入后，这里和官网一样按名单收窄。
 */

export const CONSENT_VERSION = '2026-10-v1'
export type ConsentChoice = 'accept' | 'reject'

const CONSENT_COOKIE = 'mg_consent'
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60

/** 决定变化时派发，detail 为 ConsentChoice。 */
export const CONSENT_CHANGE_EVENT = 'mg:consent-change'

declare global {
  interface Window {
    /** 由 index.html 内联脚本注册：加载 GTM 与 gtag，幂等。 */
    mgLoadGoogleTags?: () => void
    /** gtag 存根，由 index.html 设置默认值；update 经它发出。 */
    gtag?: (...args: unknown[]) => void
  }
}

/** Consent Mode v2 的四项信号。接受为 granted，拒绝为 denied。 */
export function consentSignals(granted: boolean) {
  const value = granted ? 'granted' : 'denied'
  return { ad_storage: value, analytics_storage: value, ad_user_data: value, ad_personalization: value }
}

function readCookie(name: string): string | null {
  const prefix = `${name}=`
  for (const part of document.cookie.split(';')) {
    const item = part.trim()
    if (item.startsWith(prefix)) return item.slice(prefix.length)
  }
  return null
}

function writeCookie(name: string, value: string) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=${value}; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${secure}`
}

/** 当前 policy 版本下的决定；未决定或版本已过期时返回 null。 */
export function readConsentChoice(): ConsentChoice | null {
  const value = readCookie(CONSENT_COOKIE)
  if (!value) return null
  const [version, choice] = value.split(':')
  if (version !== CONSENT_VERSION) return null
  return choice === 'accept' || choice === 'reject' ? choice : null
}

/**
 * 记录用户决定：更新 Consent Mode 信号；接受才加载 GTM / GA4（同意前不加载任何 Google 标签）。
 */
export function recordConsent(choice: ConsentChoice) {
  writeCookie(CONSENT_COOKIE, `${CONSENT_VERSION}:${choice}`)
  const granted = choice === 'accept'
  window.gtag?.('consent', 'update', consentSignals(granted))
  if (granted) window.mgLoadGoogleTags?.()
  window.dispatchEvent(new CustomEvent<ConsentChoice>(CONSENT_CHANGE_EVENT, { detail: choice }))
}
