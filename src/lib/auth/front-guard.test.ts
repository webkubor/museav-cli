import { beforeEach, describe, expect, it } from 'vitest'

import {
  checkAuthGuard,
  clearAuthGuard,
  recordAuthGuardFailure,
  type AuthGuardAction,
} from '@/lib/auth/front-guard'

const action: AuthGuardAction = 'login-password'
const subject = 'User@ModelGo.com'

describe('front auth guard', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('allows normal auth attempts when no local risk is present', () => {
    const decision = checkAuthGuard({ action, subject, now: 1_000 })

    expect(decision.allowed).toBe(true)
    expect(decision.uiState).toBe('idle')
  })

  it('starts a local cooldown after repeated failures for the same subject', () => {
    recordAuthGuardFailure({ action, subject, now: 1_000 })
    recordAuthGuardFailure({ action, subject, now: 2_000 })
    recordAuthGuardFailure({ action, subject, now: 3_000 })

    const decision = checkAuthGuard({ action, subject, now: 4_000 })

    expect(decision.allowed).toBe(false)
    expect(decision.uiState).toBe('cooldown')
    expect(decision.retryAfterMs).toBeGreaterThan(0)
    expect(decision.message).toContain('稍后')
  })

  it('clears local cooldown state after a successful auth attempt', () => {
    recordAuthGuardFailure({ action, subject, now: 1_000 })
    recordAuthGuardFailure({ action, subject, now: 2_000 })
    recordAuthGuardFailure({ action, subject, now: 3_000 })
    clearAuthGuard({ action, subject })

    const decision = checkAuthGuard({ action, subject, now: 4_000 })

    expect(decision.allowed).toBe(true)
  })

  it('allows signup attempts before local failures accumulate', () => {
    const decision = checkAuthGuard({
      action: 'signup',
      subject,
      now: 1_000,
    })

    expect(decision.allowed).toBe(true)
    expect(decision.uiState).toBe('idle')
  })
})
