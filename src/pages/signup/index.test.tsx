import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

import { referralCodeFromSearchParams } from '@/pages/signup/referral-code'
import { loadLocaleNamespaces } from '@/i18n'
import SignupPage from './index'

const marketState = vi.hoisted(() => ({ value: 'global' as 'china' | 'global' }))

vi.mock('@/hooks/useMarket', () => ({
  useMarket: () => marketState.value,
}))

vi.mock('@/components/auth/AuthLayout', () => ({
  AuthLayout: ({ children, footer, title }: { children: ReactNode; footer?: ReactNode; title: string }) => (
    <main>
      <h1>{title}</h1>
      {children}
      {footer}
    </main>
  ),
}))

vi.mock('@/components/auth/SocialLogin', () => ({
  SocialLogin: () => <div data-testid="social-login">social login</div>,
}))

vi.mock('@/components/auth/CaptchaGate', () => ({
  CaptchaGate: () => null,
}))

function LoginDestination() { const location = useLocation();return <div>unified email login<output data-testid="redirect-search">{location.search}</output></div> }

function renderSignup(initialEntry = '/signup') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/login" element={<LoginDestination />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeAll(async () => {
  await loadLocaleNamespaces(['account'])
})

beforeEach(() => {
  marketState.value = 'global'
  localStorage.clear()
  sessionStorage.clear()
})

describe('SignupPage market rules', () => {
  it('redirects domestic legacy email signup without exposing a blocked registration form', () => {
    marketState.value = 'china'
    renderSignup('/signup?method=email&email=cn%40modelgo.com&invitation=INV&aff=REF&redirect=%2Fdashboard')
    expect(screen.getByText('unified email login')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('cn@modelgo.com')).not.toBeInTheDocument()
    expect(screen.getByTestId('redirect-search')).toHaveTextContent('?method=email&email=cn%40modelgo.com&invitation=INV&aff=REF&redirect=%2Fdashboard')
  })

  it('redirects Global signup to the unified passwordless email entry', () => {
    renderSignup('/signup?market=global')

    expect(screen.getByText('unified email login')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('you@example.com')).not.toBeInTheDocument()
  })
})

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
