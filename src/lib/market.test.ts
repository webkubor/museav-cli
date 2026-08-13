import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getMarket, getMarketQueryOverride } from '@/lib/market'
import { MARKET_OVERRIDE_SESSION_KEY } from '@/lib/storage'

/** market.ts 只读 window.location 的 hostname/search，直接替换成轻量对象即可 */
function setLocation(hostname: string, search = '') {
  Object.defineProperty(window, 'location', {
    value: { hostname, search },
    writable: true,
    configurable: true,
  })
}

const realLocation = window.location

describe('getMarket — test 预览态 query 丢失后与 data-market 同口径（qa#603）', () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => {
    sessionStorage.clear()
    Object.defineProperty(window, 'location', { value: realLocation, writable: true, configurable: true })
  })

  it('非生产域名 + query 丢失 + session 有值 → 保持 global（issue 验收组合）', () => {
    setLocation('console.test.modelgo.com', '')
    sessionStorage.setItem(MARKET_OVERRIDE_SESSION_KEY, 'global')
    expect(getMarket()).toBe('global')
    expect(getMarketQueryOverride()).toBe('global')
  })

  it('非生产域名带 ?market=global → 返回 global 并写入 session（跳转丢 query 后仍可恢复）', () => {
    setLocation('console.test.modelgo.com', '?market=global')
    expect(getMarket()).toBe('global')
    expect(sessionStorage.getItem(MARKET_OVERRIDE_SESSION_KEY)).toBe('global')
  })

  it('清掉 session 后不带 query → 回落 china，预览态不粘死', () => {
    setLocation('console.test.modelgo.com', '')
    expect(getMarket()).toBe('china')
  })

  it('session 存了非法值 → 忽略，按域名探测', () => {
    setLocation('console.test.modelgo.com', '')
    sessionStorage.setItem(MARKET_OVERRIDE_SESSION_KEY, 'mars')
    expect(getMarket()).toBe('china')
  })

  it('生产域名锁定优先：query 与 session 均不得改写市场', () => {
    setLocation('console.modelgo.ai', '?market=china')
    sessionStorage.setItem(MARKET_OVERRIDE_SESSION_KEY, 'china')
    expect(getMarket()).toBe('global')
    expect(getMarketQueryOverride()).toBeNull()

    setLocation('console.modelgo.com', '?market=global')
    sessionStorage.setItem(MARKET_OVERRIDE_SESSION_KEY, 'global')
    expect(getMarket()).toBe('china')
    expect(getMarketQueryOverride()).toBeNull()
  })
})
