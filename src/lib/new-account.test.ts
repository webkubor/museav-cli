import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  captureNewAccountFlag,
  flushNewAccountSignUp,
  resetNewAccountStateForTest,
  trackSignUp,
} from './new-account'
import { trackEvent } from '@/lib/track'

vi.mock('@/lib/track', () => ({ trackEvent: vi.fn() }))

/** 把当前地址换成给定 URL 并清掉上一次用例留下的待上报标记。 */
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
    captureNewAccountFlag()
    expect(window.location.search).toBe('?foo=1&bar=2')
    flushNewAccountSignUp()
    expect(trackEvent).toHaveBeenCalledWith('sign_up', { method: 'oauth' }, { result: 'success' })
  })

  it('false / 空值 / 拼错的值都按老账号处理，不发事件但仍摘掉参数', () => {
    for (const value of ['false', '', 'TRUE', '1', 'yes']) {
      vi.clearAllMocks()
      resetNewAccountStateForTest()
      goto(`/dashboard?is_new_account=${encodeURIComponent(value)}`)
      captureNewAccountFlag()
      expect(window.location.search).toBe('')
      flushNewAccountSignUp()
      expect(trackEvent).not.toHaveBeenCalled()
    }
  })

  it('没有该参数时不动地址栏、不发事件', () => {
    goto('/dashboard?tab=usage')
    captureNewAccountFlag()
    expect(window.location.search).toBe('?tab=usage')
    flushNewAccountSignUp()
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('flush 只上报一次：重复调用不会重复记账', () => {
    goto('/dashboard?is_new_account=true')
    captureNewAccountFlag()
    flushNewAccountSignUp()
    flushNewAccountSignUp()
    expect(trackEvent).toHaveBeenCalledTimes(1)
  })

  it('会话没成立（未 flush）就不上报，标记不会自己漏出去', () => {
    goto('/dashboard?is_new_account=true')
    captureNewAccountFlag()
    expect(trackEvent).not.toHaveBeenCalled()
  })

  it('保留 hash 与其它查询参数，不做整串重写', () => {
    goto('/dashboard?redirect=%2Fusage&is_new_account=true#section-2')
    captureNewAccountFlag()
    expect(window.location.pathname).toBe('/dashboard')
    expect(window.location.search).toBe('?redirect=%2Fusage')
    expect(window.location.hash).toBe('#section-2')
  })
})

describe('trackSignUp 判定', () => {
  beforeEach(() => vi.clearAllMocks())

  it('只有 true 才发 sign_up', () => {
    trackSignUp('email_code', true)
    expect(trackEvent).toHaveBeenCalledWith('sign_up', { method: 'email_code' }, { result: 'success' })
  })

  it('false / undefined 一律不发', () => {
    trackSignUp('email_code', false)
    trackSignUp('email_code', undefined)
    expect(trackEvent).not.toHaveBeenCalled()
  })
})
