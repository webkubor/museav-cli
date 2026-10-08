import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { GlobalEmailAuth } from './GlobalEmailAuth'
import { getCaptchaOutcome, getCaptchaParam } from '@/lib/aliyun-captcha'
import { emailCodeLoginRegister, getSession, sendEmailCode } from '@/services/auth'
import { useAuthStore } from '@/store/auth'
import { ModelGoApiError } from '@/lib/request'

vi.mock('react-i18next', async (importOriginal) => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/components/auth/AuthLayout', () => ({ AuthLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock('@/components/auth/GlobalDiscountShowcase', () => ({ GlobalDiscountShowcase: () => null }))
vi.mock('@/constants/oauth', () => ({ OAUTH_ICONS: { google: null, github: null }, OAUTH_LABELS: { google: 'Google', github: 'GitHub' } }))
vi.mock('@/services/auth', () => ({ sendEmailCode: vi.fn(), emailCodeLoginRegister: vi.fn(), getSession: vi.fn(), oauthAuthorizeUrl: vi.fn() }))
vi.mock('@/lib/aliyun-captcha', () => ({ getCaptchaOutcome: vi.fn(), getCaptchaParam: vi.fn() }))
vi.mock('@/lib/login-intent', () => ({ navigateAfterLogin: vi.fn() }))
vi.mock('@/lib/track', () => ({ trackEvent: vi.fn() }))
const key = (name: string) => `account.auth.globalEmailAuth.${name}`
const button = (name: string) => screen.getByRole('button', { name: key(name) })
const codeInput = () => screen.getByLabelText(key('codeLabel'))
const setAuth = vi.fn()
function setup() { render(<MemoryRouter initialEntries={['/login?ref=ATTR&invitation=INV']}><GlobalEmailAuth /></MemoryRouter>) }
async function goToCode() {
  setup()
  fireEvent.change(screen.getByLabelText('account.auth.fields.email'), { target: { value: 'fixture@example.invalid' } })
  fireEvent.click(button('humanVerification'))
  await waitFor(() => expect(button('continueEmail')).toBeEnabled())
  fireEvent.click(button('continueEmail'))
  await screen.findByPlaceholderText('account.auth.placeholders.emailCode6')
}
function submitCode(code = '123456') {
  fireEvent.change(codeInput(), { target: { value: code } })
  fireEvent.click(button('submit'))
}
beforeEach(() => {
  vi.clearAllMocks();sessionStorage.clear();localStorage.clear()
  useAuthStore.setState({ isAuthenticated: false, isLoading: false, setAuth })
  vi.mocked(getCaptchaOutcome).mockResolvedValue({ param: 'send-captcha', presented: true })
  vi.mocked(getCaptchaParam).mockResolvedValue('login-captcha')
  vi.mocked(sendEmailCode).mockResolvedValue({ expires_in: 300 })
  vi.mocked(emailCodeLoginRegister).mockResolvedValue({} as never)
  vi.mocked(getSession).mockResolvedValue({ account: { account_id: 'a' }, active_tenant_id: 't', active_workspace_id: 'w', tenants: [], permissions: { granted: ['read'] } } as never)
})
describe('GlobalEmailAuth factors and recovery #1092', () => {
  it.each([true, false])('does not send when captcha returns no token (presented=%s)', async (presented) => {
    vi.mocked(getCaptchaOutcome).mockResolvedValue({ param: null, presented })
    setup();fireEvent.change(screen.getByLabelText('account.auth.fields.email'), { target: { value: 'fixture@example.invalid' } })
    fireEvent.click(button('humanVerification'))
    await screen.findByText('account.auth.validation.securityVerificationRequired')
    expect(button('continueEmail')).toBeDisabled()
    expect(sendEmailCode).not.toHaveBeenCalled()
  })
  it('requires a new captcha after send failure before allowing another send', async () => {
    vi.mocked(sendEmailCode).mockRejectedValueOnce(new Error('send failed'))
    setup();fireEvent.change(screen.getByLabelText('account.auth.fields.email'), { target: { value: 'fixture@example.invalid' } })
    fireEvent.click(button('humanVerification'));await waitFor(() => expect(button('continueEmail')).toBeEnabled())
    fireEvent.click(button('continueEmail'));await screen.findByText(key('failed'))
    expect(button('continueEmail')).toBeDisabled();expect(sendEmailCode).toHaveBeenCalledTimes(1)
    vi.mocked(getCaptchaOutcome).mockResolvedValue({ param: 'retry-send-captcha', presented: true })
    fireEvent.click(button('humanVerification'));await waitFor(() => expect(button('continueEmail')).toBeEnabled())
    fireEvent.click(button('continueEmail'));await screen.findByPlaceholderText('account.auth.placeholders.emailCode6')
    expect(sendEmailCode).toHaveBeenLastCalledWith('fixture@example.invalid', 'retry-send-captcha')
  })
  it('uses a fresh login captcha, forwards the email code and fills auth from confirmed session', async () => {
    await goToCode()
    expect(sendEmailCode).toHaveBeenCalledWith('fixture@example.invalid', 'send-captcha')
    submitCode()
    await waitFor(() => expect(emailCodeLoginRegister).toHaveBeenCalledWith('fixture@example.invalid', '123456', 'login-captcha', 'ATTR', 'INV'))
    await waitFor(() => expect(setAuth).toHaveBeenCalledWith({ account_id: 'a' }, 't', [], 'w', ['read']))
  })
  it('renders no authenticator/TOTP input on the verify step and never sends totp', async () => {
    await goToCode()
    // 第二步只有：6 位邮箱验证码 + 人机校验 + 提交按钮，没有任何 TOTP/身份验证器输入。
    expect(screen.queryByLabelText(key('totpLabel'))).toBeNull()
    expect(screen.queryByLabelText(key('totpHint'))).toBeNull()
    expect(screen.queryAllByRole('textbox')).toHaveLength(1)
    submitCode()
    await waitFor(() => expect(emailCodeLoginRegister).toHaveBeenCalledTimes(1))
    const body = vi.mocked(emailCodeLoginRegister).mock.calls[0]
    expect(body).not.toContain('totp')
    expect(body).toEqual(['fixture@example.invalid', '123456', 'login-captcha', 'ATTR', 'INV'])
  })
  it.each([40038, 40039])('maps second-factor code %s to the generic login failure path (no TOTP prompt)', async (code) => {
    vi.mocked(emailCodeLoginRegister).mockRejectedValueOnce(new ModelGoApiError({ code, msg: '' }))
    await goToCode();submitCode()
    await screen.findByText(key('failed'))
    expect(screen.queryByLabelText(key('totpLabel'))).toBeNull()
    expect(getSession).not.toHaveBeenCalled();expect(setAuth).not.toHaveBeenCalled()
  })
  it('requires human verification again after returning to another email', async () => {
    await goToCode();fireEvent.click(button('useAnotherEmail'))
    expect(button('continueEmail')).toBeDisabled()
    fireEvent.click(button('humanVerification'));await waitFor(() => expect(button('continueEmail')).toBeEnabled())
    fireEvent.click(button('continueEmail'));await screen.findByPlaceholderText('account.auth.placeholders.emailCode6')
    expect(screen.queryByLabelText(key('totpLabel'))).toBeNull()
  })
})
