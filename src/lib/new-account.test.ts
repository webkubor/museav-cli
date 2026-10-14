import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  captureNewAccountFlag,
  flushNewAccountSignUp,
  resetNewAccountStateForTest,
  trackSignUp,
} from './new-account'
import { trackEvent } from '@/lib/track'
import { useAuthStore } from '@/store/auth'
import { captureAdAttributionAtBoot } from '@/pages/signup/ad-source'

vi.mock('@/lib/track', () => ({ trackEvent: vi.fn() }))

const T0 = 1_760_000_000_000
const MINUTE = 60 * 1000

/** 把当前地址换成给定 URL。 */
function goto(url: string) {
  window.history.replaceState(null, '', url)
}

describe('新注册标记捕获与上报', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetNewAccountStateForTest()
    goto('/dashboard')
  })

  afterEach(() => {
    goto('/dashboard')
  })

  it('capture 只认显式 true，并把它从地址栏摘掉', () => {
    goto('/dashboard?foo=1&is_new_account=true&bar=2')
    captureNewAccountFlag(T0)
    expect(window.location.search).toBe('?foo=1&bar=2')
    flushNewAccountSignUp(T0)
    expect(trackEvent).toHaveBeenCalledWith('sign_up', { method: 'oauth', reg_success_ts: expect.any(String) }, { result: 'success' })
  })

  it('false / 空值 / 拼错的值都按老账号处理，不发事件但仍摘掉参数', () => {
    for (const value of ['false', '', 'TRUE', '1', 'yes']) {
      vi.clearAllMocks()
      resetNewAccountStateForTest()
      goto(`/dashboard?is_new_account=${encodeURIComponent(value)}`)
      captureNewAccountFlag(T0)
      expect(window.location.search).toBe('')
      flushNewAccountSignUp(T0)
      expect(trackEvent).not.toHaveBeenCalled()
    }
  })

  it('没有该参数时不动地址栏、不发事件', () => {
    goto('/dashboard?tab=usage')
    captureNewAccountFlag(T0)
    expect(window.location.search).toBe('?tab=usage')
    flushNewAccountSignUp(T0)
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('flush 幂等：调用几次都只上报一次（多条会话成功路径共用它）', () => {
    goto('/dashboard?is_new_account=true')
    captureNewAccountFlag(T0)
    flushNewAccountSignUp(T0)
    flushNewAccountSignUp(T0)
    flushNewAccountSignUp(T0)
    expect(trackEvent).toHaveBeenCalledTimes(1)
  })

  it('会话没成立（未 flush）就不上报，标记不会自己漏出去', () => {
    goto('/dashboard?is_new_account=true')
    captureNewAccountFlag(T0)
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('超过 5 分钟时效窗口的陈旧标记直接丢弃', () => {
    goto('/dashboard?is_new_account=true')
    captureNewAccountFlag(T0)
    flushNewAccountSignUp(T0 + 5 * MINUTE + 1)
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('恰好在窗口边界内仍然上报', () => {
    goto('/dashboard?is_new_account=true')
    captureNewAccountFlag(T0)
    flushNewAccountSignUp(T0 + 5 * MINUTE)
    expect(trackEvent).toHaveBeenCalledTimes(1)
  })

  it('过期被丢弃后再次 flush 也不会补发', () => {
    goto('/dashboard?is_new_account=true')
    captureNewAccountFlag(T0)
    flushNewAccountSignUp(T0 + 6 * MINUTE)
    flushNewAccountSignUp(T0 + 6 * MINUTE)
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('保留 hash 与其它查询参数，不做整串重写', () => {
    goto('/dashboard?redirect=%2Fusage&is_new_account=true#section-2')
    captureNewAccountFlag(T0)
    expect(window.location.pathname).toBe('/dashboard')
    expect(window.location.search).toBe('?redirect=%2Fusage')
    expect(window.location.hash).toBe('#section-2')
  })
})

describe('trackSignUp 判定', () => {
  beforeEach(() => vi.clearAllMocks())

  it('只有 true 才发 sign_up', () => {
    trackSignUp('email_code', true)
    expect(trackEvent).toHaveBeenCalledWith('sign_up', { method: 'email_code', reg_success_ts: expect.any(String) }, { result: 'success' })
  })

  it('reg_click_ts 与 reg_success_ts 成对进入埋点', () => {
    const before = Date.now()
    trackSignUp('email_code', true, { gclid: 'g1', ad_group_id: 'ag1', reg_click_ts: '1760000000000' })
    const props = vi.mocked(trackEvent).mock.calls[0][1] as Record<string, string>
    expect(props).toMatchObject({ gclid: 'g1', ad_group_id: 'ag1', reg_click_ts: '1760000000000' })
    expect(Number(props.reg_success_ts)).toBeGreaterThanOrEqual(before)
  })

  it('false / undefined 一律不发', () => {
    trackSignUp('email_code', false)
    trackSignUp('email_code', undefined)
    expect(trackEvent).not.toHaveBeenCalled()
  })
})

describe('sign_up 推 GTM dataLayer（prd46#1271）', () => {
  const dl = () => (window as Window & { dataLayer?: Record<string, unknown>[] }).dataLayer ?? []
  const signUps = () => dl().filter((e) => e.event === 'sign_up')

  beforeEach(() => {
    vi.clearAllMocks()
    resetNewAccountStateForTest()
    sessionStorage.clear()
    ;(window as Window & { dataLayer?: unknown[] }).dataLayer = []
    useAuthStore.setState({ account: { account_id: 'acc_1' } as never, activeWorkspaceId: 'ws_1' })
    goto('/dashboard')
  })

  afterEach(() => {
    useAuthStore.setState({ account: null, activeWorkspaceId: null })
  })

  it('邮箱腿：带身份与完整广告来源（含只进埋点的字段）', () => {
    trackSignUp('email_code', true, { gclid: 'g1', campaign_id: 'c1', channel_id: 'google_ads', matchtype: 'e' })
    expect(signUps()).toEqual([
      { event: 'sign_up', method: 'email_code', user_id: 'acc_1', workspace_id: 'ws_1', gclid: 'g1', campaign_id: 'c1', channel_id: 'google_ads', matchtype: 'e', reg_success_ts: expect.any(String) },
    ])
  })

  it('老账号不推', () => {
    trackSignUp('email_code', false, { gclid: 'g1' })
    expect(signUps()).toEqual([])
  })

  it('OAuth 腿：来源在回跳捕获时拍快照，回调页清掉 sessionStorage 后上报仍带来源', () => {
    sessionStorage.setItem('mg_ad_source', JSON.stringify({ captured_at: T0, fields: { gclid: 'g2', device: 'c' } }))
    goto('/dashboard?is_new_account=true')
    captureNewAccountFlag(T0)
    sessionStorage.clear()
    flushNewAccountSignUp(T0)
    expect(signUps()).toEqual([{ event: 'sign_up', method: 'oauth', user_id: 'acc_1', workspace_id: 'ws_1', gclid: 'g2', device: 'c', reg_success_ts: expect.any(String) }])
  })

  it('启动顺序：先 captureAdAttributionAtBoot 再 captureNewAccountFlag，回跳 URL 上的 gclid 也进快照', () => {
    goto('/dashboard?gclid=g4&is_new_account=true')
    captureAdAttributionAtBoot(T0)
    captureNewAccountFlag(T0)
    sessionStorage.clear()
    flushNewAccountSignUp(T0)
    expect(signUps()).toEqual([{ event: 'sign_up', method: 'oauth', user_id: 'acc_1', workspace_id: 'ws_1', gclid: 'g4', reg_success_ts: expect.any(String) }])
  })

  it('GA4 / Google Ads 标识随两条腿一起上报；cookie 缺失时不带这些字段', () => {
    const setCookie = (c: string) => {
      document.cookie = `${c}; path=/`
    }
    const expire = (...names: string[]) => names.forEach((n) => setCookie(`${n}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`))
    const ga = { ga_client_id: '111.222', ga_session_id: '1760000000', gcl_aw: 'gclid_abc' }
    try {
      setCookie('_ga=GA1.1.111.222')
      setCookie('_ga_WCEKH5ZZEH=GS1.1.1760000000.3.1.1760000100.0.0.0')
      setCookie('_gcl_aw=GCL.1760000000.gclid_abc')
      trackSignUp('email_code', true, { gclid: 'g1' })
      expect(vi.mocked(trackEvent).mock.calls[0][1]).toMatchObject({ method: 'email_code', gclid: 'g1', ...ga })
      expect(signUps()[0]).toMatchObject({ method: 'email_code', gclid: 'g1', ...ga })
    } finally {
      expire('_ga', '_ga_WCEKH5ZZEH', '_gcl_aw')
    }
    vi.clearAllMocks()
    ;(window as Window & { dataLayer?: unknown[] }).dataLayer = []
    trackSignUp('email_code', true, { gclid: 'g1' })
    expect(vi.mocked(trackEvent).mock.calls[0][1]).not.toHaveProperty('ga_client_id')
    expect(signUps()[0]).not.toHaveProperty('gcl_aw')
  })
})
