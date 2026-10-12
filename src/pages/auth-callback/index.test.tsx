/**
 * OAuth 回调页的两条成功路径都要把「新注册」这件事记上（prd#1242）。
 *
 * 为什么单独测这一页：AuthProvider 的首拉会话失败时会走本页的兜底重试，那条路径也能成功
 * 建立会话 —— 只把上报挂在 AuthProvider 上会漏掉它。两处共用同一个幂等函数，这里断言
 * 本页确实调用了它（幂等性由 lib/new-account.test.ts 覆盖）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AuthCallbackPage from './index'
import { getSession } from '@/services/auth'
import { trackEvent } from '@/lib/track'
import { flushNewAccountSignUp } from '@/lib/new-account'
import { useAuthStore } from '@/store/auth'

vi.mock('react-i18next', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-i18next')>()),
  useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock('@/services/auth', () => ({ getSession: vi.fn() }))
vi.mock('@/lib/login-intent', () => ({ navigateAfterLogin: vi.fn() }))
vi.mock('@/lib/track', () => ({ trackEvent: vi.fn() }))
vi.mock('@/lib/new-account', () => ({ flushNewAccountSignUp: vi.fn() }))
vi.mock('@/pages/signup/referral-code', () => ({ clearPersistedReferralCode: vi.fn() }))
vi.mock('@/pages/signup/ad-source', () => ({ clearPersistedAdSource: vi.fn() }))

const session = {
  account: { account_id: 'a' },
  active_tenant_id: 't',
  active_workspace_id: 'w',
  tenants: [],
  permissions: { granted: ['read'] },
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/auth/callback?redirect=%2Fdashboard']}>
      <AuthCallbackPage />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ isAuthenticated: false, isLoading: true, account: null, activeTenantId: null })
})

describe('OAuth 回调页上报', () => {
  it('首拉会话成功：发 login_success，并消费新注册标记', async () => {
    vi.mocked(getSession).mockResolvedValue(session as never)
    renderPage()
    await waitFor(() => expect(trackEvent).toHaveBeenCalledWith('login_success', { method: 'oauth' }, { result: 'success' }))
    expect(flushNewAccountSignUp).toHaveBeenCalledTimes(1)
  })

  it('首拉失败、兜底重试成功：同样要消费新注册标记（否则这条路径会漏发 sign_up）', async () => {
    vi.mocked(getSession)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(session as never)
    renderPage()
    await waitFor(() => expect(trackEvent).toHaveBeenCalledWith('login_success', { method: 'oauth' }, { result: 'success' }))
    expect(flushNewAccountSignUp).toHaveBeenCalledTimes(1)
  })

  it('两次都失败：不上报登录成功，也不消费新注册标记', async () => {
    vi.mocked(getSession).mockRejectedValue(new Error('boom'))
    renderPage()
    await waitFor(() => expect(trackEvent).toHaveBeenCalledWith('login_fail', { method: 'oauth' }, { result: 'fail', error_code: 'callback_failed' }))
    expect(flushNewAccountSignUp).not.toHaveBeenCalled()
  })
})
