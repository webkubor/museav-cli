/**
 * 登录页面回归测试
 * 职责：覆盖登录页前端拦截与真实后端错误展示的边界
 * 路由：/login
 * API：POST /auth/email/check、POST /auth/login、GET /auth/session
 */

import type { ReactNode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import { checkLoginEmail } from '@/services/auth'
import { useAuthStore } from '@/store/auth'
import LoginPage from './index'

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
  SocialLogin: () => null,
}))

vi.mock('@/services/auth', () => ({
  checkLoginEmail: vi.fn(),
  login: vi.fn(),
  getSession: vi.fn(),
  oauthAuthorizeUrl: vi.fn(() => '#'),
}))

vi.mock('@/hooks/use-platform-config', () => ({
  useOAuthMethods: () => [],
  useEmailAuthEnabled: () => true,
}))

// 本用例测的是邮箱登录链路；jsdom 的 localhost 会判为国内市场（手机号入口），
// 固定为海外市场让入口直达 EmailLoginPage。
vi.mock('@/hooks/useMarket', () => ({
  useMarket: () => 'global',
}))

const mockedCheckLoginEmail = vi.mocked(checkLoginEmail)

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

function renderLogin() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<div>signup</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    resetAuth()
  })

  it('continues email login through the backend without local security masking', async () => {
    mockedCheckLoginEmail.mockResolvedValue({
      registered: true,
      password_login_enabled: true,
    })

    renderLogin()

    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'user@modelgo.com' },
    })
    fireEvent.click(screen.getByRole('button', { name: '继续' }))

    await waitFor(() => {
      expect(mockedCheckLoginEmail).toHaveBeenCalledWith('user@modelgo.com')
    })
  })
})
