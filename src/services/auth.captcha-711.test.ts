import { describe, expect, it, vi } from 'vitest'

// 忘记密码 / 重置密码两个入口必须能把人机校验凭据带上（shared/modelgo_prd#711 契约二）。
//
// 重置密码页尤其关键：它是从**邮件**里打开的新页面，浏览器上没有任何先前的凭证 —— 沿用
// "登录页已经解过题"的假设会让这个页面在 enforce 下 100% 卡死。
const post = vi.fn<(...args: unknown[]) => Promise<null>>(async () => null)
// 真实模块路径是 @/lib/request（不是 @/lib/http）—— mock 打错地方时请求会真的走下去，
// 用例会以一个业务错误失败而不是测到 body。
vi.mock('@/lib/request', () => ({
  post: (...a: unknown[]) => post(...a),
  get: vi.fn(),
  apiBaseUrl: () => 'https://api.test',
}))
vi.mock('@/lib/auth/csrf-token', () => ({ setCsrfToken: vi.fn() }))

describe('auth service captcha param (#711)', () => {
  it('forgotPassword 带上凭据', async () => {
    post.mockClear()
    const { forgotPassword } = await import('./auth')
    await forgotPassword('a@b.co', 'solved-token')
    const body = post.mock.calls[0]?.[1] as Record<string, unknown>
    expect(body.captcha_verify_param).toBe('solved-token')
    expect(body.reset_url).toBeTruthy()
  })

  it('resetPassword 带上凭据', async () => {
    post.mockClear()
    const { resetPassword } = await import('./auth')
    await resetPassword('tok', 'passw0rd!', 'solved-token')
    const body = post.mock.calls[0]?.[1] as Record<string, unknown>
    expect(body.captcha_verify_param).toBe('solved-token')
  })

  it('未启用滑块（null）时不带这个键，而不是带一个空串', async () => {
    post.mockClear()
    const { resetPassword } = await import('./auth')
    await resetPassword('tok', 'passw0rd!', null)
    const body = post.mock.calls[0]?.[1] as Record<string, unknown>
    expect('captcha_verify_param' in body).toBe(false)
  })
})
