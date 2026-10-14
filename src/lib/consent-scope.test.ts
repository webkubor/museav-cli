import { describe, expect, it } from 'vitest'
import { COOKIE_CONSENT_COUNTRIES, isCookieConsentRequired, normalizeCountryCode } from './consent-scope'

describe('consent-scope (console)', () => {
  it('名单 36 国、无重复，与官网一致', () => {
    expect(COOKIE_CONSENT_COUNTRIES).toHaveLength(36)
    expect(new Set(COOKIE_CONSENT_COUNTRIES).size).toBe(36)
    for (const c of ['FR', 'DE', 'GB', 'CH', 'TR', 'MK', 'RS', 'TH']) expect(COOKIE_CONSENT_COUNTRIES).toContain(c)
  })

  it('UK 归一为 GB；大小写与空白容错', () => {
    expect(normalizeCountryCode('UK')).toBe('GB')
    expect(normalizeCountryCode(' de ')).toBe('DE')
  })

  it('未知与占位码按需要同意', () => {
    for (const raw of [null, undefined, '', 'XX', 'T1', 'USA']) {
      expect(isCookieConsentRequired(normalizeCountryCode(raw as string))).toBe(true)
    }
  })

  it('名单外国家不需要同意', () => {
    for (const c of ['US', 'CN', 'JP', 'SG']) expect(isCookieConsentRequired(normalizeCountryCode(c))).toBe(false)
  })
})
