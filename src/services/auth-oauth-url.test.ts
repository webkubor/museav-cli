import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { oauthAuthorizeUrl } from './auth'

/** prd46#1242：OAuth 首次登录建号也要透传广告来源与推荐码（web-api!90 契约） */
describe('oauthAuthorizeUrl attribution passthrough', () => {
  const setSearch = (search: string) => window.history.replaceState({}, '', `/login${search}`)

  beforeEach(() => sessionStorage.clear())
  afterEach(() => setSearch(''))

  it('keeps the URL unchanged when there is no ad source or referral', () => {
    setSearch('')
    const url = new URL(oauthAuthorizeUrl('google', '/models', 'cap'))
    expect(url.pathname).toMatch(/\/api\/v1\/auth\/oauth\/google\/authorize$/)
    expect([...url.searchParams.keys()].sort()).toEqual(['captcha_verify_param', 'redirect'])
    expect(url.searchParams.get('redirect')).toBe('/models')
  })

  it('appends last-click ad params and referral_code from the current URL', () => {
    setSearch('?gclid=g1&utm_source=google&campaign_id=c9&aff=MG-1&foo=bar')
    const url = new URL(oauthAuthorizeUrl('github', '/'))
    expect(url.searchParams.get('gclid')).toBe('g1')
    expect(url.searchParams.get('utm_source')).toBe('google')
    expect(url.searchParams.get('campaign_id')).toBe('c9')
    expect(url.searchParams.get('referral_code')).toBe('MG-1')
    expect(url.searchParams.has('foo')).toBe(false)
  })

  it('drops malformed or oversized referral codes', () => {
    setSearch(`?aff=${'x'.repeat(65)}`)
    expect(new URL(oauthAuthorizeUrl('google', '/')).searchParams.has('referral_code')).toBe(false)
    sessionStorage.clear()
    setSearch('?aff=%3Cscript%3E')
    expect(new URL(oauthAuthorizeUrl('google', '/')).searchParams.has('referral_code')).toBe(false)
  })

  it('an invalid referral in the URL clears the previously cached one', () => {
    setSearch('?aff=OLD-1')
    oauthAuthorizeUrl('google', '/')
    setSearch('?aff=%3Cbad%3E')
    expect(new URL(oauthAuthorizeUrl('google', '/')).searchParams.has('referral_code')).toBe(false)
    // 空值 ?aff= 同样以本次链接为准
    setSearch('?aff=OLD-2')
    oauthAuthorizeUrl('google', '/')
    setSearch('?aff=')
    expect(new URL(oauthAuthorizeUrl('google', '/')).searchParams.has('referral_code')).toBe(false)
    // 根路径重定向后内嵌在 redirect 里的空 aff 同样生效
    setSearch('?aff=OLD-3')
    oauthAuthorizeUrl('google', '/')
    setSearch(`?redirect=${encodeURIComponent('/?aff=')}`)
    expect(new URL(oauthAuthorizeUrl('google', '/')).searchParams.has('referral_code')).toBe(false)
    setSearch('')
    expect(new URL(oauthAuthorizeUrl('google', '/')).searchParams.has('referral_code')).toBe(false)
  })

  it('falls back to the session-persisted ad source after the URL lost it', () => {
    setSearch('?gclid=persisted')
    oauthAuthorizeUrl('google', '/')
    setSearch('')
    const url = new URL(oauthAuthorizeUrl('google', '/'))
    expect(url.searchParams.get('gclid')).toBe('persisted')
  })
})
