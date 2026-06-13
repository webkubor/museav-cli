import type { TFunction } from 'i18next'

import { ModelGoApiError } from '@/lib/request'

const PROMO_ERROR_KEYS: Record<number, string> = {
  40910: 'billing.promo.errorRedeemLimit',
  42210: 'billing.promo.errorInvalid',
  42211: 'billing.promo.errorExpired',
  42212: 'billing.promo.errorNotActive',
  42213: 'billing.promo.errorDisabled',
  50301: 'billing.promo.errorUnavailable',
}

export function getPromoRedeemErrorMessage(error: unknown, t: TFunction): string {
  if (error instanceof ModelGoApiError) {
    const key = PROMO_ERROR_KEYS[error.code]
    if (key) return t(key)
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return t('billing.promo.error')
}
