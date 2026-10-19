import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { GlobalEmailAuth } from './GlobalEmailAuth'
import { getCaptchaOutcome, getCaptchaParam } from '@/lib/aliyun-captcha'
import { emailCodeLoginRegister, getSession, sendEmailCode } from '@/services/auth'
import { useAuthStore } from '@/store/auth'
import { ModelGoApiError } from '@/lib/request'
import { trackEvent } from '@/lib/track'

vi.mock('react-i18next', async (importOriginal) => ({ ...await importOriginal<typeof import('react-i18next')>(), useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('@/components/auth/AuthLayout', () => ({ AuthLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock('@/components/auth/GlobalDiscountShowcase', () => ({ GlobalDiscountShowcase: () => null }))
vi.mock('@/constants/oauth', () => ({ OAUTH_ICONS: { google: null, github: null }, OAUTH_LABELS: { google: 'Google', github: 'GitHub' } }))
vi.mock('@/services/auth', () => ({ sendEmailCode: vi.fn(), emailCodeLoginRegister: vi.fn(), getSession: vi.fn(), oauthAuthorizeUrl: vi.fn() }))
vi.mock('@/lib/aliyun-captcha', () => ({ getCaptchaOutcome: vi.fn(), getCaptchaParam: vi.fn() }))
vi.mock('@/lib/login-intent', () => ({ navigateAfterLogin: vi.fn() }))
vi.mock('@/lib/track', () => ({ trackEvent: vi.fn() }))
// 默认验证条不可用（null 会话 → 走一次性弹窗兜底）；单条用例可换成可控的假会话。
const gate = vi.hoisted(() => ({ session: null as null | { show: () => void; reset: () => void; destroy: () => void } }))
vi.mock('@/lib/alicaptcha', () => ({ createAlicaptchaSession: vi.fn(async (_lang: string, hooks: { onVerified: (p: string) => void }) => {
  if (!gate.session) return null
  gate.session.show = vi.fn(() => hooks.onVerified('gate-param'))
  return gate.session
}) }))
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
  vi.clearAllMocks();sessionStorage.clear();localStorage.clear();gate.session = null
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
    await waitFor(() => expect(trackEvent).toHaveBeenCalledWith('login_submit', { method: 'email_code' }))
    await waitFor(() => expect(emailCodeLoginRegister).toHaveBeenCalledWith('fixture@example.invalid', '123456', 'login-captcha', 'ATTR', 'INV', undefined))
    await waitFor(() => expect(setAuth).toHaveBeenCalledWith({ account_id: 'a' }, 't', [], 'w', ['read']))
  })
  it('renders no authenticator/TOTP input on the verify step and never sends totp', async () => {
    await goToCode()
    // 第二步只有：6 位邮箱验证码 + 人机校验 + 提交按钮，没有任何 TOTP/身份验证器输入。
    expect(screen.queryAllByRole('textbox')).toHaveLength(1)
    submitCode()
    await waitFor(() => expect(emailCodeLoginRegister).toHaveBeenCalledTimes(1))
    const body = vi.mocked(emailCodeLoginRegister).mock.calls[0]
    expect(body).not.toContain('totp')
    expect(body).toEqual(['fixture@example.invalid', '123456', 'login-captcha', 'ATTR', 'INV', undefined])
  })
  it.each([40038, 40039])('second-factor code %s shows our own copy instead of the backend TOTP prompt, and clears the spent code', async (code) => {
    // 后端真实提示语非空（生产拿到的永远是它），以前用空 msg 只覆盖到 fallback 分支。
    vi.mocked(emailCodeLoginRegister).mockRejectedValueOnce(new ModelGoApiError({ code, msg: '请输入身份验证器验证码' }))
    await goToCode();submitCode()
    expect(await screen.findByRole('alert')).toHaveTextContent(key('secondFactorUnavailable'))
    expect(screen.queryByText('请输入身份验证器验证码')).toBeNull()
    expect(codeInput()).toHaveValue('')
    expect(screen.queryAllByRole('textbox')).toHaveLength(1)
    expect(getSession).not.toHaveBeenCalled();expect(setAuth).not.toHaveBeenCalled()
  })
  it('resets the one-time captcha gate after a non-40025 login failure, so the next submit re-verifies first', async () => {
    gate.session = { show: vi.fn(), reset: vi.fn(), destroy: vi.fn() }
    vi.mocked(emailCodeLoginRegister).mockRejectedValueOnce(new ModelGoApiError({ code: 40038, msg: '请输入身份验证器验证码' }))
    await goToCode()
    fireEvent.click(await screen.findByRole('button', { name: 'account.auth.captcha.clickToVerify' }))
    await screen.findByText('account.auth.captcha.verified')
    submitCode()
    await waitFor(() => expect(emailCodeLoginRegister).toHaveBeenCalledWith('fixture@example.invalid', '123456', 'gate-param', 'ATTR', 'INV', undefined))
    await waitFor(() => expect(gate.session!.reset).toHaveBeenCalled())
    // 四元组已被消费：再提交必须先调起验证，不能拿旧的那组去撞 40025。
    submitCode()
    expect(await screen.findByText('account.auth.validation.securityVerificationRequired')).toBeInTheDocument()
    expect(gate.session!.show).toHaveBeenCalledTimes(2)
    expect(emailCodeLoginRegister).toHaveBeenCalledTimes(1)
  })
  it('requires human verification again after returning to another email', async () => {
    await goToCode();fireEvent.click(button('useAnotherEmail'))
    expect(button('continueEmail')).toBeDisabled()
    fireEvent.click(button('humanVerification'));await waitFor(() => expect(button('continueEmail')).toBeEnabled())
    fireEvent.click(button('continueEmail'));await screen.findByPlaceholderText('account.auth.placeholders.emailCode6')
    expect(screen.queryByLabelText(key('totpLabel'))).toBeNull()
  })
  it('新注册补发 sign_up，老账号只发 login_success（prd#1242）', async () => {
    vi.mocked(emailCodeLoginRegister).mockResolvedValue({ is_new_account: true } as never)
    await goToCode();submitCode()
    await waitFor(() => expect(trackEvent).toHaveBeenCalledWith('sign_up', { method: 'email_code', reg_success_ts: expect.any(String) }, { result: 'success' }))
    expect(trackEvent).toHaveBeenCalledWith('login_success', { method: 'email_code' }, { result: 'success' })
  })
  it('后端未给新注册标记时不发 sign_up（字段缺失）', async () => {
    vi.mocked(emailCodeLoginRegister).mockResolvedValue({} as never)
    await goToCode();submitCode()
    await waitFor(() => expect(trackEvent).toHaveBeenCalledWith('login_success', { method: 'email_code' }, { result: 'success' }))
    expect(vi.mocked(trackEvent).mock.calls.some(([event]) => event === 'sign_up')).toBe(false)
  })
  it('后端标记为 false 时不发 sign_up', async () => {
    vi.mocked(emailCodeLoginRegister).mockResolvedValue({ is_new_account: false } as never)
    await goToCode();submitCode()
    await waitFor(() => expect(trackEvent).toHaveBeenCalledWith('login_success', { method: 'email_code' }, { result: 'success' }))
    expect(vi.mocked(trackEvent).mock.calls.some(([event]) => event === 'sign_up')).toBe(false)
  })
})
