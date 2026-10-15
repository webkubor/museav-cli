import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CONSENT_VERSION, consentSignals, readConsentChoice, recordConsent } from './consent'

const clearCookies = () => {
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim()
    if (name) document.cookie = `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT`
  }
}

describe('consent (console)', () => {
  beforeEach(() => {
    clearCookies()
    window.gtag = vi.fn()
    window.mgLoadGoogleTags = vi.fn()
  })

  afterEach(() => {
    clearCookies()
    delete window.gtag
    delete window.mgLoadGoogleTags
  })

  it('consentSignals 四项一致：granted / denied', () => {
    expect(consentSignals(true)).toEqual({
      ad_storage: 'granted',
      analytics_storage: 'granted',
      ad_user_data: 'granted',
      ad_personalization: 'granted',
    })
    expect(Object.values(consentSignals(false)).every((v) => v === 'denied')).toBe(true)
  })

  it('未决定时为 null', () => {
    expect(readConsentChoice()).toBeNull()
  })

  it('版本过期视为未决定（重新弹出）', () => {
    document.cookie = 'mg_consent=2025-01-v0:accept; Path=/'
    expect(readConsentChoice()).toBeNull()
  })

  it('接受：发出 update granted，并加载 GTM', () => {
    recordConsent('accept')
    expect(window.gtag).toHaveBeenCalledWith('consent', 'update', consentSignals(true))
    expect(window.mgLoadGoogleTags).toHaveBeenCalledTimes(1)
    expect(readConsentChoice()).toBe('accept')
    expect(document.cookie).toContain(`mg_consent=${CONSENT_VERSION}:accept`)
  })

  it('拒绝：发出 update denied，不加载 GTM', () => {
    recordConsent('reject')
    expect(window.gtag).toHaveBeenCalledWith('consent', 'update', consentSignals(false))
    expect(window.mgLoadGoogleTags).not.toHaveBeenCalled()
    expect(readConsentChoice()).toBe('reject')
  })

  it('gtag 存根不存在时不抛错', () => {
    delete window.gtag
    expect(() => recordConsent('accept')).not.toThrow()
  })
})

describe('同意与地区', () => {
  it('hasAnalyticsConsent 只在明确接受时为 true', async () => {
    const { hasAnalyticsConsent, recordConsent, readConsentChoice } = await import('./consent')
    expect(hasAnalyticsConsent()).toBe(false)
    recordConsent('reject')
    expect(hasAnalyticsConsent()).toBe(false)
    recordConsent('accept')
    expect(hasAnalyticsConsent()).toBe(true)
    expect(readConsentChoice()).toBe('accept')
  })

  it('浏览器时区映射到国家：欧洲 → 名单内，其他 → 名单外', async () => {
    const { resolveConsentRegion } = await import('@/config/consent-region')
    const { TIMEZONE_COUNTRY } = await import('@/config/timezone-countries')
    expect(resolveConsentRegion('Europe/Berlin', TIMEZONE_COUNTRY)).toBe('required')
    expect(resolveConsentRegion('Europe/London', TIMEZONE_COUNTRY)).toBe('required')
    expect(resolveConsentRegion('Asia/Bangkok', TIMEZONE_COUNTRY)).toBe('required')
    expect(resolveConsentRegion('Asia/Shanghai', TIMEZONE_COUNTRY)).toBe('not-required')
    expect(resolveConsentRegion('America/New_York', TIMEZONE_COUNTRY)).toBe('not-required')
    expect(resolveConsentRegion('UTC', TIMEZONE_COUNTRY)).toBe('unknown')
  })
})
