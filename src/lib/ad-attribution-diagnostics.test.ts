import { beforeEach, describe, expect, it, vi } from 'vitest'

const emit = vi.hoisted(() => vi.fn())
vi.mock('@/lib/track', () => ({ trackEvent: emit }))

import { adSignal, trackAdArrival, trackAdAttributionStage } from './ad-attribution-diagnostics'

describe('匿名广告归因诊断', () => {
  beforeEach(() => { sessionStorage.clear(); emit.mockClear() })

  it('只报告是否有广告信号，绝不暴露点击 ID 或 UTM 值', () => {
    expect(adSignal({ gclid: 'private-click', utm_source: 'private-source' })).toEqual({ has_click_id: true, has_utm: true, has_source: true })
    trackAdAttributionStage('auth_request', { gclid: 'private-click', utm_source: 'private-source' }, 'oauth')
    expect(emit).toHaveBeenCalledWith('ad_attribution:stage', {
      stage: 'auth_request', has_click_id: true, has_utm: true, has_source: true, method: 'oauth',
    })
    expect(JSON.stringify(emit.mock.calls)).not.toContain('private-')
  })

  it('区分到达 URL 参数与保存的来源', () => {
    sessionStorage.setItem('mg_ad_source', JSON.stringify({ captured_at: Date.now(), fields: { gclid: 'stored-secret' } }))
    trackAdArrival('?redirect=%2Fmodels%3Futm_source%3Dprivate-utm')
    expect(emit).toHaveBeenCalledWith('ad_attribution:stage', {
      stage: 'console_arrival', url_click_id: false, url_utm: true, cached_click_id: true, cached_utm: false,
    })
    expect(JSON.stringify(emit.mock.calls)).not.toContain('private-')
    expect(JSON.stringify(emit.mock.calls)).not.toContain('stored-secret')
  })

  it('忽略外域和非法 redirect，不影响页面', () => {
    expect(() => trackAdArrival('?redirect=%2F%2Fevil.example%2F%3Fgclid%3Dsecret')).not.toThrow()
    expect(emit.mock.calls.at(-1)?.[1]).toMatchObject({ url_click_id: false, url_utm: false })
  })
})
