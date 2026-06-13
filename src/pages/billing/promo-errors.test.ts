import { describe, expect, it } from 'vitest'
import type { TFunction } from 'i18next'

import { ModelGoApiError } from '@/lib/request'

import { getPromoRedeemErrorMessage } from './promo-errors'

const t = ((key: string) => key) as unknown as TFunction

describe('getPromoRedeemErrorMessage', () => {
  it('maps promo redeem limit to a stable i18n key', () => {
    const err = new ModelGoApiError({ code: 40910, msg: 'raw', request_id: 'req_1', data: null })

    expect(getPromoRedeemErrorMessage(err, t)).toBe('billing.promo.errorRedeemLimit')
  })

  it('maps invalid, expired, inactive and disabled promo errors', () => {
    const codes = [42210, 42211, 42212, 42213]

    expect(codes.map((code) => getPromoRedeemErrorMessage(new ModelGoApiError({ code, msg: 'raw', data: null }), t))).toEqual([
      'billing.promo.errorInvalid',
      'billing.promo.errorExpired',
      'billing.promo.errorNotActive',
      'billing.promo.errorDisabled',
    ])
  })
})
