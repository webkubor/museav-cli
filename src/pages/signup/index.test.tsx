import { describe, expect, it } from 'vitest'

import { referralCodeFromSearchParams } from '@/pages/signup/referral-code'

describe('referralCodeFromSearchParams', () => {
  it('uses aff as the canonical referral query parameter', () => {
    const params = new URLSearchParams('aff=MG-TEST')

    expect(referralCodeFromSearchParams(params)).toBe('MG-TEST')
  })

  it('keeps legacy ref links working for already copied invite URLs', () => {
    const params = new URLSearchParams('ref=OLD-REF')

    expect(referralCodeFromSearchParams(params)).toBe('OLD-REF')
  })

  it('prefers aff when both aff and ref are present', () => {
    const params = new URLSearchParams('ref=OLD-REF&aff=MG-TEST')

    expect(referralCodeFromSearchParams(params)).toBe('MG-TEST')
  })

  it('returns an empty string when no referral parameter is present', () => {
    expect(referralCodeFromSearchParams(new URLSearchParams('email=a%40b.com'))).toBe('')
  })

  // qa#675：根路径 /?aff=X 被 RequireAuth 折进 /login?redirect=%2F%3Faff%3DX
  it('recovers aff embedded in the redirect param produced by RequireAuth', () => {
    const params = new URLSearchParams('redirect=' + encodeURIComponent('/?aff=JYA59BTN'))

    expect(referralCodeFromSearchParams(params)).toBe('JYA59BTN')
  })

  it('recovers legacy ref embedded in the redirect param', () => {
    const params = new URLSearchParams('redirect=' + encodeURIComponent('/dashboard?ref=OLD-REF'))

    expect(referralCodeFromSearchParams(params)).toBe('OLD-REF')
  })

  it('prefers a direct aff over one embedded in redirect', () => {
    const params = new URLSearchParams(
      'aff=DIRECT&redirect=' + encodeURIComponent('/?aff=EMBEDDED'),
    )

    expect(referralCodeFromSearchParams(params)).toBe('DIRECT')
  })

  it('returns an empty string when redirect carries no referral parameter', () => {
    const params = new URLSearchParams('redirect=' + encodeURIComponent('/dashboard'))

    expect(referralCodeFromSearchParams(params)).toBe('')
  })
})
