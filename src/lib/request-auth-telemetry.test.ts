import { beforeEach, describe, expect, it, vi } from 'vitest'
const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }))
vi.mock('ky', () => ({ default: { create: () => ({ post: postMock }), get: vi.fn() } }))
import { post, upload } from './request'
const beacon = vi.fn(() => true)
function response(body: unknown) { return { headers: { get: () => null }, json: async () => body } }
async function telemetry(): Promise<Record<string, unknown>> {
  const blob = (beacon.mock.calls as unknown[][]).at(-1)?.[1] as Blob
  expect(blob).toBeInstanceOf(Blob)
  return JSON.parse(await new Promise<string>((resolve, reject) => { const reader = new FileReader();reader.onload = () => resolve(String(reader.result));reader.onerror = reject;reader.readAsText(blob) }))
}
beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'sendBeacon', { configurable: true, value: beacon })
  postMock.mockResolvedValue(response({ code: 0, data: { success: true } }))
})
describe('authentication secrets never enter dev telemetry #1092', () => {
  it('redacts nested OTP/TOTP/captcha while preserving numeric business codes and actual request', async () => {
    const body = { code: '123456', totp: '654321', captcha_verify_param: 'private-captcha', nested: [{ code: '222222', totp: '111111' }] }
    await post('auth/email-code/login', body)
    const logged = await telemetry()
    expect(logged.request).toEqual({ code: '[REDACTED]', totp: '[REDACTED]', captcha_verify_param: '[REDACTED]', nested: [{ code: '[REDACTED]', totp: '[REDACTED]' }] })
    expect(logged.response).toEqual({ code: 0, data: { success: true } })
    expect(postMock.mock.calls[0][1].json).toBe(body)
    expect(JSON.stringify(logged)).not.toContain('123456')
  })
  it('also redacts factors when the backend returns a second-factor error', async () => {
    postMock.mockResolvedValue(response({ code: 40038, msg: 'second factor required', data: null }))
    await expect(post('auth/email-code/login', { code: '123456', totp: '654321', captcha_verify_param: 'private-captcha' })).rejects.toMatchObject({ code: 40038 })
    const logged = await telemetry()
    expect(logged.code).toBe(40038)
    expect(logged.request).toEqual({ code: '[REDACTED]', totp: '[REDACTED]', captcha_verify_param: '[REDACTED]' })
  })
  it('redacts FormData sensitive fields and preserves ordinary values', async () => {
    const data = new FormData();data.set('code', '123456');data.set('totp', '654321');data.set('captcha_verify_param', 'private-captcha');data.set('display_name', 'Fixture')
    await upload('post', 'account/test-form', data)
    expect((await telemetry()).request).toEqual({ code: '[REDACTED]', totp: '[REDACTED]', captcha_verify_param: '[REDACTED]', display_name: 'Fixture' })
    expect(postMock.mock.calls[0][1].body).toBe(data)
  })
})
