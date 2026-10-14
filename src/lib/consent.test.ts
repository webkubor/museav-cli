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

describe('横幅显示条件（地区）', () => {
  it('名单外（data-country=US）不需要同意', async () => {
    const { currentVisitorNeedsConsent } = await import('./consent-scope')
    document.documentElement.dataset.country = 'US'
    expect(currentVisitorNeedsConsent()).toBe(false)
  })
  it('名单内（data-country=FR）需要同意', async () => {
    const { currentVisitorNeedsConsent } = await import('./consent-scope')
    document.documentElement.dataset.country = 'FR'
    expect(currentVisitorNeedsConsent()).toBe(true)
  })
  it('无国家信息按需要同意', async () => {
    const { currentVisitorNeedsConsent } = await import('./consent-scope')
    delete document.documentElement.dataset.country
    expect(currentVisitorNeedsConsent()).toBe(true)
  })
})
