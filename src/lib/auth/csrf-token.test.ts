/**
 * CSRF token 内存来源 + header 注入优先级（需求方#676）。
 *
 * 锚点：服务端按 last-wins 的 session cookie 派生校验值，而 document.cookie 的顺序
 * 按 RFC 6265 §5.4（path 长度 → 创建时间）——旧的排第一。所以只要浏览器里有同名影子
 * cookie，读 cookie 就必然取错、每个写请求 40302。这里守住「优先用 /auth/session
 * 响应体的值，cookie 只在还没拉到 session 时兜底」这条不被改回去。
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { clearCsrfToken, getCsrfToken, setCsrfToken } from './csrf-token'
import { injectHeaders } from '@/lib/request-headers'

beforeEach(() => {
  clearCsrfToken()
  // 清掉本用例文件可能残留的 cookie
  document.cookie = 'modelgo_csrf=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
})

describe('csrf-token 内存来源', () => {
  it('未收到 session 前为空', () => {
    expect(getCsrfToken()).toBeNull()
  })

  it('收下 /auth/session 的值后可读回', () => {
    setCsrfToken('tok-from-session-body')
    expect(getCsrfToken()).toBe('tok-from-session-body')
  })

  it('空值不覆盖已有值 —— 旧接口回包没这个字段时不能把它擦掉', () => {
    setCsrfToken('tok-good')
    setCsrfToken(undefined)
    setCsrfToken(null)
    setCsrfToken('')
    expect(getCsrfToken()).toBe('tok-good')
  })

  it('clearCsrfToken 清空 —— 会话作废后不能让下个账号复用', () => {
    setCsrfToken('tok-good')
    clearCsrfToken()
    expect(getCsrfToken()).toBeNull()
  })
})

describe('X-CSRF-Token 注入优先级', () => {
  it('写请求优先用内存里的值，而不是 cookie（本单的核心修复）', () => {
    document.cookie = 'modelgo_csrf=shadow-stale-value; path=/'
    setCsrfToken('tok-from-session-body')

    const req = new Request('https://example.test/api/v1/account/active-tenant', { method: 'POST' })
    injectHeaders(req)

    expect(req.headers.get('X-CSRF-Token')).toBe('tok-from-session-body')
  })

  it('内存里还没有时回落 cookie —— 维持旧行为，不要变成不发头', () => {
    document.cookie = 'modelgo_csrf=cookie-only-value; path=/'

    const req = new Request('https://example.test/api/v1/account/active-tenant', { method: 'POST' })
    injectHeaders(req)

    expect(req.headers.get('X-CSRF-Token')).toBe('cookie-only-value')
  })

  it('GET 不带这个头（mutatingOnly）', () => {
    setCsrfToken('tok-from-session-body')

    const req = new Request('https://example.test/api/v1/auth/session', { method: 'GET' })
    injectHeaders(req)

    expect(req.headers.get('X-CSRF-Token')).toBeNull()
  })
})
