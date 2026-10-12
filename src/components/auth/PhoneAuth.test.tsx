import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PhoneAuth } from './PhoneAuth'
import { getCaptchaOutcome, getCaptchaParam } from '@/lib/aliyun-captcha'
import { getSession, phoneLoginRegister } from '@/services/auth'
import { useAuthStore } from '@/store/auth'
import { trackEvent } from '@/lib/track'
import { pushDataLayer } from '@/lib/gtm-datalayer'

vi.mock('react-i18next', async (importOriginal) => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/components/auth/AuthLayout', () => ({ AuthLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock('@/components/auth/CaptchaGate', () => ({ CaptchaGate: () => null }))
vi.mock('@/constants/oauth', () => ({ OAUTH_ICONS: { google: null, github: null }, OAUTH_LABELS: { google: 'Google', github: 'GitHub' } }))
vi.mock('@/services/auth', () => ({ sendSmsCode: vi.fn(), phoneLoginRegister: vi.fn(), getSession: vi.fn() }))
vi.mock('@/lib/aliyun-captcha', () => ({ getCaptchaOutcome: vi.fn(), getCaptchaParam: vi.fn() }))
vi.mock('@/lib/login-intent', () => ({ navigateAfterLogin: vi.fn() }))
vi.mock('@/lib/track', () => ({ trackEvent: vi.fn() }))
vi.mock('@/lib/gtm-datalayer', () => ({
  pushDataLayer: vi.fn(),
  currentIdentity: () => ({ user_id: 'a', workspace_id: 'w' }),
  installDataLayerIdentitySync: vi.fn(),
}))

const gate = vi.hoisted(() => ({ session: null as null | { show: () => void; reset: () => void; destroy: () => void } }))
vi.mock('@/lib/alicaptcha', () => ({ createAlicaptchaSession: vi.fn(async (_lang: string, hooks: { onVerified: (p: string) => void }) => {
  if (!gate.session) return null
  gate.session.show = vi.fn(() => hooks.onVerified('gate-param'))
  return gate.session
}) }))

const key = (name: string) => `account.auth.${name}`
const setAuth = vi.fn()

/** 走完手机号 + 验证码提交；广告来源挂在 URL 上，与投放落地时同形。 */
async function submit(query: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[`/login${query}`]}>
        <PhoneAuth />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  fireEvent.change(screen.getByPlaceholderText(key('placeholders.phone')), { target: { value: '13800138000' } })
  fireEvent.change(screen.getByPlaceholderText(key('placeholders.smsCode6')), { target: { value: '123456' } })
  fireEvent.click(screen.getByRole('button', { name: key('phoneLogin.submit') }))
  await waitFor(() => expect(phoneLoginRegister).toHaveBeenCalled())
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  localStorage.clear()
  gate.session = null
  useAuthStore.setState({ isAuthenticated: false, isLoading: false, setAuth })
  vi.mocked(getCaptchaOutcome).mockResolvedValue({ param: 'send-captcha', presented: true })
  vi.mocked(getCaptchaParam).mockResolvedValue('login-captcha')
  vi.mocked(getSession).mockResolvedValue({
    account: { account_id: 'a' },
    active_tenant_id: 't',
    active_workspace_id: 'w',
    tenants: [],
    permissions: { granted: ['read'] },
  } as never)
})

describe('PhoneAuth 注册事件（prd46#1271 国内腿补 sign_up）', () => {
  it('新注册发 sign_up，自建埋点与 dataLayer 带同一份广告来源', async () => {
    vi.mocked(phoneLoginRegister).mockResolvedValue({ is_new_account: true } as never)
    await submit('?gclid=g1&utm_source=google&channel_id=google_ads')
    const expected = { method: 'phone', gclid: 'g1', utm_source: 'google', channel_id: 'google_ads' }
    await waitFor(() => expect(trackEvent).toHaveBeenCalledWith('sign_up', expected, { result: 'success' }))
    expect(pushDataLayer).toHaveBeenCalledWith(expect.objectContaining({ event: 'sign_up', ...expected }))
  })

  it('老账号只发 login_success，不发 sign_up', async () => {
    vi.mocked(phoneLoginRegister).mockResolvedValue({ is_new_account: false } as never)
    await submit('?gclid=g1')
    await waitFor(() => expect(trackEvent).toHaveBeenCalledWith('login_success', { method: 'phone' }, { result: 'success' }))
    expect(vi.mocked(trackEvent).mock.calls.some(([e]) => e === 'sign_up')).toBe(false)
  })

  it('后端未给 is_new_account 标记时不发 sign_up（宁少不误报）', async () => {
    vi.mocked(phoneLoginRegister).mockResolvedValue({} as never)
    await submit('?gclid=g1')
    await waitFor(() => expect(trackEvent).toHaveBeenCalledWith('login_success', { method: 'phone' }, { result: 'success' }))
    expect(vi.mocked(trackEvent).mock.calls.some(([e]) => e === 'sign_up')).toBe(false)
  })

  it('注册失败不发 sign_up', async () => {
    vi.mocked(phoneLoginRegister).mockRejectedValue(new Error('boom'))
    await submit('?gclid=g1')
    await waitFor(() => expect(screen.getByText(key('login.failed'))).toBeInTheDocument())
    expect(vi.mocked(trackEvent).mock.calls.some(([e]) => e === 'sign_up')).toBe(false)
  })
})
