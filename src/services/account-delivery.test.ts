import { beforeEach, describe, expect, it, vi } from 'vitest'
import { changePassword, getProfile, setDefaultWorkspace } from './account'
import { emailCodeLoginRegister, sendEmailCode } from './auth'
const http = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }))
vi.mock('@/lib/request', () => ({ ...http, del: vi.fn(), patch: vi.fn(), upload: vi.fn(), apiBaseUrl: () => '' }))
vi.mock('@/lib/auth/csrf-token', () => ({ setCsrfToken: vi.fn() }))
beforeEach(() => vi.clearAllMocks())
describe('account API contracts #1092 #1093 #1097', () => {
  it('preserves explicit false and empty preference from the profile', async () => {
    const profile = { has_password: false, default_workspace_id: '' }
    http.get.mockResolvedValue(profile)
    expect(await getProfile()).toBe(profile)
    expect(http.get).toHaveBeenCalledWith('account/profile')
  })
  it.each(['ws-owned', ''])('posts preference exactly, including explicit clear %s', async (id) => {
    http.post.mockResolvedValue({ default_workspace_id: id })
    expect(await setDefaultWorkspace({ workspace_id: id })).toEqual({ default_workspace_id: id })
    expect(http.post).toHaveBeenCalledWith('account/active-workspace', { workspace_id: id })
  })
  it('allows the first-set request to omit old password without inventing a value', async () => {
    await changePassword({ new_password: 'Newpassw0rd!' })
    expect(http.post).toHaveBeenCalledWith('account/password', { new_password: 'Newpassw0rd!' })
  })
  it('forwards the email code, captcha and attribution to atomic login without verifying first', async () => {
    await emailCodeLoginRegister('fixture@example.invalid', '123456', 'fresh-captcha', 'REF', 'INVITE')
    expect(http.post).toHaveBeenCalledExactlyOnceWith('auth/email-code/login', {
      email: 'fixture@example.invalid', code: '123456', captcha_verify_param: 'fresh-captcha', referral_code: 'REF', invitation_token: 'INVITE',
    })
    expect(http.post.mock.calls[0][1]).not.toHaveProperty('totp')
  })
  it('omits absent optional factors and retains send endpoint for existing users', async () => {
    await emailCodeLoginRegister('fixture@example.invalid', '123456', 'fresh-captcha')
    expect(http.post).toHaveBeenLastCalledWith('auth/email-code/login', { email: 'fixture@example.invalid', code: '123456', captcha_verify_param: 'fresh-captcha' })
    await sendEmailCode('fixture@example.invalid', 'send-captcha')
    expect(http.post).toHaveBeenLastCalledWith('auth/email-code/send', { email: 'fixture@example.invalid', captcha_verify_param: 'send-captcha' })
  })
})
