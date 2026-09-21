/**
 * 登录页面回归测试
 * 职责：覆盖登录页前端拦截与真实后端错误展示的边界
 * 路由：/login
 * API：POST /auth/email/check、POST /auth/login、GET /auth/session
 */

import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { loadLocaleNamespaces } from '@/i18n'
import {
  checkLoginEmail,
  emailCodeLoginRegister,
  mockGlobalOAuthLogin,
  sendGlobalEmailCode,
} from '@/services/auth'
import { useAuthStore } from '@/store/auth'
import LoginPage from './index'

const marketState = vi.hoisted(() => ({ value: 'global' as 'china' | 'global' }))

vi.mock('@/components/auth/AuthLayout', () => ({
  AuthLayout: ({ children, footer, title, subtitle }: { children: ReactNode; footer?: ReactNode; title: string; subtitle?: string }) => (
    <main>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
      {children}
      {footer}
    </main>
  ),
}))

vi.mock('@/components/auth/SocialLogin', () => ({
  SocialLogin: () => <div data-testid="social-login">social login</div>,
}))

vi.mock('@/constants/oauth', () => ({
  OAUTH_ICONS: { google: null, github: null },
  OAUTH_LABELS: { google: 'Google', github: 'GitHub' },
}))

vi.mock('@/components/auth/PhoneAuth', () => ({
  PhoneAuth: () => <div data-testid="phone-auth">phone auth</div>,
}))

vi.mock('@/services/auth', () => ({
  checkLoginEmail: vi.fn(),
  emailCodeLoginRegister: vi.fn(),
  mockGlobalOAuthLogin: vi.fn(),
  sendGlobalEmailCode: vi.fn(),
  login: vi.fn(),
  getSession: vi.fn(),
  oauthAuthorizeUrl: vi.fn(() => '#'),
}))

vi.mock('@/components/auth/CaptchaGate', () => ({
  CaptchaGate: () => null,
}))

vi.mock('@/lib/aliyun-captcha', () => ({
  getCaptchaParam: vi.fn(async () => null),
}))

vi.mock('@/hooks/use-platform-config', () => ({
  useOAuthMethods: () => [],
  useEmailAuthEnabled: () => true,
}))

// 本用例测的是邮箱登录链路；jsdom 的 localhost 会判为国内市场（手机号入口），
// 固定为海外市场让入口直达 EmailLoginPage。
vi.mock('@/hooks/useMarket', () => ({
  useMarket: () => marketState.value,
}))

const mockedCheckLoginEmail = vi.mocked(checkLoginEmail)
const mockedEmailCodeLoginRegister = vi.mocked(emailCodeLoginRegister)
const mockedSendGlobalEmailCode = vi.mocked(sendGlobalEmailCode)
const mockedGlobalOAuthLogin = vi.mocked(mockGlobalOAuthLogin)

function resetAuth() {
  useAuthStore.setState({
    account: null,
    activeTenantId: null,
    activeWorkspaceId: null,
    tenants: [],
    permissions: null,
    menus: [],
    isAuthenticated: false,
    isLoading: false,
  })
}

function renderLogin(initialEntry = '/login') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<div>signup</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('LoginPage', () => {
  // 生产环境靠 App.tsx 的 <LocaleNamespaces> 在路由挂载前异步加载 'account' 语言包；
  // 这里直接渲染 <LoginPage> 没经过那层包裹，t() 找不到资源只会回落成原始 key
  // （如 "account.auth.login.continue"），断言真实中文文案会一直找不到元素。
  beforeAll(async () => {
    await loadLocaleNamespaces(['account'])
  })

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    marketState.value = 'global'
    resetAuth()
    mockedSendGlobalEmailCode.mockResolvedValue({ expires_in: 60, prototype_code: '123456' })
    mockedEmailCodeLoginRegister.mockResolvedValue({} as never)
    mockedGlobalOAuthLogin.mockResolvedValue({} as never)
  })

  it('starts Global login on a provider-or-email choice page', () => {
    renderLogin()

    expect(screen.getByPlaceholderText('you@company.com')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('6 位邮箱验证码')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '使用邮箱继续' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('••••••••')).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '免费注册' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Google' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'GitHub' })).toBeInTheDocument()
  })

  it('completes the Global third-party sign-in prototype without leaving the page', async () => {
    renderLogin()

    fireEvent.click(screen.getByRole('button', { name: 'Google' }))

    await waitFor(() => {
      expect(mockedGlobalOAuthLogin).toHaveBeenCalledWith('google')
      expect(screen.getByText('Google 已完成第三方登录 / 注册演示')).toBeInTheDocument()
    })
  })

  it('continues from email entry to a dedicated verification-code page', async () => {
    renderLogin()

    fireEvent.change(screen.getByPlaceholderText('you@company.com'), {
      target: { value: 'global@modelgo.ai' },
    })
    fireEvent.click(screen.getByRole('button', { name: '使用邮箱继续' }))

    await waitFor(() => {
      expect(mockedSendGlobalEmailCode).toHaveBeenCalledWith('global@modelgo.ai')
      expect(screen.getByText('检查你的邮箱')).toBeInTheDocument()
      expect(screen.getByText(/global@modelgo\.ai/)).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText('6 位邮箱验证码'), {
      target: { value: '123456' },
    })
    fireEvent.click(screen.getByRole('button', { name: '验证并继续' }))

    await waitFor(() => {
      expect(mockedEmailCodeLoginRegister).toHaveBeenCalledWith(
        'global@modelgo.ai',
        '123456',
        null,
        undefined,
        undefined,
      )
    })
  })

  it('returns from the code page to edit the email address', async () => {
    renderLogin()

    fireEvent.change(screen.getByPlaceholderText('you@company.com'), {
      target: { value: 'change@modelgo.ai' },
    })
    fireEvent.click(screen.getByRole('button', { name: '使用邮箱继续' }))

    expect(await screen.findByRole('button', { name: '使用其他邮箱' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '使用其他邮箱' }))

    expect(screen.getByDisplayValue('change@modelgo.ai')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('6 位邮箱验证码')).not.toBeInTheDocument()
  })

  it('opens domestic email login from the bottom email entry', () => {
    marketState.value = 'china'

    renderLogin('/login?method=email')

    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
    expect(screen.getByTestId('social-login')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '使用手机号登录' })).toBeInTheDocument()
  })

  it('continues email login through the backend without local security masking', async () => {
    marketState.value = 'china'
    mockedCheckLoginEmail.mockResolvedValue({
      registered: true,
      password_login_enabled: true,
    })

    renderLogin('/login?method=email')

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'user@modelgo.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: '继续' }))

    await waitFor(() => {
      expect(mockedCheckLoginEmail).toHaveBeenCalledWith('user@modelgo.com')
    })
  })

  // qa#675：本文件把 useMarket 固定成 'global'，所以渲染的正是当初丢码的那条分支
  // （EmailLoginPage）。根路径 /?aff=X 会被 RequireAuth 折成 /login?redirect=%2F%3Faff%3DX，
  // 码只藏在 redirect 的内嵌 query 里。
  it('persists the referral code hidden in the redirect param (qa#675)', () => {
    sessionStorage.clear()

    render(
      <MemoryRouter initialEntries={['/login?redirect=%2F%3Faff%3DINTLCODE']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(sessionStorage.getItem('mg_referral_code')).toBe('INTLCODE')
  })

  it('also takes the referral code straight off the query (qa#675)', () => {
    sessionStorage.clear()

    render(
      <MemoryRouter initialEntries={['/login?ref=DIRECTCODE']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(sessionStorage.getItem('mg_referral_code')).toBe('DIRECTCODE')
  })

  it('leaves the stored code untouched when no code is present (qa#675)', () => {
    sessionStorage.clear()

    render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(sessionStorage.getItem('mg_referral_code')).toBeNull()
  })
})
