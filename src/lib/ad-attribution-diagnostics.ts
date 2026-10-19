import { trackEvent } from '@/lib/track'
import { readPersistedAdAttribution, AD_SOURCE_KEYS, type AdSourceFields } from '@/pages/signup/ad-source'

/** 仅上报枚举/布尔，不上报 URL、点击 ID、UTM 值、邮箱或访客 ID。 */
export function adSignal(fields: AdSourceFields | undefined): { has_click_id: boolean; has_utm: boolean; has_source: boolean } {
  return {
    has_click_id: Boolean(fields?.gclid || fields?.gbraid || fields?.wbraid),
    has_utm: Boolean(fields?.utm_source || fields?.utm_medium || fields?.utm_campaign),
    has_source: Boolean(fields && AD_SOURCE_KEYS.some((key) => fields[key])),
  }
}

export function trackAdAttributionStage(stage: 'auth_request' | 'signup_confirmed', fields: AdSourceFields | undefined, method?: 'email' | 'phone' | 'oauth') {
  trackEvent('ad_attribution:stage', { stage, ...adSignal(fields), ...(method ? { method } : {}) })
}

/** 捕获前的 URL 状态与捕获后的缓存状态分离，方便区分「到达时已丢参」与缓存失败。 */
export function trackAdArrival(search: string): void {
  const query = new URLSearchParams(search)
  const redirect = query.get('redirect')
  let nested: URLSearchParams | null = null
  if (redirect?.startsWith('/') && !redirect.startsWith('//') && !redirect.includes('\\')) {
    try {
      const parsed = new URL(redirect, 'https://placeholder.invalid')
      if (parsed.origin === 'https://placeholder.invalid') nested = parsed.searchParams
    } catch { /* 非法 redirect 不参与诊断 */ }
  }
  const urlFields = Object.fromEntries(AD_SOURCE_KEYS.flatMap((key) => {
    const value = query.get(key) || nested?.get(key)
    return value ? [[key, value]] : []
  })) as AdSourceFields
  const cachedFields = readPersistedAdAttribution()
  trackEvent('ad_attribution:stage', {
    stage: 'console_arrival',
    url_click_id: adSignal(urlFields).has_click_id,
    url_utm: adSignal(urlFields).has_utm,
    cached_click_id: adSignal(cachedFields).has_click_id,
    cached_utm: adSignal(cachedFields).has_utm,
  })
}
