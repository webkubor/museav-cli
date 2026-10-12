import { beforeEach, describe, expect, it } from 'vitest'
import { adSourceFromSearchParams, clearPersistedAdSource, persistAdAttributionOnBoot, readPersistedAdAttribution, resolveAdAttribution, resolveAdSource } from './ad-source'

describe('ad-source', () => {
  beforeEach(() => {
    sessionStorage.clear()
    window.history.pushState({}, '', '/')
  })

  it('picks only known ad keys and drops empty values', () => {
    const sp = new URLSearchParams('gclid=g1&utm_source=google&foo=bar&campaign_id=&ad_group_id=ag9')
    expect(adSourceFromSearchParams(sp)).toEqual({ gclid: 'g1', utm_source: 'google', ad_group_id: 'ag9' })
  })

  it('persists URL values and falls back to session when URL has none', () => {
    resolveAdSource(new URLSearchParams('gclid=g1'))
    expect(resolveAdSource(new URLSearchParams(''))).toEqual({ gclid: 'g1' })
  })

  it('unwraps ad params folded into redirect query', () => {
    const sp = new URLSearchParams({ redirect: '/?utm_campaign=c7' })
    expect(resolveAdSource(sp)).toEqual({ utm_campaign: 'c7' })
  })

  it('ignores persisted records older than 24h', () => {
    resolveAdSource(new URLSearchParams('gclid=old'), 1_000)
    expect(resolveAdSource(new URLSearchParams(''), 1_000 + 24 * 60 * 60 * 1000)).toBeUndefined()
  })

  it('drops tampered persisted fields that are not whitelisted strings', () => {
    sessionStorage.setItem('mg_ad_source', JSON.stringify({ captured_at: Date.now(), fields: { gclid: 'ok', evil: 'x', utm_source: 42 } }))
    expect(resolveAdSource(new URLSearchParams(''))).toEqual({ gclid: 'ok' })
  })

  it('does not unwrap external redirect targets', () => {
    expect(resolveAdSource(new URLSearchParams({ redirect: 'https://evil.example/?gclid=x' }))).toBeUndefined()
    expect(resolveAdSource(new URLSearchParams({ redirect: '//evil.example/?gclid=x' }))).toBeUndefined()
    expect(resolveAdSource(new URLSearchParams({ redirect: '/\\evil.example/?gclid=x' }))).toBeUndefined()
  })

  it('returns undefined when nothing was ever captured', () => {
    expect(resolveAdSource(new URLSearchParams('aff=CN1'))).toBeUndefined()
  })

  it('clears the persisted value after registration', () => {
    resolveAdSource(new URLSearchParams('gclid=g1'))
    clearPersistedAdSource()
    expect(resolveAdSource(new URLSearchParams(''))).toBeUndefined()
  })
})

describe('只进埋点的来源字段（prd46#1271）', () => {
  beforeEach(() => sessionStorage.clear())

  const q = 'gclid=g1&campaign_id=c1&channel_id=google_ads&matchtype=e&device=c&network=g'

  it('resolveAdSource 不返回 channel_id / matchtype / device / network，注册请求体与改动前一致', () => {
    expect(resolveAdSource(new URLSearchParams(q))).toEqual({ gclid: 'g1', campaign_id: 'c1' })
  })

  it('resolveAdAttribution 返回全部字段，并从持久化记录取回', () => {
    const all = { gclid: 'g1', campaign_id: 'c1', channel_id: 'google_ads', matchtype: 'e', device: 'c', network: 'g' }
    expect(resolveAdAttribution(new URLSearchParams(q))).toEqual(all)
    expect(resolveAdAttribution(new URLSearchParams(''))).toEqual(all)
    expect(readPersistedAdAttribution()).toEqual(all)
  })

  it('只有埋点字段时 resolveAdSource 返回 undefined（不往注册请求塞空对象）', () => {
    expect(resolveAdSource(new URLSearchParams('channel_id=google_ads'))).toBeUndefined()
    expect(resolveAdAttribution(new URLSearchParams(''))).toEqual({ channel_id: 'google_ads' })
  })

  it('redirect 内嵌的埋点字段也能解开', () => {
    expect(resolveAdAttribution(new URLSearchParams({ redirect: '/?device=m&gclid=g9' }))).toEqual({ gclid: 'g9', device: 'm' })
  })

  it('启动即落盘：OAuth 整页往返后回跳 URL 不带来源也能取回（prd46#1271）', () => {
    window.history.pushState({}, '', '/login?gclid=g1&utm_source=google&channel_id=google_ads')
    persistAdAttributionOnBoot()
    // 回跳落地：只有新注册标记，来源参数已被厂商往返吃掉
    window.history.pushState({}, '', '/auth-callback?is_new_account=true')
    persistAdAttributionOnBoot()
    expect(readPersistedAdAttribution()).toEqual({
      gclid: 'g1',
      utm_source: 'google',
      channel_id: 'google_ads',
    })
  })

  it('启动时无来源不写盘，也不清掉已有记录', () => {
    resolveAdSource(new URLSearchParams('gclid=g1'))
    window.history.pushState({}, '', '/dashboard')
    persistAdAttributionOnBoot()
    expect(readPersistedAdAttribution()).toEqual({ gclid: 'g1' })
  })
})
