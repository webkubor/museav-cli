import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  adSourceFromSearchParams,
  captureAdAttributionAtBoot,
  clearPersistedAdSource,
  readPersistedAdAttribution,
  resolveAdAttribution,
  resolveAdSource,
} from './ad-source'

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

  it('reg_click_ts 只进埋点，不进注册请求体', () => {
    expect(resolveAdSource(new URLSearchParams('gclid=g1&reg_click_ts=1760000000000'))).toEqual({ gclid: 'g1' })
    expect(resolveAdAttribution(new URLSearchParams(''))).toEqual({ gclid: 'g1', reg_click_ts: '1760000000000' })
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
    captureAdAttributionAtBoot()
    // 回跳落地：只有新注册标记，来源参数已被厂商往返吃掉
    window.history.pushState({}, '', '/auth-callback?is_new_account=true')
    captureAdAttributionAtBoot()
    expect(readPersistedAdAttribution()).toEqual({
      gclid: 'g1',
      utm_source: 'google',
      channel_id: 'google_ads',
    })
  })

  it('启动时无来源不写盘，也不清掉已有记录', () => {
    resolveAdSource(new URLSearchParams('gclid=g1'))
    window.history.pushState({}, '', '/dashboard')
    captureAdAttributionAtBoot()
    expect(readPersistedAdAttribution()).toEqual({ gclid: 'g1' })
  })
})

describe('点击 ID 粘性：utm 串访不冲掉 gclid', () => {
  beforeEach(() => sessionStorage.clear())

  const T0 = 1_760_000_000_000
  const HOUR = 60 * 60 * 1000

  it('utm-only 落地沿用之前的 gclid，其余字段以本次 URL 为准', () => {
    resolveAdAttribution(new URLSearchParams('gclid=g1&utm_source=google'), T0)
    const result = { gclid: 'g1', utm_source: 'bing', utm_campaign: 'c2' }
    expect(resolveAdAttribution(new URLSearchParams('utm_source=bing&utm_campaign=c2'), T0 + HOUR)).toEqual(result)
    expect(readPersistedAdAttribution(T0 + HOUR)).toEqual(result)
  })

  it('本次带了新的 gclid 则整体以新值为准', () => {
    resolveAdAttribution(new URLSearchParams('gclid=g1&utm_source=google'), T0)
    expect(resolveAdAttribution(new URLSearchParams('gclid=g2&utm_source=bing'), T0 + HOUR)).toEqual({ gclid: 'g2', utm_source: 'bing' })
  })

  it('本次带的是别的点击 ID（gbraid）时，不混入旧的 gclid', () => {
    resolveAdAttribution(new URLSearchParams('gclid=g1'), T0)
    expect(resolveAdAttribution(new URLSearchParams('gbraid=b1'), T0 + HOUR)).toEqual({ gbraid: 'b1' })
  })

  it('过期的记录不复用', () => {
    resolveAdAttribution(new URLSearchParams('gclid=g1'), T0)
    expect(resolveAdAttribution(new URLSearchParams('utm_source=bing'), T0 + 24 * HOUR)).toEqual({ utm_source: 'bing' })
  })

  it('沿用的点击 ID 不续期：24h 窗口从真正点击那一刻起算', () => {
    resolveAdAttribution(new URLSearchParams('gclid=g1'), T0)
    expect(resolveAdAttribution(new URLSearchParams('utm_source=a'), T0 + 23 * HOUR)).toEqual({ gclid: 'g1', utm_source: 'a' })
    expect(resolveAdAttribution(new URLSearchParams('utm_source=b'), T0 + 25 * HOUR)).toEqual({ utm_source: 'b' })
  })

  it('上送注册接口的 resolveAdSource 也带上沿用的 gclid', () => {
    resolveAdSource(new URLSearchParams('gclid=g1'), T0)
    expect(resolveAdSource(new URLSearchParams('utm_source=bing'), T0 + HOUR)).toEqual({ gclid: 'g1', utm_source: 'bing' })
  })
})

describe('captureAdAttributionAtBoot（启动即落盘，不等登录页）', () => {
  beforeEach(() => {
    sessionStorage.clear()
    window.history.replaceState(null, '', '/')
  })

  const T0 = 1_760_000_000_000

  it('落地页带的广告参数启动时即持久化，埋点字段也一起存', () => {
    window.history.replaceState(null, '', '/models?gclid=g1&utm_source=google&channel_id=google_ads')
    captureAdAttributionAtBoot(T0)
    expect(readPersistedAdAttribution(T0)).toEqual({ gclid: 'g1', utm_source: 'google', channel_id: 'google_ads' })
  })

  it('没有广告参数时不写入，也不动地址栏', () => {
    window.history.replaceState(null, '', '/models?tab=usage')
    captureAdAttributionAtBoot(T0)
    expect(readPersistedAdAttribution(T0)).toBeUndefined()
    expect(window.location.search).toBe('?tab=usage')
  })

  it('sessionStorage 写入失败时不抛错，不阻断启动', () => {
    window.history.replaceState(null, '', '/models?gclid=g1')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    try {
      expect(() => captureAdAttributionAtBoot(T0)).not.toThrow()
    } finally {
      vi.restoreAllMocks()
    }
  })
})
