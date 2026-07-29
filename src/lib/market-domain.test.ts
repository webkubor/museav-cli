import { describe, expect, it } from 'vitest'
import { marketFromHostname, marketLockedByDomain, marketOverrideFromSearch } from '@/lib/market-domain'

describe('marketFromHostname — 域名→市场唯一真源', () => {
  it('modelgo.ai 系域名 = 海外', () => {
    expect(marketFromHostname('console.modelgo.ai')).toBe('global')
    expect(marketFromHostname('modelgo.ai')).toBe('global')
    expect(marketFromHostname('CONSOLE.MODELGO.AI')).toBe('global')
  })

  it('其余域名（含生产/测试/本地）一律国内', () => {
    expect(marketFromHostname('console.modelgo.com')).toBe('china')
    expect(marketFromHostname('console.test.modelgo.com')).toBe('china')
    expect(marketFromHostname('localhost')).toBe('china')
    expect(marketFromHostname('127.0.0.1')).toBe('china')
  })
})

describe('marketLockedByDomain — 生产域名前置锁定品牌/入口（qa#480）', () => {
  it('生产域名锁定:.ai=global、.com=china,platform-config 不得覆盖', () => {
    expect(marketLockedByDomain('console.modelgo.ai')).toBe('global')
    expect(marketLockedByDomain('modelgo.ai')).toBe('global')
    expect(marketLockedByDomain('console.modelgo.com')).toBe('china')
    expect(marketLockedByDomain('doc.modelgo.com')).toBe('china')
  })

  it('测试/本地不锁定(null),保持 platform-config 驱动可切两端(#466)', () => {
    expect(marketLockedByDomain('console.test.modelgo.com')).toBeNull()
    expect(marketLockedByDomain('test.modelgo.ai')).toBeNull()
    expect(marketLockedByDomain('localhost')).toBeNull()
    expect(marketLockedByDomain('127.0.0.1')).toBeNull()
  })
})

describe('marketOverrideFromSearch — 共享测试域名的显式市场', () => {
  it('仅接受已支持的市场值', () => {
    expect(marketOverrideFromSearch('?market=global')).toBe('global')
    expect(marketOverrideFromSearch('?market=china')).toBe('china')
    expect(marketOverrideFromSearch('?market=invalid')).toBeNull()
    expect(marketOverrideFromSearch('')).toBeNull()
  })
})
