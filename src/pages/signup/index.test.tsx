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
})
