import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveAdSource } from '@/pages/signup/ad-source'

/**
 * 建号请求的归因契约（prd46#1354 + #1355）。
 *
 * 这两个字段组都曾经「代码写好了但没上送」：#1354 的 4 个渠道字段被 #1271 的
 * tracking-only 决定挡在注册体之外（该决定已被 #1354 推翻），#1355 的 visitor_id
 * 一直只在埋点里。所以本用例锁的不是「能不能解析」，而是**请求体/URL 里到底有没有**。
 */
const http = vi.hoisted(() => ({ post: vi.fn(), get: vi.fn() }))
vi.mock('@/lib/request', () => ({
  ...http,
  del: vi.fn(),
  patch: vi.fn(),
  upload: vi.fn(),
  apiBaseUrl: () => 'https://api.example.invalid',
}))
vi.mock('@/lib/auth/csrf-token', () => ({ setCsrfToken: vi.fn() }))

import { emailCodeLoginRegister, oauthAuthorizeUrl, phoneLoginRegister } from './auth'

const VISITOR_UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

function setVisitorCookie(value: string) {
  document.cookie = `mg_vid=${value}; Path=/`
}

function clearAllCookies() {
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim()
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`
  }
}

/** 只带渠道维度的落地参数（Google Ads 跟踪模板那一类）。 */
const CHANNEL_QUERY = 'channel_id=google_ads&matchtype=e&device=c&network=g'

function lastBody(): Record<string, unknown> {
  return http.post.mock.calls.at(-1)?.[1] as Record<string, unknown>
}

describe('建号请求带渠道维度与访客 ID（prd46#1354 + #1355）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    clearAllCookies()
    window.history.replaceState({}, '', '/login')
  })

  it('邮箱码建号：请求体带上 channel_id / matchtype / device / network', async () => {
    await emailCodeLoginRegister('fixture@example.invalid', '123456', 'captcha', undefined, undefined, resolveAdSource(new URLSearchParams(CHANNEL_QUERY)))
    expect(lastBody()).toMatchObject({
      channel_id: 'google_ads',
      matchtype: 'e',
      device: 'c',
      network: 'g',
    })
  })

  it('手机号建号：请求体同样带上这 4 个渠道字段', async () => {
    await phoneLoginRegister('10000000000', '123456', 'captcha', undefined, resolveAdSource(new URLSearchParams(CHANNEL_QUERY)))
    expect(lastBody()).toMatchObject({ channel_id: 'google_ads', matchtype: 'e', device: 'c', network: 'g' })
  })

  it('有 mg_vid 时两条建号腿都带上 visitor_id', async () => {
    setVisitorCookie(VISITOR_UUID)
    await emailCodeLoginRegister('fixture@example.invalid', '123456', 'captcha')
    expect(lastBody()).toMatchObject({ visitor_id: VISITOR_UUID })
    await phoneLoginRegister('10000000000', '123456', 'captcha')
    expect(lastBody()).toMatchObject({ visitor_id: VISITOR_UUID })
  })

  it('没有 mg_vid 时整条 visitor_id 不带（老流量请求体与改动前一致）', async () => {
    await emailCodeLoginRegister('fixture@example.invalid', '123456', 'captcha')
    expect(lastBody()).not.toHaveProperty('visitor_id')
  })

  it('cookie 里不是合法 UUID 时不带 visitor_id（不把脏值送给后端）', async () => {
    setVisitorCookie('not-a-uuid')
    await emailCodeLoginRegister('fixture@example.invalid', '123456', 'captcha')
    expect(lastBody()).not.toHaveProperty('visitor_id')
  })

  it('OAuth authorize 的查询串带上 4 个渠道字段与 visitor_id', () => {
    setVisitorCookie(VISITOR_UUID)
    window.history.replaceState({}, '', `/login?${CHANNEL_QUERY}&gclid=g1`)
    const url = new URL(oauthAuthorizeUrl('google', '/dashboard'))
    expect(url.searchParams.get('channel_id')).toBe('google_ads')
    expect(url.searchParams.get('matchtype')).toBe('e')
    expect(url.searchParams.get('device')).toBe('c')
    expect(url.searchParams.get('network')).toBe('g')
    expect(url.searchParams.get('visitor_id')).toBe(VISITOR_UUID)
  })

  it('channel_id 按后端 maxLength=128 截断后再上送（超长会让注册 400 不建号）', async () => {
    const long = 'x'.repeat(200)
    await emailCodeLoginRegister('fixture@example.invalid', '123456', 'captcha', undefined, undefined, resolveAdSource(new URLSearchParams(`channel_id=${long}`)))
    expect((lastBody().channel_id as string)).toHaveLength(128)
  })
})
